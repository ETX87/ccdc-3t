import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { runEtxNhanSuSyncWithState } from "../lib/etxNhanSuSync";

// Trang thai + nut "Dong bo ngay" danh ba ETX (Admin/HCNS). Cron hang ngay goi thang lib, khong qua day.
const etxSync = new Hono<{ Bindings: Env }>();
etxSync.use("*", verifySessionMiddleware, loadUser, requireRole("Admin", "HCNS"));

const trangThai = (db: D1Database) =>
  db.prepare("SELECT last_run_at, last_status, changed_count, tai_khoan_count, last_error FROM etx_sync_state WHERE id = 1").first();

etxSync.get("/status", async (c) => c.json(await trangThai(c.env.DB)));

etxSync.post("/run", async (c) => {
  await runEtxNhanSuSyncWithState(c.env, c.env.DB);
  return c.json(await trangThai(c.env.DB));
});

export default etxSync;
