import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { nowVN } from "../lib/vnTime";
import { congTyLoc, congTyTao, laHcns } from "../lib/quyen";
import { danhGiaTon, tonVatTu } from "../lib/tonToiThieu";

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
    `SELECT v.id, v.ten_vt, v.nhom_id, n.ten_nhom, v.don_vi_tinh, v.don_gia_tham_khao, v.cong_ty_id, v.ton_toi_thieu, v.thoi_gian_dat_hang
     FROM vt_tieu_hao v LEFT JOIN nhom_ccdc n ON n.id = v.nhom_id
     WHERE ${conditions.join(" AND ")} ORDER BY v.ten_vt`,
  )
    .bind(...binds)
    .all<{ id: string; ton_toi_thieu: number | null }>();
  // ?kem_ton=1 (man Danh muc vat tu): tong ton cong ty (gom hang dang chuyen) + danh gia so voi ton toi thieu.
  if (c.req.query("kem_ton") === "1") {
    const ton = await tonVatTu(c.env.DB, congTyLoc(c.get("user"), c.req.query("cong_ty_id")), false);
    return c.json({
      rows: results.map((r) => {
        const sl = ton.get(r.id) ?? 0;
        return { ...r, ton: sl, ...danhGiaTon(sl, r.ton_toi_thieu) };
      }),
    });
  }
  return c.json({ rows: results });
});

interface Body {
  id?: string;
  ten_vt?: string;
  nhom_id?: number | null;
  don_vi_tinh?: string | null;
  don_gia_tham_khao?: number | null;
  cong_ty_id?: number;
  ton_toi_thieu?: number | null;
  thoi_gian_dat_hang?: string | null;
}

/** Ton toi thieu: so >= 0 (0 / rong = khong quy dinh -> NULL). undefined = loi dinh dang. */
function soToiThieu(v: unknown): number | null | undefined {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n > 0 ? n : null;
}
const ghiChuDatHang = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null);

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
  const toiThieu = soToiThieu(body.ton_toi_thieu);
  if (toiThieu === undefined) return c.json({ error: "TON_TOI_THIEU_KHONG_HOP_LE" }, 400);

  // Sinh ma NGAY TRONG lenh INSERT (1 cau lenh = nguyen tu, 2 nguoi them cung luc khong trung so); trung PK hiem
  // hoi (vd ma cu trung dang) -> thu lai vai lan.
  const tienTo = await tienToMa(c.env.DB, congTyId);
  for (let lan = 0; lan < 3; lan++) {
    try {
      const row = await c.env.DB.prepare(
        `INSERT INTO vt_tieu_hao (id, ten_vt, nhom_id, don_vi_tinh, don_gia_tham_khao, nguoi_tao, cong_ty_id, created_at, updated_at, ton_toi_thieu, thoi_gian_dat_hang)
         VALUES (${SO_TIEP("id")}, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?9, ?10) RETURNING id`,
      )
        .bind(tienTo, body.ten_vt.trim(), body.nhom_id ?? null, body.don_vi_tinh ?? null, body.don_gia_tham_khao ?? null, user.email, congTyId, nowVN(), toiThieu, ghiChuDatHang(body.thoi_gian_dat_hang))
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
  const toiThieu = soToiThieu(body.ton_toi_thieu);
  if (toiThieu === undefined) return c.json({ error: "TON_TOI_THIEU_KHONG_HOP_LE" }, 400);

  // Khong gui ton_toi_thieu / thoi_gian_dat_hang (client cu) -> giu nguyen.
  const coToiThieu = "ton_toi_thieu" in body ? 1 : 0;
  const coDatHang = "thoi_gian_dat_hang" in body ? 1 : 0;
  const result = await c.env.DB.prepare(
    `UPDATE vt_tieu_hao SET ten_vt = ?, nhom_id = ?, don_vi_tinh = ?, don_gia_tham_khao = ?, updated_at = ?,
       ton_toi_thieu = CASE WHEN ? THEN ? ELSE ton_toi_thieu END, thoi_gian_dat_hang = CASE WHEN ? THEN ? ELSE thoi_gian_dat_hang END
     WHERE id = ?`,
  )
    .bind(body.ten_vt.trim(), body.nhom_id ?? null, body.don_vi_tinh ?? null, body.don_gia_tham_khao ?? null, nowVN(), coToiThieu, toiThieu, coDatHang, ghiChuDatHang(body.thoi_gian_dat_hang), id)
    .run();
  if ((result.meta.changes ?? 0) === 0) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json({ ok: true });
});

// POST /ton-toi-thieu/import { cong_ty_id, dong: [{ dong, ten, dvt?, ton_toi_thieu, ghi_chu?, vt_id? }], thuc_hien? }
// Nhap ton toi thieu hang loat tu Excel (mau "TON KHO TOI THIEU.xlsx": ten CCDC, DVT, ton toi thieu, ghi chu thoi gian
// dat hang). Khop ten trong danh muc cong ty: trung khop nguyen van (chuan hoa) truoc, roi bo dau; nhieu vat tu cung ten ->
// loc them theo DVT. Dong chua khop / khop nhieu: client chon tay vt_id. thuc_hien = true -> ghi moi dong da xac dinh
// duoc vat tu (1 db.batch); khong thi chi xem truoc.
const boDau = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

vtTieuHao.post("/ton-toi-thieu/import", requireRole("Admin", "HCNS"), async (c) => {
  const user = c.get("user");
  const body = await c.req
    .json<{ cong_ty_id?: number; thuc_hien?: boolean; dong?: { dong: number; ten?: string; dvt?: string; ton_toi_thieu?: unknown; ghi_chu?: string; vt_id?: string }[] }>()
    .catch(() => null);
  const congTyId = congTyTao(user, body?.cong_ty_id);
  if (!congTyId || !laHcns(user, congTyId)) return c.json({ error: "CHON_CONG_TY" }, 400);
  const dong = (body?.dong ?? []).filter((d) => d && (d.ten?.trim() || d.vt_id));
  if (!dong.length || dong.length > 2000) return c.json({ error: "FILE_RONG" }, 400);

  const { results: vts } = await c.env.DB.prepare(
    "SELECT id, ten_vt, don_vi_tinh, ton_toi_thieu, thoi_gian_dat_hang FROM vt_tieu_hao WHERE vo_hieu_hoa = 0 AND cong_ty_id = ?",
  )
    .bind(congTyId)
    .all<{ id: string; ten_vt: string; don_vi_tinh: string | null; ton_toi_thieu: number | null; thoi_gian_dat_hang: string | null }>();
  const theoId = new Map(vts.map((v) => [v.id, v]));
  const chuan = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

  const kq = dong.map((d) => {
    const ten = (d.ten ?? "").trim();
    const toiThieu = soToiThieu(d.ton_toi_thieu);
    let ung: typeof vts = [];
    if (d.vt_id) ung = theoId.has(d.vt_id) ? [theoId.get(d.vt_id)!] : [];
    else {
      ung = vts.filter((v) => chuan(v.ten_vt) === chuan(ten));
      if (!ung.length) ung = vts.filter((v) => boDau(v.ten_vt) === boDau(ten));
      if (ung.length > 1 && d.dvt?.trim()) {
        const cungDvt = ung.filter((v) => boDau(v.don_vi_tinh ?? "") === boDau(d.dvt!));
        if (cungDvt.length) ung = cungDvt;
      }
    }
    // Goi y khi chua khop: ten chua nhau (bo dau), toi da 5.
    const k = boDau(ten);
    const goiY =
      ung.length === 1 || !k
        ? []
        : (ung.length > 1 ? ung : vts.filter((v) => boDau(v.ten_vt).includes(k) || k.includes(boDau(v.ten_vt)))).slice(0, 5).map((v) => ({ id: v.id, ten_vt: v.ten_vt, don_vi_tinh: v.don_vi_tinh }));
    const vt = ung.length === 1 ? ung[0] : null;
    return {
      dong: d.dong,
      ten,
      dvt: d.dvt ?? null,
      ton_toi_thieu: toiThieu ?? null,
      ghi_chu: ghiChuDatHang(d.ghi_chu),
      ket_qua: toiThieu === undefined ? "loi_so" : vt ? "khop" : ung.length > 1 ? "nhieu" : "khong_thay",
      vt_id: vt?.id ?? null,
      ten_vt: vt?.ten_vt ?? null,
      don_vi_tinh: vt?.don_vi_tinh ?? null,
      cu: vt ? { ton_toi_thieu: vt.ton_toi_thieu, thoi_gian_dat_hang: vt.thoi_gian_dat_hang } : null,
      goi_y: goiY,
    };
  });

  const ghi = kq.filter((r) => r.ket_qua === "khop");
  // 2 dong cung tro 1 vat tu -> dong sau thang (bao de nguoi dung biet).
  const trung = ghi.filter((r, i) => ghi.findIndex((x) => x.vt_id === r.vt_id) !== i).map((r) => r.dong);
  if (body?.thuc_hien && ghi.length) {
    const now = nowVN();
    await c.env.DB.batch(
      ghi.map((r) =>
        c.env.DB.prepare("UPDATE vt_tieu_hao SET ton_toi_thieu = ?, thoi_gian_dat_hang = COALESCE(?, thoi_gian_dat_hang), updated_at = ? WHERE id = ? AND cong_ty_id = ?").bind(
          r.ton_toi_thieu,
          r.ghi_chu,
          now,
          r.vt_id,
          congTyId,
        ),
      ),
    );
  }
  return c.json({ dong: kq, so_khop: ghi.length, trung, da_ghi: !!body?.thuc_hien });
});

vtTieuHao.delete("/:id", requireRole("Admin", "HCNS"), async (c) => {
  const id = c.req.param("id");
  const q = await vtQuanTri(c.env.DB, c.get("user"), id ?? "");
  if ("error" in q) return c.json({ error: q.error }, q.status);
  await c.env.DB.prepare("UPDATE vt_tieu_hao SET vo_hieu_hoa = 1, updated_at = ? WHERE id = ?").bind(nowVN(), id).run();
  return c.json({ ok: true });
});

export default vtTieuHao;
