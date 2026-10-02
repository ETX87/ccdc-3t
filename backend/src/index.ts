import { Hono } from "hono";
import type { Env } from "./types";
import auth from "./routes/auth";
import adminUsers from "./routes/adminUsers";
import nhomCcdc from "./routes/nhomCcdc";
import ccdc from "./routes/ccdc";
import nhanVien from "./routes/nhanVien";
import phieuGiaoNhan from "./routes/phieuGiaoNhan";
import dotKiemKe from "./routes/dotKiemKe";
import phieuXuLyTs from "./routes/phieuXuLyTs";
import vtTieuHao from "./routes/vtTieuHao";
import phieuChuyenKho from "./routes/phieuChuyenKho";
import kho from "./routes/kho";
import etxSync from "./routes/etxSync";
import { runEtxNhanSuSyncWithState } from "./lib/etxNhanSuSync";
import baoCao from "./routes/baoCao";
import dashboard from "./routes/dashboard";
import dinhKem from "./routes/dinhKem";
import settings from "./routes/settings";
import { chupSoLieu } from "./lib/thongKe";
import { nowVN } from "./lib/vnTime";

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  await next();
});

app.onError((err, c) => {
  const requestId = c.get("requestId");
  console.error(`[${requestId}]`, err);
  return c.json({ error: "INTERNAL_ERROR", requestId }, 500);
});

app.get("/api/health", (c) => c.json({ ok: true }));

app.route("/api/auth", auth);
app.route("/api/admin/users", adminUsers);
app.route("/api/nhom-ccdc", nhomCcdc);
app.route("/api/ccdc", ccdc);
app.route("/api/nhan-vien", nhanVien);
app.route("/api/phieu-giao-nhan", phieuGiaoNhan);
app.route("/api/dot-kiem-ke", dotKiemKe);
app.route("/api/phieu-xu-ly-ts", phieuXuLyTs);
app.route("/api/vt-tieu-hao", vtTieuHao);
app.route("/api/phieu-chuyen-kho", phieuChuyenKho);
app.route("/api/kho", kho);
app.route("/api/etx-sync", etxSync);
app.route("/api/bao-cao", baoCao);
app.route("/api/dashboard", dashboard);
app.route("/api/dinh-kem", dinhKem);
app.route("/api/settings", settings);

app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

// Cron (wrangler.jsonc triggers.crons "0 17 * * *" = 0h moi ngay gio VN):
//   - Hang ngay: chup so lieu tong quan (thong_ke_ngay) cho "% so voi ky truoc".
//   - Dong bo danh ba ETX + tu tao/duyet tai khoan (hang ngay tu 2026-09-30, truoc do chi Chu nhat).
export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(chupSoLieu(env.DB, nowVN().slice(0, 10)).catch((e) => console.error("[chupSoLieu]", e)));
    // Dong bo ETX + tu tao tai khoan HANG NGAY (0h VN) - truoc 2026-09-30 chi chay Chu nhat.
    ctx.waitUntil(runEtxNhanSuSyncWithState(env, env.DB));
  },
} satisfies ExportedHandler<Env>;
