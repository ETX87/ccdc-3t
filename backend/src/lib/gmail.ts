import type { Env } from "../types";
import { decryptSecret } from "./secretBox";

// Gui email qua Gmail API bang 1 tai khoan Google THAT do Admin ket noi (scope gmail.send - chi gui, khong doc hop thu).
// Cung co che OAuth voi Google Drive (routes/settings.ts): luu refresh_token ma hoa trong gmail_oauth, moi lan gui doi
// lay access_token moi. Thu gui "tu" chinh dia chi da ket noi.

export class LoiGmail extends Error {
  constructor(
    public code: "GMAIL_CHUA_KET_NOI" | "GMAIL_LOI",
    message: string,
  ) {
    super(message);
  }
}

export interface TepDinhKem {
  ten: string;
  mime: string;
  data: Uint8Array;
}

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const b64Utf8 = (s: string) => base64(new TextEncoder().encode(s));
/** Base64 cat dong 76 ky tu (RFC 2045). */
const catDong = (s: string) => s.replace(/.{1,76}/g, "$&\r\n");
/** Tieu de / ten tep co dau: encoded-word RFC 2047. */
const maHoaTieuDe = (s: string) => `=?UTF-8?B?${b64Utf8(s)}?=`;

export function taoMime(o: { tu: string; den: string[]; tieuDe: string; html: string; dinhKem?: TepDinhKem[] }): string {
  const ranh = `ccdc-${crypto.randomUUID()}`;
  const ranhAlt = `${ranh}-alt`;
  const text = "Báo cáo định kỳ hệ thống Quản lý CCDC. Vui lòng mở email ở chế độ HTML để xem đầy đủ.";
  const dong = [
    `From: ${maHoaTieuDe("Hệ thống CCDC")} <${o.tu}>`,
    `To: ${o.den.join(", ")}`,
    `Subject: ${maHoaTieuDe(o.tieuDe)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${ranh}"`,
    "",
    `--${ranh}`,
    `Content-Type: multipart/alternative; boundary="${ranhAlt}"`,
    "",
    `--${ranhAlt}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    catDong(b64Utf8(text)),
    `--${ranhAlt}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    catDong(b64Utf8(o.html)),
    `--${ranhAlt}--`,
  ];
  for (const f of o.dinhKem ?? []) {
    const ten = /^[\x20-\x7e]+$/.test(f.ten) ? f.ten.replace(/"/g, "") : maHoaTieuDe(f.ten);
    dong.push(
      `--${ranh}`,
      `Content-Type: ${f.mime}; name="${ten}"`,
      `Content-Disposition: attachment; filename="${ten}"`,
      "Content-Transfer-Encoding: base64",
      "",
      catDong(base64(f.data)),
    );
  }
  dong.push(`--${ranh}--`, "");
  return dong.join("\r\n");
}

async function layAccessToken(env: Env, db: D1Database): Promise<{ accessToken: string; email: string }> {
  const row = await db.prepare("SELECT google_email, refresh_token_enc FROM gmail_oauth WHERE id = 1").first<{ google_email: string; refresh_token_enc: string }>();
  if (!row) throw new LoiGmail("GMAIL_CHUA_KET_NOI", "Chưa kết nối tài khoản Gmail gửi báo cáo.");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: await decryptSecret(env, row.refresh_token_enc),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new LoiGmail("GMAIL_LOI", `Làm mới token Gmail lỗi ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return { accessToken: ((await res.json()) as { access_token: string }).access_token, email: row.google_email };
}

/** Gui 1 thu toi danh sach nguoi nhan. Tra ve id thu Gmail. */
export async function guiGmail(env: Env, db: D1Database, o: { den: string[]; tieuDe: string; html: string; dinhKem?: TepDinhKem[] }): Promise<string> {
  const { accessToken, email } = await layAccessToken(env, db);
  const raw = base64(new TextEncoder().encode(taoMime({ ...o, tu: email })))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new LoiGmail("GMAIL_LOI", `Gmail gửi lỗi ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return ((await res.json()) as { id: string }).id;
}
