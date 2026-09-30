import type { Context, Next } from "hono";
import type { Env } from "../types";

// Khoa 1 route chi cho Admin (duyet tai khoan, duyet thanh ly...) - dat SAU verifySessionMiddleware
// + loadUser trong chuoi middleware cua route.
export async function requireAdmin(c: Context<{ Bindings: Env }>, next: Next) {
  const user = c.get("user");
  if (user.vai_tro !== "Admin") return c.json({ error: "FORBIDDEN" }, 403);
  await next();
}
