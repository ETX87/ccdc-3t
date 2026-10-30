import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireAdmin } from "../middleware/requireAdmin";
import { encryptSecret } from "../lib/secretBox";
import { nowVN } from "../lib/vnTime";

// Ket noi Google Drive OAuth (Admin, 1 lan) de luu hoa don / chung tu / anh bang chung - port tu
// vi-pham-app backend/src/routes/settings.ts. Dung chung GOOGLE_CLIENT_ID/SECRET voi dang nhap; redirect URI
// `<origin>/api/settings/google-drive/callback` PHAI duoc them vao Google Cloud Console > OAuth Client.
const settings = new Hono<{ Bindings: Env }>();
settings.use("*", verifySessionMiddleware, loadUser, requireAdmin);

const STATE_COOKIE = "ccdc_drive_oauth_state";
// drive.file: chi thay/sua tep do CHINH app tao, khong xin quyen toan bo Drive.
const SCOPE = "https://www.googleapis.com/auth/drive.file openid email profile";
const TEN_THU_MUC = "CCDC 3T - Hoa don, chung tu, anh bang chung";

settings.get("/google-drive/status", async (c) => {
  const row = await c.env.DB.prepare("SELECT google_email, folder_id, authorized_by, authorized_at FROM google_drive_oauth WHERE id = 1").first<{
    google_email: string;
    folder_id: string;
    authorized_by: string | null;
    authorized_at: string;
  }>();
  const tong = await c.env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(kich_thuoc), 0) AS dung_luong FROM dinh_kem WHERE da_xoa = 0").first<{ n: number; dung_luong: number }>();
  if (!row) return c.json({ connected: false, so_tep: tong?.n ?? 0, dung_luong: tong?.dung_luong ?? 0 });
  return c.json({ connected: true, ...row, so_tep: tong?.n ?? 0, dung_luong: tong?.dung_luong ?? 0 });
});

settings.get("/google-drive/authorize", async (c) => {
  const state = crypto.randomUUID();
  setCookie(c, STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "Lax", maxAge: 600, path: "/" });
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${new URL(c.req.url).origin}/api/settings/google-drive/callback`,
    response_type: "code",
    scope: SCOPE,
    state,
    // 2 co nay de LUON nhan refresh_token (thieu thi Google chi tra o lan uy quyen dau tien).
    access_type: "offline",
    prompt: "consent select_account",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

settings.get("/google-drive/callback", async (c) => {
  const url = new URL(c.req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: "/" });
  if (!code || !state || !savedState || state !== savedState) return c.text("Xac thuc that bai: state khong hop le.", 400);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/api/settings/google-drive/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return c.text("Khong the doi ma xac thuc voi Google: " + (await tokenRes.text()), 502);
  const tokenJson = (await tokenRes.json()) as { access_token: string; refresh_token?: string };
  if (!tokenJson.refresh_token) {
    return c.text(
      "Google khong tra ve refresh_token - vao myaccount.google.com/permissions, go quyen truy cap cua app nay roi ket noi lai.",
      400,
    );
  }

  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${tokenJson.access_token}` } });
  if (!userInfoRes.ok) return c.text("Khong the lay thong tin nguoi dung tu Google.", 502);
  const { email } = (await userInfoRes.json()) as { email: string };

  const folderRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenJson.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: TEN_THU_MUC, mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!folderRes.ok) return c.text("Khong the tao thu muc Drive: " + (await folderRes.text()), 502);
  const { id: folderId } = (await folderRes.json()) as { id: string };

  await c.env.DB.prepare(
    `INSERT INTO google_drive_oauth (id, google_email, refresh_token_enc, folder_id, authorized_by, authorized_at)
     VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET google_email = excluded.google_email, refresh_token_enc = excluded.refresh_token_enc,
       folder_id = excluded.folder_id, authorized_by = excluded.authorized_by, authorized_at = excluded.authorized_at`,
  )
    .bind(email, await encryptSecret(c.env, tokenJson.refresh_token), folderId, c.get("user").email, nowVN())
    .run();

  return c.redirect(c.env.FRONTEND_URL || "/");
});

// ---- Tai khoan Gmail GUI bao cao dinh ky (2026-10-30, migration 0021) - rieng voi Drive: co the dung 1 hop thu khac.
// Redirect URI `<origin>/api/settings/gmail/callback` PHAI them vao OAuth Client; Gmail API phai BAT trong Google Cloud
// project cua client (APIs & Services > Library > Gmail API).
const GMAIL_STATE = "ccdc_gmail_oauth_state";
// gmail.send: chi gui thu, khong doc hop thu.
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send openid email";

settings.get("/gmail/authorize", async (c) => {
  const state = crypto.randomUUID();
  setCookie(c, GMAIL_STATE, state, { httpOnly: true, secure: true, sameSite: "Lax", maxAge: 600, path: "/" });
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${new URL(c.req.url).origin}/api/settings/gmail/callback`,
    response_type: "code",
    scope: GMAIL_SCOPE,
    state,
    access_type: "offline",
    prompt: "consent select_account",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

settings.get("/gmail/callback", async (c) => {
  const url = new URL(c.req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = getCookie(c, GMAIL_STATE);
  deleteCookie(c, GMAIL_STATE, { path: "/" });
  if (!code || !state || !savedState || state !== savedState) return c.text("Xac thuc that bai: state khong hop le.", 400);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/api/settings/gmail/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return c.text("Khong the doi ma xac thuc voi Google: " + (await tokenRes.text()), 502);
  const tokenJson = (await tokenRes.json()) as { access_token: string; refresh_token?: string; scope?: string };
  if (!tokenJson.refresh_token) {
    return c.text("Google khong tra ve refresh_token - vao myaccount.google.com/permissions, go quyen truy cap cua app nay roi ket noi lai.", 400);
  }
  if (!tokenJson.scope?.includes("gmail.send")) return c.text("Chua cap quyen gui email (gmail.send) - ket noi lai va tich chon quyen gui thu.", 400);
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${tokenJson.access_token}` } });
  if (!userInfoRes.ok) return c.text("Khong the lay thong tin nguoi dung tu Google.", 502);
  const { email } = (await userInfoRes.json()) as { email: string };

  await c.env.DB.prepare(
    `INSERT INTO gmail_oauth (id, google_email, refresh_token_enc, authorized_by, authorized_at) VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET google_email = excluded.google_email, refresh_token_enc = excluded.refresh_token_enc,
       authorized_by = excluded.authorized_by, authorized_at = excluded.authorized_at`,
  )
    .bind(email, await encryptSecret(c.env, tokenJson.refresh_token), c.get("user").email, nowVN())
    .run();
  // ?mo= : frontend mo thang man Bao cao email sau khi quay ve.
  return c.redirect(`${c.env.FRONTEND_URL || ""}/?mo=bao-cao-email`);
});

settings.delete("/gmail", async (c) => {
  await c.env.DB.prepare("DELETE FROM gmail_oauth WHERE id = 1").run();
  return c.json({ ok: true });
});

export default settings;
