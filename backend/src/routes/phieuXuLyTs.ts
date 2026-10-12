import { Hono, type Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { nowVN } from "../lib/vnTime";
import { coCongTy, laHcns, laKeToan, laNguoiLap, laThuKho, trongNhom } from "../lib/quyen";
import { sinhMaPhieu, TIEN_TO_XU_LY } from "../lib/maPhieu";
import { dkTaiSan, layPhamVi } from "../lib/phamVi";

// Phieu xu ly TAI SAN CO DINH can Ke toan duyet (thay phieu_thanh_ly, quyet dinh user 2026-09-23):
//   Nhap mua : TS moi tao ('Cho duyet nhap') -> KT duyet -> 'Trong kho' tai kho HCNS; tu choi -> vo hieu hoa.
//   Bao hong : nguoi giu / QL nhom / thu kho / HCNS lap -> 'Cho duyet bao hong' -> KT duyet -> 'Hong',
//              thu ve kho HCNS; tu choi -> hoan trang thai cu.
//   Thanh ly / Tieu huy: HCNS de xuat TS dang trong kho ('Trong kho'/'Hong') -> KT duyet -> HCNS xu ly
//              vat ly xong bam hoan tat -> 'Da thanh ly'/'Da tieu huy'; tu choi -> hoan trang thai cu.
const phieuXuLyTs = new Hono<{ Bindings: Env }>();
phieuXuLyTs.use("*", verifySessionMiddleware, loadUser);

type Loai = "Nhap mua" | "Bao hong" | "Thanh ly" | "Tieu huy";
const LOAI: Loai[] = ["Nhap mua", "Bao hong", "Thanh ly", "Tieu huy"];
const TRANG_THAI_CHO: Record<Loai, string> = {
  "Nhap mua": "Cho duyet nhap",
  "Bao hong": "Cho duyet bao hong",
  "Thanh ly": "Cho thanh ly",
  "Tieu huy": "Cho tieu huy",
};
// Kho HCNS CUA CONG TY TAI SAN (da phap nhan) - noi TS nhap mua / bao hong duoc dua ve. Dung trong
// "UPDATE ccdc SET kho_id = ${KHO_HCNS_CUA_TS}" (tham chieu ccdc.cong_ty_id cua dong dang cap nhat).
const KHO_HCNS_CUA_TS = `(SELECT k.id FROM kho k WHERE k.loai = 'HCNS' AND k.bat_tat = 1 AND k.cong_ty_id = ccdc.cong_ty_id ORDER BY k.id LIMIT 1)`;

/** Cong ty cua phieu = cong ty cac TS trong phieu (1 phieu chi 1 cong ty - kiem luc lap). */
async function congTyPhieu(db: D1Database, phieuId: string): Promise<number | null> {
  const r = await db
    .prepare("SELECT x.cong_ty_id FROM phieu_xu_ly_ts_ct ct JOIN ccdc x ON x.id = ct.ccdc_id WHERE ct.phieu_id = ? LIMIT 1")
    .bind(phieuId)
    .first<{ cong_ty_id: number }>();
  return r?.cong_ty_id ?? null;
}

// GET /?loai=Thanh ly,Tieu huy&trang_thai=&nam= - loai / trang_thai nhan danh sach cach nhau dau phay.
// Pham vi: quan tri xem het; con lai - phieu minh de xuat + phieu co TS thuoc kho / nhom minh.
phieuXuLyTs.get("/", async (c) => {
  const user = c.get("user");
  const pv = await layPhamVi(c.env.DB, user);
  const conditions: string[] = [];
  const binds: unknown[] = [];
  if (!pv.toanBo) {
    const ts = dkTaiSan(pv, "x");
    conditions.push(
      `(p.nguoi_de_xuat = ? OR EXISTS (SELECT 1 FROM phieu_xu_ly_ts_ct ct JOIN ccdc x ON x.id = ct.ccdc_id WHERE ct.phieu_id = p.id AND ${ts.sql}))`,
    );
    binds.push(user.email, ...ts.binds);
  }
  for (const k of ["loai", "trang_thai"] as const) {
    const ds = (c.req.query(k) ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    if (ds.length) {
      conditions.push(`p.${k} IN (${ds.map(() => "?").join(",")})`);
      binds.push(...ds);
    }
  }
  const nam = c.req.query("nam");
  if (nam && /^\d{4}$/.test(nam)) {
    conditions.push("substr(p.ngay_de_xuat, 1, 4) = ?");
    binds.push(nam);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { results } = await c.env.DB.prepare(
    `SELECT p.*, (SELECT COUNT(*) FROM phieu_xu_ly_ts_ct ct WHERE ct.phieu_id = p.id) AS so_luong_ccdc,
            (SELECT group_concat(x.ten_ccdc, '; ') FROM phieu_xu_ly_ts_ct ct JOIN ccdc x ON x.id = ct.ccdc_id WHERE ct.phieu_id = p.id) AS tom_tat,
            (SELECT SUM(COALESCE(x.nguyen_gia, 0)) FROM phieu_xu_ly_ts_ct ct JOIN ccdc x ON x.id = ct.ccdc_id WHERE ct.phieu_id = p.id) AS nguyen_gia
     FROM phieu_xu_ly_ts p ${where} ORDER BY p.created_at DESC LIMIT 500`,
  )
    .bind(...binds)
    .all();
  return c.json({ rows: results });
});

phieuXuLyTs.get("/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM phieu_xu_ly_ts WHERE id = ?").bind(id).first();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  const ct = await congTyPhieu(c.env.DB, id ?? "");
  if (ct != null && !coCongTy(c.get("user"), ct)) return c.json({ error: "FORBIDDEN" }, 403);
  const [{ results: items }, { results: log }] = await Promise.all([
    c.env.DB.prepare(
      `SELECT ct.ccdc_id, x.ten_ccdc, x.nguyen_gia, x.trang_thai_hien_tai, ct.trang_thai_truoc, ct.nguoi_giu_truoc,
              nv.ten_nv AS nguoi_giu_truoc_ten, ct.kho_truoc, k.ten_kho AS kho_truoc_ten
       FROM phieu_xu_ly_ts_ct ct JOIN ccdc x ON x.id = ct.ccdc_id
       LEFT JOIN nhan_vien nv ON nv.ma_nv = ct.nguoi_giu_truoc
       LEFT JOIN kho k ON k.id = ct.kho_truoc
       WHERE ct.phieu_id = ?`,
    )
      .bind(id)
      .all(),
    c.env.DB.prepare(`SELECT trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu FROM phieu_xu_ly_ts_log WHERE phieu_id = ? ORDER BY id ASC`).bind(id).all(),
  ]);
  return c.json({ row, items, log });
});

interface CcdcRow {
  id: string;
  trang_thai_hien_tai: string;
  nguoi_dang_giu: string | null;
  kho_id: number | null;
  cong_ty_id: number;
}

// POST / {loai, ccdc_ids, ly_do, ghi_chu}. Nhap mua chi dung cho TS 'Cho duyet nhap' CHUA nam trong
// phieu nhap mua nao (TS tao qua POST /api/ccdc da tu sinh phieu - route nay de gom nhieu TS 1 phieu).
phieuXuLyTs.post("/", async (c) => {
  const user = c.get("user");
  const db = c.env.DB;
  const body = await c.req.json<{ loai?: Loai; ccdc_ids?: string[]; ly_do?: string; ghi_chu?: string }>().catch(() => null);
  if (!body?.loai || !LOAI.includes(body.loai) || !body.ccdc_ids?.length) return c.json({ error: "MISSING_FIELDS" }, 400);
  if (body.loai !== "Nhap mua" && !body.ly_do?.trim()) return c.json({ error: "CAN_LY_DO" }, 400);
  if (body.loai !== "Bao hong" && !laHcns(user)) return c.json({ error: "CHI_HCNS" }, 403);

  const ids = [...new Set(body.ccdc_ids)];
  const { results: rows } = await db
    .prepare(`SELECT id, trang_thai_hien_tai, nguoi_dang_giu, kho_id, cong_ty_id FROM ccdc WHERE vo_hieu_hoa = 0 AND id IN (SELECT value FROM json_each(?))`)
    .bind(JSON.stringify(ids))
    .all<CcdcRow>();
  if (rows.length !== ids.length) return c.json({ error: "CCDC_NOT_FOUND" }, 400);
  // 1 phieu = 1 cong ty (KT cong ty do duyet); HCNS chi lap cho cong ty minh.
  const congTyId = rows[0].cong_ty_id;
  if (rows.some((r) => r.cong_ty_id !== congTyId)) return c.json({ error: "KHAC_CONG_TY" }, 400);
  if (!coCongTy(user, congTyId)) return c.json({ error: "FORBIDDEN" }, 403);
  if (body.loai !== "Bao hong" && !laHcns(user, congTyId)) return c.json({ error: "CHI_HCNS" }, 403);

  for (const r of rows) {
    if (body.loai === "Nhap mua") {
      if (r.trang_thai_hien_tai !== "Cho duyet nhap") return c.json({ error: "SAI_TRANG_THAI_TS", ccdc_id: r.id }, 400);
      const dangCho = await db
        .prepare(
          `SELECT 1 AS ok FROM phieu_xu_ly_ts_ct ct JOIN phieu_xu_ly_ts p ON p.id = ct.phieu_id
           WHERE ct.ccdc_id = ? AND p.trang_thai = 'Cho ke toan duyet'`,
        )
        .bind(r.id)
        .first();
      if (dangCho) return c.json({ error: "DA_CO_PHIEU_CHO_DUYET", ccdc_id: r.id }, 400);
    } else if (body.loai === "Bao hong") {
      if (!["Trong kho", "Dang cap phat", "Dang bao tri"].includes(r.trang_thai_hien_tai)) {
        return c.json({ error: "SAI_TRANG_THAI_TS", ccdc_id: r.id }, 400);
      }
      // Nguoi duoc bao hong: HCNS/Admin, chinh nguoi giu, QL cua nguoi giu, thu kho dang chua TS.
      let ok = laHcns(user, r.cong_ty_id);
      if (!ok && r.nguoi_dang_giu && user.ma_nv) ok = await trongNhom(db, user.ma_nv, r.nguoi_dang_giu);
      if (!ok && r.kho_id) ok = await laThuKho(db, user, r.kho_id);
      if (!ok) return c.json({ error: "KHONG_CO_QUYEN_BAO_HONG", ccdc_id: r.id }, 403);
    } else {
      // Thanh ly / Tieu huy: chi TS dang nam trong kho (da thu hoi) - khong xu ly TS dang co nguoi giu.
      if (!["Trong kho", "Hong"].includes(r.trang_thai_hien_tai) || r.nguoi_dang_giu) {
        return c.json({ error: "CCDC_KHONG_TRONG_KHO", ccdc_id: r.id }, 400);
      }
    }
  }

  const id = crypto.randomUUID();
  const ngay = nowVN();
  const choState = TRANG_THAI_CHO[body.loai];
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(`INSERT INTO phieu_xu_ly_ts (id, loai, ly_do, ngay_de_xuat, nguoi_de_xuat, ghi_chu, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, body.loai, body.ly_do?.trim() || null, ngay, user.email, body.ghi_chu ?? null, ngay),
    db
      .prepare(`INSERT INTO phieu_xu_ly_ts_log (phieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Cho ke toan duyet', ?, ?, ?)`)
      .bind(id, user.email, ngay, body.ly_do?.trim() || null),
    ...sinhMaPhieu(db, "phieu_xu_ly_ts", id, TIEN_TO_XU_LY[body.loai], ngay),
  ];
  for (const r of rows) {
    stmts.push(
      db
        .prepare(`INSERT INTO phieu_xu_ly_ts_ct (phieu_id, ccdc_id, trang_thai_truoc, nguoi_giu_truoc, kho_truoc) VALUES (?, ?, ?, ?, ?)`)
        .bind(id, r.id, r.trang_thai_hien_tai, r.nguoi_dang_giu, r.kho_id),
      db.prepare(`UPDATE ccdc SET trang_thai_hien_tai = ?, updated_at = ? WHERE id = ?`).bind(choState, ngay, r.id),
    );
  }
  await db.batch(stmts);
  return c.json({ ok: true, id });
});

async function chuyenTrangThai(
  c: Context<{ Bindings: Env }>,
  from: string,
  to: "Da duyet" | "Tu choi" | "Da hoan tat",
  ghiChu: string | null,
  capNhatTs: (p: { loai: Loai }, ct: { ccdc_id: string; trang_thai_truoc: string; nguoi_giu_truoc: string | null; kho_truoc: number | null }, ngay: string) => D1PreparedStatement,
  extra?: D1PreparedStatement[],
) {
  const user = c.get("user");
  const db = c.env.DB;
  const id = c.req.param("id");
  const p = await db.prepare("SELECT loai, trang_thai FROM phieu_xu_ly_ts WHERE id = ?").bind(id).first<{ loai: Loai; trang_thai: string }>();
  if (!p) return c.json({ error: "NOT_FOUND" }, 404);
  if (p.trang_thai !== from) return c.json({ error: "SAI_TRANG_THAI" }, 409);
  const { results: cts } = await db
    .prepare("SELECT ccdc_id, trang_thai_truoc, nguoi_giu_truoc, kho_truoc FROM phieu_xu_ly_ts_ct WHERE phieu_id = ?")
    .bind(id)
    .all<{ ccdc_id: string; trang_thai_truoc: string; nguoi_giu_truoc: string | null; kho_truoc: number | null }>();

  const ngay = nowVN();
  const stmts: D1PreparedStatement[] = [
    db.prepare("UPDATE phieu_xu_ly_ts SET trang_thai = ? WHERE id = ? AND trang_thai = ?").bind(to, id, from),
    // 2 nguoi bam cung luc: UPDATE tren khong doi dong nao -> chot chan loi -> rollback ca batch.
    db.prepare("INSERT INTO batch_guard (x) SELECT changes()"),
    db.prepare("DELETE FROM batch_guard"),
    db
      .prepare(`INSERT INTO phieu_xu_ly_ts_log (phieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)`)
      .bind(id, to, user.email, ngay, ghiChu),
    ...(extra ?? []),
    ...cts.map((ct) => capNhatTs(p, ct, ngay)),
  ];
  try {
    await db.batch(stmts);
  } catch (e) {
    if (String(e).includes("CHECK constraint failed")) return c.json({ error: "SAI_TRANG_THAI" }, 409);
    throw e;
  }
  return c.json({ ok: true });
}

async function docGhiChu(c: Context<{ Bindings: Env }>) {
  const b = await c.req.json<{ ghi_chu?: string; gia_tri_thu_hoi?: number }>().catch(() => ({}) as { ghi_chu?: string; gia_tri_thu_hoi?: number });
  return { ghiChu: b.ghi_chu?.trim() || null, giaTri: typeof b.gia_tri_thu_hoi === "number" ? b.gia_tri_thu_hoi : null };
}

// KT duyet: Nhap mua / Bao hong co hieu luc ngay ('Da hoan tat'); Thanh ly / Tieu huy -> 'Da duyet'
// (cho HCNS xu ly vat ly roi bam hoan tat).
phieuXuLyTs.post("/:id/ke-toan-duyet", async (c) => {
  if (!laKeToan(c.get("user"), await congTyPhieu(c.env.DB, c.req.param("id") ?? ""))) return c.json({ error: "CHI_KE_TOAN" }, 403);
  const { ghiChu } = await docGhiChu(c);
  const p = await c.env.DB.prepare("SELECT loai FROM phieu_xu_ly_ts WHERE id = ?").bind(c.req.param("id")).first<{ loai: Loai }>();
  if (!p) return c.json({ error: "NOT_FOUND" }, 404);
  const db = c.env.DB;
  if (await laNguoiLap(db, "phieu_xu_ly_ts", c.req.param("id") ?? "", c.get("user").email)) return c.json({ error: "KHONG_TU_DUYET" }, 403);
  if (p.loai === "Nhap mua") {
    return chuyenTrangThai(c, "Cho ke toan duyet", "Da hoan tat", ghiChu, (_p, ct, ngay) =>
      db
        .prepare(`UPDATE ccdc SET trang_thai_hien_tai = 'Trong kho', kho_id = ${KHO_HCNS_CUA_TS}, nguoi_dang_giu = NULL, updated_at = ? WHERE id = ?`)
        .bind(ngay, ct.ccdc_id),
    );
  }
  if (p.loai === "Bao hong") {
    return chuyenTrangThai(c, "Cho ke toan duyet", "Da hoan tat", ghiChu, (_p, ct, ngay) =>
      db
        .prepare(
          `UPDATE ccdc SET trang_thai_hien_tai = 'Hong', tinh_trang = 'Hong', kho_id = ${KHO_HCNS_CUA_TS}, nguoi_dang_giu = NULL, updated_at = ? WHERE id = ?`,
        )
        .bind(ngay, ct.ccdc_id),
    );
  }
  // Thanh ly / Tieu huy: TS giu nguyen 'Cho thanh ly'/'Cho tieu huy' den khi hoan tat.
  return chuyenTrangThai(c, "Cho ke toan duyet", "Da duyet", ghiChu, (_p, ct, ngay) =>
    db.prepare(`UPDATE ccdc SET updated_at = ? WHERE id = ?`).bind(ngay, ct.ccdc_id),
  );
});

// KT tu choi: hoan nguyen TS ve dung trang thai/nguoi giu/kho truoc khi lap phieu; rieng Nhap mua thi
// TS chua tung vao kho -> vo hieu hoa.
phieuXuLyTs.post("/:id/ke-toan-tu-choi", async (c) => {
  if (!laKeToan(c.get("user"), await congTyPhieu(c.env.DB, c.req.param("id") ?? ""))) return c.json({ error: "CHI_KE_TOAN" }, 403);
  const { ghiChu } = await docGhiChu(c);
  if (!ghiChu) return c.json({ error: "CAN_LY_DO" }, 400);
  const db = c.env.DB;
  return chuyenTrangThai(c, "Cho ke toan duyet", "Tu choi", ghiChu, (p, ct, ngay) =>
    p.loai === "Nhap mua"
      ? db.prepare(`UPDATE ccdc SET vo_hieu_hoa = 1, updated_at = ? WHERE id = ?`).bind(ngay, ct.ccdc_id)
      : db
          .prepare(`UPDATE ccdc SET trang_thai_hien_tai = ?, nguoi_dang_giu = ?, kho_id = ?, updated_at = ? WHERE id = ?`)
          .bind(ct.trang_thai_truoc, ct.nguoi_giu_truoc, ct.kho_truoc, ngay, ct.ccdc_id),
  );
});

// HCNS xac nhan da thanh ly / tieu huy xong vat ly (sau khi KT duyet).
phieuXuLyTs.post("/:id/hoan-tat", async (c) => {
  if (!laHcns(c.get("user"), await congTyPhieu(c.env.DB, c.req.param("id") ?? ""))) return c.json({ error: "CHI_HCNS" }, 403);
  const { ghiChu, giaTri } = await docGhiChu(c);
  const id = c.req.param("id");
  const db = c.env.DB;
  const p = await db.prepare("SELECT loai FROM phieu_xu_ly_ts WHERE id = ?").bind(id).first<{ loai: Loai }>();
  if (!p) return c.json({ error: "NOT_FOUND" }, 404);
  if (p.loai !== "Thanh ly" && p.loai !== "Tieu huy") return c.json({ error: "SAI_LOAI" }, 400);
  const ketThuc = p.loai === "Thanh ly" ? "Da thanh ly" : "Da tieu huy";
  return chuyenTrangThai(
    c,
    "Da duyet",
    "Da hoan tat",
    ghiChu,
    (_p, ct, ngay) =>
      db.prepare(`UPDATE ccdc SET trang_thai_hien_tai = ?, kho_id = NULL, nguoi_dang_giu = NULL, updated_at = ? WHERE id = ?`).bind(ketThuc, ngay, ct.ccdc_id),
    giaTri != null ? [db.prepare("UPDATE phieu_xu_ly_ts SET gia_tri_thu_hoi = ? WHERE id = ?").bind(giaTri, id)] : [],
  );
});

export default phieuXuLyTs;
