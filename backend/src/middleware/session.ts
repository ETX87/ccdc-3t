import type { Context, Next } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { verifySession, signSession } from "../lib/jwt";
import type { Env } from "../types";

// Port tu vi-pham-app/linh-kien-app backend/src/middleware/session.ts - ten cookie rieng cho app
// nay. Cung TTL 72h + gia han sliding-window (khong co ly do doi - cung mo hinh nguoi dung dang
// nhap, lam viec trong ngay).
export const SESSION_COOKIE = "ccdc_session";
export const SESSION_TTL_SECONDS = 72 * 60 * 60;

export async function verifySessionMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ error: "MISSING_TOKEN" }, 401);

  const payload = await verifySession(token, c.env.SESSION_SECRET);
  if (!payload) return c.json({ error: "INVALID_TOKEN" }, 401);

  c.set("email", payload.email);

  // Gia han phien (sliding window): chi ky lai/cap nhat cookie khi thoi gian het han con lai duoi
  // 50% tong thoi gian song (~36h), giam tai tinh toan ma hoa khi nhieu request song song.
  const now = Math.floor(Date.now() / 1000);
  const remaining = payload.exp - now;
  if (remaining < SESSION_TTL_SECONDS / 2) {
    const freshToken = await signSession({ email: payload.email }, c.env.SESSION_SECRET, SESSION_TTL_SECONDS);
    setCookie(c, SESSION_COOKIE, freshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      maxAge: SESSION_TTL_SECONDS,
      path: "/",
    });
  }

  await next();
}
