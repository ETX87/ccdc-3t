import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../types";
import { signSession } from "../lib/jwt";
import { verifySessionMiddleware, SESSION_COOKIE, SESSION_TTL_SECONDS } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { nowVN } from "../lib/vnTime";
import { khoPhuTrach } from "../lib/quyen";

// Port tu vi-pham-app backend/src/routes/auth.ts, rut gon them: khong co doi tac ngoai nao de tu
// dong khop/kich hoat tai khoan (khac ktv_lien_he cua vi-pham-app) - MOI tai khoan moi (tru
// BOOTSTRAP_ADMIN_EMAIL) deu vao hang "Cho duyet", Admin phai duyet tay qua AdminUsersScreen. Dung
// CHUNG Google OAuth Client voi 2 app kia (GOOGLE_CLIENT_ID/SECRET giong het gia tri, rieng
// GOOGLE_REDIRECT_URI tro ve .../api/auth/callback cua CHINH ccdc-app).
const STATE_COOKIE = "ccdc_oauth_state";

const auth = new Hono<{ Bindings: Env }>();

auth.get("/login", async (c) => {
  const state = crypto.randomUUID();
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 600,
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: c.env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

auth.get("/callback", async (c) => {
  const url = new URL(c.req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: "/" });

  if (!code || !state || !savedState || state !== savedState) {
    return c.text("Xac thuc that bai: state khong hop le.", 400);
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: c.env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return c.text("Khong the doi ma xac thuc voi Google.", 502);
  const tokenJson = (await tokenRes.json()) as { access_token: string };

  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userInfoRes.ok) return c.text("Khong the lay thong tin nguoi dung tu Google.", 502);
  const userInfo = (await userInfoRes.json()) as { email: string; email_verified: boolean; name?: string; picture?: string };

  if (!userInfo.email_verified) return c.text("Email Google chua duoc xac minh.", 403);

  const isBootstrapAdmin = userInfo.email === c.env.BOOTSTRAP_ADMIN_EMAIL;

  await c.env.DB.prepare(
    `INSERT INTO users (email, ten, vai_tro, trang_thai_duyet, anh_dai_dien, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       ten = excluded.ten,
       anh_dai_dien = excluded.anh_dai_dien,
       updated_at = ?`,
  )
    .bind(
      userInfo.email,
      userInfo.name ?? null,
      isBootstrapAdmin ? "Admin" : null,
      isBootstrapAdmin ? "Da duyet" : "Cho duyet",
      userInfo.picture ?? null,
      nowVN(),
      nowVN(),
      nowVN(),
    )
    .run();

  const token = await signSession({ email: userInfo.email }, c.env.SESSION_SECRET, SESSION_TTL_SECONDS);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });

  return c.redirect(c.env.FRONTEND_URL || "/");
});

// GET /api/auth/dev-login - cua sau CHI hoat dong khi LOCAL_DEV_BYPASS_AUTH=true (chi dat trong
// .dev.vars, khong bao gio co tren production). Dang nhap thang vao BOOTSTRAP_ADMIN_EMAIL voi
// vai_tro Admin de test giao dien local day du.
// ?email=<email user da ton tai> - dang nhap DEV thang vao 1 user khac (de test tung vai tro
// Ke toan / HCNS / Quan ly / Nhan vien), van CHI khi LOCAL_DEV_BYPASS_AUTH=true.
auth.get("/dev-login", async (c) => {
  if (c.env.LOCAL_DEV_BYPASS_AUTH !== "true") return c.text("Not found", 404);

  const asEmail = c.req.query("email");
  if (asEmail) {
    const exists = await c.env.DB.prepare("SELECT email FROM users WHERE email = ?").bind(asEmail).first();
    if (!exists) return c.json({ error: "USER_NOT_FOUND" }, 404);
    const t = await signSession({ email: asEmail }, c.env.SESSION_SECRET, SESSION_TTL_SECONDS);
    setCookie(c, SESSION_COOKIE, t, { httpOnly: true, secure: true, sameSite: "Lax", maxAge: SESSION_TTL_SECONDS, path: "/" });
    return c.redirect(c.env.FRONTEND_URL || "/");
  }

  const email = c.env.BOOTSTRAP_ADMIN_EMAIL;
  await c.env.DB.prepare(
    `INSERT INTO users (email, ten, vai_tro, trang_thai_duyet, created_at, updated_at)
     VALUES (?, ?, 'Admin', 'Da duyet', ?, ?)
     ON CONFLICT(email) DO UPDATE SET updated_at = ?`,
  )
    .bind(email, "Dev Admin (local bypass)", nowVN(), nowVN(), nowVN())
    .run();

  const token = await signSession({ email }, c.env.SESSION_SECRET, SESSION_TTL_SECONDS);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });

  return c.redirect(c.env.FRONTEND_URL || "/");
});

auth.post("/logout", async (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

auth.get("/me", verifySessionMiddleware, loadUser, async (c) => {
  const user = c.get("user");
  // Bo sung cho frontend dung de hien menu: kho user duoc thao tac + co nhom cap duoi hay khong.
  const kho = await khoPhuTrach(c.env.DB, user);
  const capDuoi = user.ma_nv
    ? await c.env.DB.prepare("SELECT 1 AS ok FROM nhan_vien WHERE quan_ly_id = ? AND dang_lam_viec = 1 LIMIT 1").bind(user.ma_nv).first()
    : null;
  return c.json({
    user: { ...user, kho_phu_trach: kho.map((k) => ({ id: k.id, ten_kho: k.ten_kho, loai: k.loai, nhan_vien_id: k.nhan_vien_id })), co_cap_duoi: !!capDuoi },
  });
});

export default auth;
