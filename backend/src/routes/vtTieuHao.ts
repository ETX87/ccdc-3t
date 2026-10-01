import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { nowVN } from "../lib/vnTime";

const vtTieuHao = new Hono<{ Bindings: Env }>();
vtTieuHao.use("*", verifySessionMiddleware, loadUser);

vtTieuHao.get("/", async (c) => {
  const search = c.req.query("search")?.trim();
  const conditions = ["v.vo_hieu_hoa = 0"];
  const binds: unknown[] = [];
  if (search) {
    conditions.push("(LOWER(v.id) LIKE LOWER(?) OR LOWER(v.ten_vt) LIKE LOWER(?))");
    binds.push(`%${search}%`, `%${search}%`);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT v.id, v.ten_vt, v.nhom_id, n.ten_nhom, v.don_vi_tinh, v.don_gia_tham_khao
     FROM vt_tieu_hao v LEFT JOIN nhom_ccdc n ON n.id = v.nhom_id
     WHERE ${conditions.join(" AND ")} ORDER BY v.ten_vt`,
  )
    .bind(...binds)
    .all();
  return c.json({ rows: results });
});

interface Body {
  id?: string;
  ten_vt?: string;
  nhom_id?: number | null;
  don_vi_tinh?: string | null;
  don_gia_tham_khao?: number | null;
}

vtTieuHao.post("/", requireRole("Admin", "HCNS"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<Body>().catch(() => null);
  if (!body?.id?.trim() || !body?.ten_vt?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);

  const existing = await c.env.DB.prepare("SELECT id FROM vt_tieu_hao WHERE id = ?").bind(body.id.trim()).first();
  if (existing) return c.json({ error: "ID_EXISTS" }, 409);

  await c.env.DB.prepare(`INSERT INTO vt_tieu_hao (id, ten_vt, nhom_id, don_vi_tinh, don_gia_tham_khao, nguoi_tao, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(body.id.trim(), body.ten_vt.trim(), body.nhom_id ?? null, body.don_vi_tinh ?? null, body.don_gia_tham_khao ?? null, user.email, nowVN(), nowVN())
    .run();

  return c.json({ ok: true, id: body.id.trim() });
});

vtTieuHao.put("/:id", requireRole("Admin", "HCNS"), async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<Body>().catch(() => null);
  if (!body?.ten_vt?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);

  const result = await c.env.DB.prepare(
    `UPDATE vt_tieu_hao SET ten_vt = ?, nhom_id = ?, don_vi_tinh = ?, don_gia_tham_khao = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(body.ten_vt.trim(), body.nhom_id ?? null, body.don_vi_tinh ?? null, body.don_gia_tham_khao ?? null, nowVN(), id)
    .run();
  if ((result.meta.changes ?? 0) === 0) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json({ ok: true });
});

vtTieuHao.delete("/:id", requireRole("Admin", "HCNS"), async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("UPDATE vt_tieu_hao SET vo_hieu_hoa = 1, updated_at = ? WHERE id = ?").bind(nowVN(), id).run();
  return c.json({ ok: true });
});

export default vtTieuHao;
