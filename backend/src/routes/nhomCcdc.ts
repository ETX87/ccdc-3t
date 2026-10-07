import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { congTyLoc, congTyTao, laHcns } from "../lib/quyen";

const nhomCcdc = new Hono<{ Bindings: Env }>();
nhomCcdc.use("*", verifySessionMiddleware, loadUser);

// Danh muc nhom rieng tung cong ty (migration 0014): ?cong_ty_id= (form dang chon cong ty) hoac cac cong ty dang xem.
nhomCcdc.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, ten_nhom, bat_tat, stt, cong_ty_id FROM nhom_ccdc WHERE cong_ty_id IN (SELECT value FROM json_each(?)) ORDER BY stt, ten_nhom",
  )
    .bind(JSON.stringify(congTyLoc(c.get("user"), c.req.query("cong_ty_id"))))
    .all();
  return c.json({ rows: results });
});

interface Body {
  ten_nhom?: string;
  stt?: number;
  bat_tat?: boolean;
  cong_ty_id?: number;
}

async function nhomCuaToi(db: D1Database, user: Parameters<typeof laHcns>[0], id: number) {
  const n = await db.prepare("SELECT cong_ty_id FROM nhom_ccdc WHERE id = ?").bind(id).first<{ cong_ty_id: number }>();
  return n ? laHcns(user, n.cong_ty_id) : null;
}

nhomCcdc.post("/", requireRole("Admin", "HCNS"), async (c) => {
  const body = await c.req.json<Body>().catch(() => null);
  if (!body?.ten_nhom?.trim()) return c.json({ error: "MISSING_TEN_NHOM" }, 400);
  const congTyId = congTyTao(c.get("user"), body.cong_ty_id);
  if (!congTyId) return c.json({ error: "CHON_CONG_TY" }, 400);
  const result = await c.env.DB.prepare(
    "INSERT INTO nhom_ccdc (ten_nhom, stt, cong_ty_id) VALUES (?, ?, ?) RETURNING id, ten_nhom, bat_tat, stt, cong_ty_id",
  )
    .bind(body.ten_nhom.trim(), body.stt ?? 0, congTyId)
    .first();
  return c.json({ row: result });
});

nhomCcdc.put("/:id", requireRole("Admin", "HCNS"), async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<Body>().catch(() => null);
  if (!body?.ten_nhom?.trim()) return c.json({ error: "MISSING_TEN_NHOM" }, 400);
  const ok = await nhomCuaToi(c.env.DB, c.get("user"), id);
  if (ok === null) return c.json({ error: "NOT_FOUND" }, 404);
  if (!ok) return c.json({ error: "FORBIDDEN" }, 403);
  // stt / bat_tat khong gui -> giu nguyen (truoc day thieu stt thi bi reset ve 0).
  const result = await c.env.DB.prepare("UPDATE nhom_ccdc SET ten_nhom = ?, stt = COALESCE(?, stt), bat_tat = COALESCE(?, bat_tat) WHERE id = ?")
    .bind(body.ten_nhom.trim(), body.stt ?? null, body.bat_tat == null ? null : body.bat_tat ? 1 : 0, id)
    .run();
  if ((result.meta.changes ?? 0) === 0) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json({ ok: true });
});

nhomCcdc.delete("/:id", requireRole("Admin", "HCNS"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!(await nhomCuaToi(c.env.DB, c.get("user"), id))) return c.json({ error: "FORBIDDEN" }, 403);
  await c.env.DB.prepare("UPDATE nhom_ccdc SET bat_tat = 0 WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

export default nhomCcdc;
