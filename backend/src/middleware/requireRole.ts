import type { Context, Next } from "hono";
import type { Env, VaiTro } from "../types";

// Port tu linh-kien-app backend/src/middleware/requireRole.ts. Nhan vien (vai_tro = NULL) khong
// bao gio nam trong allowedRoles - dung requireAdmin/requireRole rieng cho tung route can gioi han.
export function requireRole(...allowedRoles: VaiTro[]) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const user = c.get("user");
    if (!user.vai_tro || !allowedRoles.includes(user.vai_tro)) {
      return c.json({ error: "FORBIDDEN_ROLE" }, 403);
    }
    await next();
  };
}
