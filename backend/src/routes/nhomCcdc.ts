import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";

const nhomCcdc = new Hono<{ Bindings: Env }>();
nhomCcdc.use("*", verifySessionMiddleware, loadUser);

nhomCcdc.get("/", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, ten_nhom, bat_tat, stt FROM nhom_ccdc ORDER BY stt, ten_nhom").all();
  return c.json({ rows: results });
});

interface Body {
  ten_nhom?: string;
  stt?: number;
  bat_tat?: boolean;
}

nhomCcdc.post("/", requireRole("Admin", "HCNS"), async (c) => {
  const body = await c.req.json<Body>().catch(() => null);
  if (!body?.ten_nhom?.trim()) return c.json({ error: "MISSING_TEN_NHOM" }, 400);
  const result = await c.env.DB.prepare("INSERT INTO nhom_ccdc (ten_nhom, stt) VALUES (?, ?) RETURNING id, ten_nhom, bat_tat, stt")
    .bind(body.ten_nhom.trim(), body.stt ?? 0)
    .first();
  return c.json({ row: result });
});

nhomCcdc.put("/:id", requireRole("Admin", "HCNS"), async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<Body>().catch(() => null);
  if (!body?.ten_nhom?.trim()) return c.json({ error: "MISSING_TEN_NHOM" }, 400);
  // stt / bat_tat khong gui -> giu nguyen (truoc day thieu stt thi bi reset ve 0).
  const result = await c.env.DB.prepare("UPDATE nhom_ccdc SET ten_nhom = ?, stt = COALESCE(?, stt), bat_tat = COALESCE(?, bat_tat) WHERE id = ?")
    .bind(body.ten_nhom.trim(), body.stt ?? null, body.bat_tat == null ? null : body.bat_tat ? 1 : 0, id)
    .run();
  if ((result.meta.changes ?? 0) === 0) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json({ ok: true });
});

nhomCcdc.delete("/:id", requireRole("Admin", "HCNS"), async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("UPDATE nhom_ccdc SET bat_tat = 0 WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

export default nhomCcdc;
