import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireAdmin } from "../middleware/requireAdmin";
import { nowVN } from "../lib/vnTime";

// Danh muc cong ty (da phap nhan - migration 0014). Moi cong ty quan ly ton kho doc lap: tao cong ty moi
// tu sinh Kho mua hang (nguon ao) + Kho tong HCNS rieng. Chi Admin them / sua; moi nguoi doc duoc cac
// cong ty minh duoc phep (o chon cong ty tren topbar).
const congTy = new Hono<{ Bindings: Env }>();
congTy.use("*", verifySessionMiddleware, loadUser);

congTy.get("/", async (c) => {
  const user = c.get("user");
  const laAdmin = user.vai_tro === "Admin";
  const { results } = await c.env.DB.prepare(
    `SELECT ct.id, ct.ma, ct.ten, ct.mst, ct.dia_chi, ct.mac_dinh, ct.bat_tat,
            (SELECT COUNT(*) FROM kho k WHERE k.cong_ty_id = ct.id AND k.loai != 'Mua hang') AS so_kho,
            (SELECT COUNT(*) FROM nhan_vien nv WHERE nv.cong_ty_id = ct.id AND nv.dang_lam_viec = 1) AS so_nv,
            (SELECT COUNT(*) FROM ccdc x WHERE x.cong_ty_id = ct.id AND x.vo_hieu_hoa = 0) AS so_ts
     FROM cong_ty ct
     WHERE ? = 1 OR ct.id IN (SELECT value FROM json_each(?))
     ORDER BY ct.id`,
  )
    .bind(laAdmin ? 1 : 0, JSON.stringify(user.cong_ty_ids))
    .all();
  return c.json({ rows: results, duoc_phep: user.cong_ty_ids });
});

interface Body {
  ma?: string;
  ten?: string;
  mst?: string | null;
  dia_chi?: string | null;
  mac_dinh?: boolean;
  bat_tat?: boolean;
}

congTy.post("/", requireAdmin, async (c) => {
  const body = await c.req.json<Body>().catch(() => null);
  const ma = body?.ma?.trim().toUpperCase();
  const ten = body?.ten?.trim();
  if (!ma || !ten) return c.json({ error: "MISSING_FIELDS" }, 400);
  const trung = await c.env.DB.prepare("SELECT id FROM cong_ty WHERE ma = ?").bind(ma).first();
  if (trung) return c.json({ error: "MA_CONG_TY_TRUNG" }, 409);
  const now = nowVN();
  const db = c.env.DB;
  // 1 batch: cong ty + 2 kho he thong (lay id cong ty vua tao qua ma - UNIQUE).
  const [row] = await db.batch<{ id: number }>([
    db
      .prepare("INSERT INTO cong_ty (ma, ten, mst, dia_chi, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id")
      .bind(ma, ten, body?.mst?.trim() || null, body?.dia_chi?.trim() || null, now, now),
    db
      .prepare(
        `INSERT INTO kho (ten_kho, loai, cong_ty_id, created_at, updated_at)
         SELECT 'Kho mua hàng - ' || ma, 'Mua hang', id, ?, ? FROM cong_ty WHERE ma = ?
         UNION ALL SELECT 'Kho tổng HCNS - ' || ma, 'HCNS', id, ?, ? FROM cong_ty WHERE ma = ?`,
      )
      .bind(now, now, ma, now, now, ma),
  ]);
  return c.json({ ok: true, id: row.results[0]?.id });
});

congTy.put("/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<Body>().catch(() => null);
  const ten = body?.ten?.trim();
  if (!ten) return c.json({ error: "MISSING_FIELDS" }, 400);
  const ct = await c.env.DB.prepare("SELECT id, mac_dinh FROM cong_ty WHERE id = ?").bind(id).first<{ mac_dinh: number }>();
  if (!ct) return c.json({ error: "NOT_FOUND" }, 404);
  const tat = body?.bat_tat === false;
  // Cong ty mac dinh (nhan nhan su ETX moi) khong tat duoc - chon cong ty mac dinh khac truoc.
  if (tat && (ct.mac_dinh || body?.mac_dinh)) return c.json({ error: "KHONG_TAT_CONG_TY_MAC_DINH" }, 400);
  const now = nowVN();
  const db = c.env.DB;
  const lenh = [
    db
      .prepare("UPDATE cong_ty SET ten = ?, mst = ?, dia_chi = ?, bat_tat = ?, updated_at = ? WHERE id = ?")
      .bind(ten, body?.mst?.trim() || null, body?.dia_chi?.trim() || null, tat ? 0 : 1, now, id),
  ];
  if (body?.mac_dinh) lenh.push(db.prepare("UPDATE cong_ty SET mac_dinh = CASE WHEN id = ? THEN 1 ELSE 0 END, updated_at = ?").bind(id, now));
  await db.batch(lenh);
  return c.json({ ok: true });
});

export default congTy;
