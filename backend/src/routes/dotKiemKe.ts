import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { nowVN } from "../lib/vnTime";
import { sinhMaPhieu } from "../lib/maPhieu";

const dotKiemKe = new Hono<{ Bindings: Env }>();
dotKiemKe.use("*", verifySessionMiddleware, loadUser);

dotKiemKe.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT d.*, (SELECT COUNT(*) FROM kiem_ke_ct k WHERE k.dot_kiem_ke_id = d.id) AS so_luong_da_kiem
     FROM dot_kiem_ke d ORDER BY d.created_at DESC`,
  ).all();
  return c.json({ rows: results });
});

dotKiemKe.get("/:id", async (c) => {
  const id = c.req.param("id");
  const dot = await c.env.DB.prepare("SELECT * FROM dot_kiem_ke WHERE id = ?").bind(id).first();
  if (!dot) return c.json({ error: "NOT_FOUND" }, 404);

  const { results: items } = await c.env.DB.prepare(
    `SELECT k.id, k.ccdc_id, c.ten_ccdc, c.trang_thai_hien_tai, c.nguoi_dang_giu AS he_thong_nguoi_giu,
            nv.ten_nv AS he_thong_nguoi_giu_ten,
            k.tinh_trang_thuc_te, k.nguoi_dang_giu_thuc_te, nv2.ten_nv AS nguoi_dang_giu_thuc_te_ten,
            k.ghi_chu, k.nguoi_kiem_ke, k.kiem_ke_luc
     FROM kiem_ke_ct k
     JOIN ccdc c ON c.id = k.ccdc_id
     LEFT JOIN nhan_vien nv ON nv.ma_nv = c.nguoi_dang_giu
     LEFT JOIN nhan_vien nv2 ON nv2.ma_nv = k.nguoi_dang_giu_thuc_te
     WHERE k.dot_kiem_ke_id = ?
     ORDER BY k.kiem_ke_luc DESC`,
  )
    .bind(id)
    .all();

  return c.json({ row: dot, items });
});

interface CreateBody {
  ten_dot?: string;
  ngay_bat_dau?: string;
}

dotKiemKe.post("/", requireRole("Admin", "HCNS"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<CreateBody>().catch(() => null);
  if (!body?.ten_dot?.trim() || !body?.ngay_bat_dau?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);

  const id = crypto.randomUUID();
  const ngay = nowVN();
  const db = c.env.DB;
  await db.batch([
    db
      .prepare(`INSERT INTO dot_kiem_ke (id, ten_dot, ngay_bat_dau, nguoi_tao, created_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(id, body.ten_dot.trim(), body.ngay_bat_dau.trim(), user.email, ngay),
    ...sinhMaPhieu(db, "dot_kiem_ke", id, "KK", ngay),
  ]);

  return c.json({ ok: true, id });
});

interface GhiNhanBody {
  ccdc_id?: string;
  tinh_trang_thuc_te?: string;
  nguoi_dang_giu_thuc_te?: string;
  ghi_chu?: string;
}

// POST /:id/ghi-nhan - chi GHI LOG chenh lech, KHONG dung tu duong nao sua ccdc (muc 7.2).
dotKiemKe.post("/:id/ghi-nhan", requireRole("Admin", "HCNS"), async (c) => {
  const user = c.get("user");
  const dotId = c.req.param("id");
  const body = await c.req.json<GhiNhanBody>().catch(() => null);
  if (!body?.ccdc_id || !body?.tinh_trang_thuc_te) return c.json({ error: "MISSING_FIELDS" }, 400);

  const dot = await c.env.DB.prepare("SELECT trang_thai FROM dot_kiem_ke WHERE id = ?").bind(dotId).first<{ trang_thai: string }>();
  if (!dot) return c.json({ error: "NOT_FOUND" }, 404);
  if (dot.trang_thai !== "Dang thuc hien") return c.json({ error: "DOT_DA_HOAN_TAT" }, 400);

  const ccdcExists = await c.env.DB.prepare("SELECT id FROM ccdc WHERE id = ?").bind(body.ccdc_id).first();
  if (!ccdcExists) return c.json({ error: "CCDC_NOT_FOUND" }, 400);

  await c.env.DB.prepare(
    `INSERT INTO kiem_ke_ct (dot_kiem_ke_id, ccdc_id, tinh_trang_thuc_te, nguoi_dang_giu_thuc_te, ghi_chu, nguoi_kiem_ke, kiem_ke_luc)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(dotId, body.ccdc_id, body.tinh_trang_thuc_te, body.nguoi_dang_giu_thuc_te ?? null, body.ghi_chu ?? null, user.email, nowVN())
    .run();

  return c.json({ ok: true });
});

dotKiemKe.post("/:id/hoan-tat", requireRole("Admin", "HCNS"), async (c) => {
  const id = c.req.param("id");
  const result = await c.env.DB.prepare(
    `UPDATE dot_kiem_ke SET trang_thai = 'Da hoan tat', ngay_ket_thuc = ? WHERE id = ? AND trang_thai = 'Dang thuc hien'`,
  )
    .bind(nowVN(), id)
    .run();
  if ((result.meta.changes ?? 0) === 0) return c.json({ error: "NOT_FOUND_OR_DA_HOAN_TAT" }, 400);
  return c.json({ ok: true });
});

export default dotKiemKe;
