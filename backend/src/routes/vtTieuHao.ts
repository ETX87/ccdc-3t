import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { nowVN } from "../lib/vnTime";
import { congTyLoc, congTyTao, laHcns } from "../lib/quyen";

const vtTieuHao = new Hono<{ Bindings: Env }>();
vtTieuHao.use("*", verifySessionMiddleware, loadUser);

vtTieuHao.get("/", async (c) => {
  const search = c.req.query("search")?.trim();
  // Danh muc rieng tung cong ty: ?cong_ty_id= (form theo kho dang chon) hoac cac cong ty dang xem.
  const conditions = ["v.vo_hieu_hoa = 0", "v.cong_ty_id IN (SELECT value FROM json_each(?))"];
  const binds: unknown[] = [JSON.stringify(congTyLoc(c.get("user"), c.req.query("cong_ty_id")))];
  if (search) {
    conditions.push("(LOWER(v.id) LIKE LOWER(?) OR LOWER(v.ten_vt) LIKE LOWER(?))");
    binds.push(`%${search}%`, `%${search}%`);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT v.id, v.ten_vt, v.nhom_id, n.ten_nhom, v.don_vi_tinh, v.don_gia_tham_khao, v.cong_ty_id
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
  cong_ty_id?: number;
}

/** Nhom phai cung cong ty voi vat tu (danh muc rieng tung cong ty). */
async function nhomHopLe(db: D1Database, nhomId: number | null | undefined, congTyId: number): Promise<boolean> {
  if (nhomId == null) return true;
  return !!(await db.prepare("SELECT 1 AS ok FROM nhom_ccdc WHERE id = ? AND cong_ty_id = ?").bind(nhomId, congTyId).first());
}

async function vtQuanTri(db: D1Database, user: Parameters<typeof laHcns>[0], id: string) {
  const v = await db.prepare("SELECT cong_ty_id FROM vt_tieu_hao WHERE id = ?").bind(id).first<{ cong_ty_id: number }>();
  if (!v) return { error: "NOT_FOUND" as const, status: 404 as const };
  if (!laHcns(user, v.cong_ty_id)) return { error: "FORBIDDEN" as const, status: 403 as const };
  return { congTyId: v.cong_ty_id };
}

// Ma vat tu TU SINH (2026-10-16, user yeu cau): "TS<ma cong ty>-" + 6 chu so, so tiep theo = max cac ma cung dang
// trong danh muc (vd TS3T-000344, TSNSKX-000273). Ma cu dang khac (TS3T-c550f9f2, ten tu do...) khong tinh vao day so.
async function tienToMa(db: D1Database, congTyId: number): Promise<string> {
  const ct = await db.prepare("SELECT ma FROM cong_ty WHERE id = ?").bind(congTyId).first<{ ma: string }>();
  return `TS${(ct?.ma ?? String(congTyId)).toUpperCase()}-`;
}
const SO_TIEP = (cot: string) =>
  `?1 || printf('%06d', COALESCE((SELECT MAX(CAST(substr(${cot}, length(?1) + 1) AS INTEGER)) FROM vt_tieu_hao
     WHERE ${cot} GLOB ?1 || '[0-9][0-9][0-9][0-9][0-9][0-9]'), 0) + 1)`;

// GET /ma-tiep-theo?cong_ty_id= - ma se duoc cap (hien truoc o form; ma that cap luc luu, co the khac neu ai vua them).
vtTieuHao.get("/ma-tiep-theo", requireRole("Admin", "HCNS"), async (c) => {
  const congTyId = congTyTao(c.get("user"), c.req.query("cong_ty_id"));
  if (!congTyId) return c.json({ error: "CHON_CONG_TY" }, 400);
  const row = await c.env.DB.prepare(`SELECT ${SO_TIEP("id")} AS ma`).bind(await tienToMa(c.env.DB, congTyId)).first<{ ma: string }>();
  return c.json({ ma: row?.ma });
});

vtTieuHao.post("/", requireRole("Admin", "HCNS"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<Body>().catch(() => null);
  if (!body?.ten_vt?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);
  const congTyId = congTyTao(user, body.cong_ty_id);
  if (!congTyId || !laHcns(user, congTyId)) return c.json({ error: "CHON_CONG_TY" }, 400);
  if (!(await nhomHopLe(c.env.DB, body.nhom_id, congTyId))) return c.json({ error: "NHOM_KHAC_CONG_TY" }, 400);

  // Sinh ma NGAY TRONG lenh INSERT (1 cau lenh = nguyen tu, 2 nguoi them cung luc khong trung so); trung PK hiem
  // hoi (vd ma cu trung dang) -> thu lai vai lan.
  const tienTo = await tienToMa(c.env.DB, congTyId);
  for (let lan = 0; lan < 3; lan++) {
    try {
      const row = await c.env.DB.prepare(
        `INSERT INTO vt_tieu_hao (id, ten_vt, nhom_id, don_vi_tinh, don_gia_tham_khao, nguoi_tao, cong_ty_id, created_at, updated_at)
         VALUES (${SO_TIEP("id")}, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8) RETURNING id`,
      )
        .bind(tienTo, body.ten_vt.trim(), body.nhom_id ?? null, body.don_vi_tinh ?? null, body.don_gia_tham_khao ?? null, user.email, congTyId, nowVN())
        .first<{ id: string }>();
      return c.json({ ok: true, id: row?.id });
    } catch (e) {
      if (!String(e).includes("UNIQUE constraint failed") || lan === 2) throw e;
    }
  }
  return c.json({ error: "ID_EXISTS" }, 409);
});

vtTieuHao.put("/:id", requireRole("Admin", "HCNS"), async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<Body>().catch(() => null);
  if (!body?.ten_vt?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);
  const q = await vtQuanTri(c.env.DB, c.get("user"), id ?? "");
  if ("error" in q) return c.json({ error: q.error }, q.status);
  if (!(await nhomHopLe(c.env.DB, body.nhom_id, q.congTyId))) return c.json({ error: "NHOM_KHAC_CONG_TY" }, 400);

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
  const q = await vtQuanTri(c.env.DB, c.get("user"), id ?? "");
  if ("error" in q) return c.json({ error: q.error }, q.status);
  await c.env.DB.prepare("UPDATE vt_tieu_hao SET vo_hieu_hoa = 1, updated_at = ? WHERE id = ?").bind(nowVN(), id).run();
  return c.json({ ok: true });
});

export default vtTieuHao;
