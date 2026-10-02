import type { Env } from "../types";
import { decryptSecret } from "./secretBox";

// Tai tep (anh hoa don, chung tu, anh bang chung) len Google Drive qua OAuth uy quyen 1 tai khoan Google THAT
// - port tu vi-pham-app backend/src/lib/googleDrive.ts (skill qlbh3t-cf-integrations phan 1). Tep duoc chia
// se "anyone with link" de nhung <img> thumbnail truc tiep, nguoi xem khong can dang nhap Google.

export class LoiDrive extends Error {
  constructor(
    public code: "DRIVE_CHUA_KET_NOI" | "DRIVE_LOI",
    message: string,
  ) {
    super(message);
  }
}

function buildMultipartBody(metadata: Record<string, unknown>, bytes: ArrayBuffer, mimeType: string, boundary: string): Uint8Array {
  // multipart/related thu cong (Drive KHONG nhan multipart/form-data cua FormData) - JSON metadata roi
  // den binary, ngan cach boundary theo RFC 2387.
  const encoder = new TextEncoder();
  const preamble = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const closing = encoder.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(preamble.byteLength + bytes.byteLength + closing.byteLength);
  body.set(preamble, 0);
  body.set(new Uint8Array(bytes), preamble.byteLength);
  body.set(closing, preamble.byteLength + bytes.byteLength);
  return body;
}

async function getUserAccessToken(env: Env, db: D1Database): Promise<{ accessToken: string; folderId: string }> {
  const row = await db
    .prepare("SELECT refresh_token_enc, folder_id FROM google_drive_oauth WHERE id = 1")
    .first<{ refresh_token_enc: string; folder_id: string }>();
  if (!row) throw new LoiDrive("DRIVE_CHUA_KET_NOI", "Chua ket noi Google Drive - Admin vao Cau hinh de ket noi.");

  const refreshToken = await decryptSecret(env, row.refresh_token_enc);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new LoiDrive("DRIVE_LOI", `Google Drive token refresh failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string };
  return { accessToken: json.access_token, folderId: row.folder_id };
}

/** Tai 1 tep len thu muc cua app tren Drive + chia se cong khai bang link. Tra drive file id. */
export async function uploadPublicFile(env: Env, db: D1Database, bytes: ArrayBuffer, mimeType: string, filename: string): Promise<string> {
  const { accessToken, folderId } = await getUserAccessToken(env, db);
  const boundary = `ccdc-${crypto.randomUUID()}`;
  const body = buildMultipartBody({ name: filename, parents: [folderId] }, bytes, mimeType, boundary);

  const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!uploadRes.ok) throw new LoiDrive("DRIVE_LOI", `Google Drive upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  const { id } = (await uploadRes.json()) as { id: string };

  const permRes = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/permissions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  if (!permRes.ok) throw new LoiDrive("DRIVE_LOI", `Google Drive set-public failed: ${permRes.status} ${await permRes.text()}`);
  return id;
}
