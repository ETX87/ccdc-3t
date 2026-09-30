import { Hono } from "hono";
import type { AppUser, Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { nowVN } from "../lib/vnTime";
import { dkCotKho, dkPhieuKho, dkTaiSan, layPhamVi, locTheoKho, type PhamVi } from "../lib/phamVi";
import { chupNeuChuaCo, soLieuDaChup, tinhChiSo } from "../lib/thongKe";

// Du lieu that cho giao dien 3T Asset Management (ke hoach Giai doan 1.6 muc 3.2): tong quan, viec can
// lam (+ so do tren menu/chuong), canh bao, tim kiem. MOI truy van loc theo pham vi (lib/phamVi.ts).
const dashboard = new Hono<{ Bindings: Env }>();
dashboard.use("*", verifySessionMiddleware, loadUser);

const HE_THONG = "nhap-du-lieu-cu@he-thong.local";
const QUA_HAN_GIO = 48; // user chot 2026-09-24: 48 gio cho moi loai
const LOAI_XL: Record<string, string> = { "Nhap mua": "Nhập tài sản", "Bao hong": "Báo hỏng", "Thanh ly": "Thanh lý", "Tieu huy": "Tiêu hủy" };

// ---------- Tien ich ngay (chuoi 'YYYY-MM-DD[ HH:MM:SS]' gio VN) ----------
function congNgay(ngay: string, soNgay: number): string {
  const d = new Date(`${ngay.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + soNgay);
  return d.toISOString().slice(0, 10);
}
function truGio(thoiDiem: string, gio: number): string {
  const d = new Date(`${thoiDiem.replace(" ", "T")}Z`);
  d.setUTCHours(d.getUTCHours() - gio);
  return d.toISOString().replace("T", " ").slice(0, 19);
}
function soNgayGiua(tu: string, den: string): number {
  return Math.round((Date.parse(`${den}T00:00:00Z`) - Date.parse(`${tu}T00:00:00Z`)) / 86400000) + 1;
}
function thangLui(thang: string, n: number): string {
  const [y, m] = thang.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return d.toISOString().slice(0, 7);
}
const laNgay = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const phanTram = (nay: number, truoc: number | null) => (truoc && truoc > 0 ? Math.round(((nay - truoc) / truoc) * 1000) / 10 : null);

/** Pham vi theo nguoi dung + bo loc "don vi" (kho_id). Tra null neu kho ngoai quyen. */
async function phamViYeuCau(db: D1Database, user: AppUser, khoId?: string): Promise<PhamVi | null> {
  const pv = await layPhamVi(db, user);
  if (!khoId) return pv;
  const id = Number(khoId);
  return Number.isInteger(id) && id > 0 ? locTheoKho(db, pv, id) : null;
}

// ======================================================================================
// GET /tong-quan?tu=YYYY-MM-DD&den=YYYY-MM-DD&kho_id=
// ======================================================================================
dashboard.get("/tong-quan", async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const goc = await layPhamVi(db, user);
  if (!goc.xemTongHop) return c.json({ error: "FORBIDDEN" }, 403);
  const pv = await phamViYeuCau(db, user, c.req.query("kho_id"));
  if (!pv) return c.json({ error: "FORBIDDEN" }, 403);

  const homNay = nowVN().slice(0, 10);
  const den = laNgay(c.req.query("den")) ? c.req.query("den")! : homNay;
  const tu = laNgay(c.req.query("tu")) ? c.req.query("tu")! : `${homNay.slice(0, 4)}-01-01`;
  if (tu > den) return c.json({ error: "KHOANG_NGAY_SAI" }, 400);
  const doDai = soNgayGiua(tu, den);
  const tuTruoc = congNgay(tu, -doDai);
  const denTruoc = congNgay(tu, -1);

  // Chup so lieu hom nay neu cron chua chay (khong chan phan hoi).
  c.executionCtx.waitUntil(chupNeuChuaCo(db).catch((e) => console.error("[chupSoLieu]", e)));

  const ts = dkTaiSan(pv);
  const pk = dkPhieuKho(pv);
  const tuKho = dkCotKho(pv, "p.tu_kho_id");
  const denKho = dkCotKho(pv, "p.den_kho_id");
  const tonKho = dkCotKho(pv, "t.kho_id");

  const [chiSo, kyTruoc] = await Promise.all([tinhChiSo(db, pv), soLieuDaChup(db, pv, denTruoc)]);

  const tieuHao = (a: string, b: string) =>
    db
      .prepare(
        `SELECT COALESCE(SUM(ct.so_luong), 0) AS sl, COALESCE(SUM(ct.thanh_tien), 0) AS gt, COUNT(DISTINCT p.id) AS so_phieu
         FROM phieu_chuyen_kho p JOIN phieu_chuyen_kho_ct ct ON ct.phieu_id = p.id
         WHERE p.loai = 'Cap phat NV' AND p.trang_thai = 'Da giao' AND substr(p.created_at, 1, 10) BETWEEN ? AND ? AND ${tuKho.sql}`,
      )
      .bind(a, b, ...tuKho.binds);

  const thangCuoi = den.slice(0, 7);
  const thangDau = thangLui(thangCuoi, 11);
  const [thNay, thTruoc, tsRows, muaTieuHao, nhomRows, tonTieuHao, luongRows] = await db.batch<Record<string, unknown>>([
    tieuHao(tu, den),
    tieuHao(tuTruoc, denTruoc),
    // Tai san cho bieu do thang: thang mua (TS cu thieu ngay mua -> null = tinh vao so dau ky) + thang
    // hoan tat thanh ly/tieu huy (lay tu nhat ky phieu xu ly).
    db
      .prepare(
        `SELECT c.nguyen_gia AS gt,
                COALESCE(substr(c.ngay_mua, 1, 7), CASE WHEN c.nguoi_tao IS NOT '${HE_THONG}' THEN substr(c.created_at, 1, 7) END) AS thang_mua,
                (SELECT substr(MAX(l.ngay_xu_ly), 1, 7) FROM phieu_xu_ly_ts_ct x
                   JOIN phieu_xu_ly_ts p ON p.id = x.phieu_id AND p.loai IN ('Thanh ly', 'Tieu huy')
                   JOIN phieu_xu_ly_ts_log l ON l.phieu_id = p.id AND l.trang_thai = 'Da hoan tat'
                 WHERE x.ccdc_id = c.id) AS thang_huy
         FROM ccdc c WHERE c.vo_hieu_hoa = 0 AND c.trang_thai_hien_tai != 'Cho duyet nhap' AND ${ts.sql}`,
      )
      .bind(...ts.binds),
    db
      .prepare(
        `SELECT substr(p.created_at, 1, 7) AS thang, SUM(ct.thanh_tien) AS gt
         FROM phieu_chuyen_kho p JOIN phieu_chuyen_kho_ct ct ON ct.phieu_id = p.id
         WHERE p.loai = 'Nhap mua' AND p.trang_thai = 'Da nhan' AND substr(p.created_at, 1, 7) BETWEEN ? AND ? AND ${denKho.sql}
         GROUP BY 1`,
      )
      .bind(thangDau, thangCuoi, ...denKho.binds),
    db
      .prepare(
        `SELECT c.nhom_id, COALESCE(n.ten_nhom, 'Chưa phân nhóm') AS ten, SUM(COALESCE(c.nguyen_gia, 0)) AS gt, COUNT(*) AS sl
         FROM ccdc c LEFT JOIN nhom_ccdc n ON n.id = c.nhom_id
         WHERE c.vo_hieu_hoa = 0 AND c.trang_thai_hien_tai NOT IN ('Da thanh ly', 'Da tieu huy', 'Cho duyet nhap') AND ${ts.sql}
         GROUP BY c.nhom_id ORDER BY 3 DESC`,
      )
      .bind(...ts.binds),
    db
      .prepare(
        `SELECT COALESCE(SUM(t.ton * COALESCE(v.don_gia_tham_khao, 0)), 0) AS gt, COALESCE(SUM(t.ton), 0) AS sl
         FROM v_ton_kho t JOIN vt_tieu_hao v ON v.id = t.vt_id WHERE t.ton > 0 AND ${tonKho.sql}`,
      )
      .bind(...tonKho.binds),
    db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM phieu_chuyen_kho p WHERE p.loai = 'Nhap mua' AND substr(p.created_at, 1, 10) BETWEEN ? AND ? AND ${pk.sql})
           + (SELECT COUNT(*) FROM phieu_xu_ly_ts x WHERE x.loai = 'Nhap mua' AND substr(x.created_at, 1, 10) BETWEEN ? AND ?
                AND EXISTS (SELECT 1 FROM phieu_xu_ly_ts_ct ct JOIN ccdc c ON c.id = ct.ccdc_id WHERE ct.phieu_id = x.id AND ${pv.toanBo ? "1=1" : "0=1"})) AS nhap_hang,
           (SELECT COUNT(*) FROM phieu_chuyen_kho p WHERE p.trang_thai = 'Dang chuyen' AND ${pk.sql})
           + (SELECT COUNT(*) FROM phieu_giao_nhan g WHERE g.da_xac_nhan = 0 AND ${
             pv.toanBo ? "1=1" : "(g.tu_kho_id IN (SELECT value FROM json_each(?)) OR g.den_kho_id IN (SELECT value FROM json_each(?)) OR g.nhan_vien_id IN (SELECT value FROM json_each(?)) OR g.nhan_vien_nhan_moi_id IN (SELECT value FROM json_each(?)))"
           }) AS ban_giao,
           (SELECT COUNT(*) FROM ccdc c WHERE c.vo_hieu_hoa = 0 AND c.trang_thai_hien_tai IN ('Cho thanh ly', 'Cho tieu huy') AND ${ts.sql}) AS xu_ly,
           (SELECT COUNT(*) FROM ccdc c WHERE c.vo_hieu_hoa = 0 AND c.trang_thai_hien_tai IN ('Cho duyet bao hong', 'Hong') AND ${ts.sql}) AS bao_hong`,
      )
      .bind(
        tu, den, ...pk.binds,
        tu, den,
        ...pk.binds,
        ...(pv.toanBo ? [] : [JSON.stringify(pv.khoIds), JSON.stringify(pv.khoIds), JSON.stringify(pv.nhomMaNv), JSON.stringify(pv.nhomMaNv)]),
        ...ts.binds,
        ...ts.binds,
      ),
  ]);

  // ---- Bieu do 12 thang ----
  const thangs = Array.from({ length: 12 }, (_, i) => thangLui(thangCuoi, 11 - i));
  const tsList = tsRows.results as { gt: number | null; thang_mua: string | null; thang_huy: string | null }[];
  const muaTH = new Map((muaTieuHao.results as { thang: string; gt: number }[]).map((r) => [r.thang, r.gt ?? 0]));
  const theoThang = thangs.map((m) => {
    let tong = 0;
    let mua = 0;
    for (const r of tsList) {
      const gt = r.gt ?? 0;
      if ((!r.thang_mua || r.thang_mua <= m) && (!r.thang_huy || r.thang_huy > m)) tong += gt;
      if (r.thang_mua === m) mua += gt;
    }
    return { thang: m, tong_gia_tri: tong, chi_phi_mua: mua + (muaTH.get(m) ?? 0) };
  });
  const thieuNgayMua = tsList.filter((r) => !r.thang_mua).length;

  // ---- Phan bo theo nhom: 4 nhom lon nhat + Khac + Tieu hao ton kho ----
  const nhom = nhomRows.results as { nhom_id: number | null; ten: string; gt: number; sl: number }[];
  const theoNhom: { ten: string; gia_tri: number; so_luong: number; loai: string; nhom_id?: number | null }[] = nhom
    .slice(0, 4)
    .map((n) => ({ ten: n.ten, gia_tri: n.gt, so_luong: n.sl, loai: "nhom", nhom_id: n.nhom_id }));
  const khac = nhom.slice(4);
  if (khac.length)
    theoNhom.push({ ten: `Khác (${khac.length} nhóm)`, gia_tri: khac.reduce((s, n) => s + n.gt, 0), so_luong: khac.reduce((s, n) => s + n.sl, 0), loai: "khac" });
  const th = tonTieuHao.results[0] as { gt: number; sl: number };
  if (th.gt > 0) theoNhom.push({ ten: "Tiêu hao tồn kho", gia_tri: th.gt, so_luong: th.sl, loai: "tieu_hao" });

  const luong = luongRows.results[0] as Record<string, number>;
  const thN = thNay.results[0] as { sl: number; gt: number; so_phieu: number };
  const thT = thTruoc.results[0] as { sl: number; gt: number; so_phieu: number };
  const xh = (k: keyof typeof chiSo) => ({
    pct: kyTruoc ? phanTram(chiSo[k].so_luong, kyTruoc.bo[k].so_luong) : null,
    truoc: kyTruoc ? kyTruoc.bo[k].so_luong : null,
  });

  return c.json({
    cap_nhat_luc: nowVN(),
    tu,
    den,
    ky_truoc: { tu: tuTruoc, den: denTruoc, ngay_chup: kyTruoc?.ngay ?? null },
    toan_bo: pv.toanBo,
    kpi: {
      tong_ts: { ...chiSo.tong_ts, xu_huong: xh("tong_ts") },
      trong_kho: { ...chiSo.trong_kho, nhan: pv.toanBo ? "Trong kho HCNS" : "Trong kho", xu_huong: xh("trong_kho") },
      dang_su_dung: { ...chiSo.dang_su_dung, xu_huong: xh("dang_su_dung") },
      tieu_hao_da_cap: {
        so_luong: thN.sl,
        gia_tri: thN.gt,
        so_phieu: thN.so_phieu,
        xu_huong: { pct: phanTram(thN.sl, thT.sl), truoc: thT.sl },
      },
      cho_ke_toan: { ...chiSo.cho_ke_toan, xu_huong: xh("cho_ke_toan") },
    },
    theo_thang: theoThang,
    ts_thieu_ngay_mua: thieuNgayMua,
    theo_nhom: theoNhom,
    luong: {
      nhap_hang: luong.nhap_hang,
      cho_ke_toan: chiSo.cho_ke_toan.so_luong,
      kho_hcns: chiSo.trong_kho.so_luong,
      ban_giao: luong.ban_giao,
      dang_su_dung: chiSo.dang_su_dung.so_luong,
      xu_ly: luong.xu_ly,
      bao_hong: luong.bao_hong,
    },
  });
});

// ======================================================================================
// Viec can lam (dung cho /viec-can-lam, menu_badges, chuong thong bao)
// ======================================================================================
export type HanhDong =
  | "ke_toan_duyet_ck"
  | "ke_toan_duyet_xl"
  | "nhan_kho"
  | "xac_nhan_gn"
  | "xac_nhan_cp"
  | "hoan_tat_xl"
  | "xu_ly_hong"
  | "mo_kiem_ke"
  | "xem_ck"
  | "xem_xl";

export interface ViecRow {
  key: string;
  tab: "cho-duyet" | "cap-phat" | "ban-giao" | "khac";
  loai: string;
  loai_phieu: "chuyen_kho" | "giao_nhan" | "xu_ly" | "tai_san" | "kiem_ke";
  id: string;
  ma_phieu: string | null;
  noi_dung: string;
  don_vi_nguoi_tao: string;
  thoi_gian: string;
  trang_thai: string;
  qua_han: boolean;
  hanh_dong: HanhDong;
  so_luong?: number;
}

const TOM_TAT_CK = `(SELECT group_concat(v.ten_vt || ' x' || printf('%g', ct.so_luong), ', ') FROM phieu_chuyen_kho_ct ct JOIN vt_tieu_hao v ON v.id = ct.vt_id WHERE ct.phieu_id = p.id)`;
const TOM_TAT_XL = `(SELECT group_concat(c.ten_ccdc, ', ') FROM phieu_xu_ly_ts_ct ct JOIN ccdc c ON c.id = ct.ccdc_id WHERE ct.phieu_id = x.id)`;
const TOM_TAT_GN = `(SELECT group_concat(c.ten_ccdc, ', ') FROM phieu_giao_nhan_ct ct JOIN ccdc c ON c.id = ct.ccdc_id WHERE ct.phieu_id = g.id)`;
const TEN_NGUOI = (cot: string) => `COALESCE((SELECT u.ten FROM users u WHERE u.email = ${cot}), ${cot})`;

async function layViecCanLam(db: D1Database, user: AppUser, pv: PhamVi): Promise<ViecRow[]> {
  const laKT = user.vai_tro === "Admin" || user.vai_tro === "Ke toan";
  const laHC = user.vai_tro === "Admin" || user.vai_tro === "HCNS";
  const moc = truGio(nowVN(), QUA_HAN_GIO);
  const tuanTruoc = truGio(nowVN(), 7 * 24);
  const khoJson = JSON.stringify(pv.khoIds);
  const rows: ViecRow[] = [];
  type R = Record<string, string | number | null>;
  const stmts: { kind: string; stmt: D1PreparedStatement }[] = [];

  if (laKT) {
    stmts.push({
      kind: "kt_ck",
      stmt: db.prepare(
        `SELECT p.id, p.ma_phieu, p.created_at AS t, ${TEN_NGUOI("p.nguoi_lap")} AS nguoi, kd.ten_kho AS den, ${TOM_TAT_CK} AS tom_tat
         FROM phieu_chuyen_kho p LEFT JOIN kho kd ON kd.id = p.den_kho_id WHERE p.trang_thai = 'Cho ke toan duyet' ORDER BY p.created_at`,
      ),
    });
    stmts.push({
      kind: "kt_xl",
      stmt: db.prepare(
        `SELECT x.id, x.ma_phieu, x.loai, x.ly_do, x.created_at AS t, ${TEN_NGUOI("x.nguoi_de_xuat")} AS nguoi, ${TOM_TAT_XL} AS tom_tat,
                (SELECT COUNT(*) FROM phieu_xu_ly_ts_ct ct WHERE ct.phieu_id = x.id) AS so_ts
         FROM phieu_xu_ly_ts x WHERE x.trang_thai = 'Cho ke toan duyet' ORDER BY x.created_at`,
      ),
    });
  }
  if (pv.khoIds.length) {
    stmts.push({
      kind: "nhan_kho",
      stmt: db
        .prepare(
          `SELECT p.id, p.ma_phieu, p.created_at AS t, kt.ten_kho AS tu, kd.ten_kho AS den, ${TOM_TAT_CK} AS tom_tat
           FROM phieu_chuyen_kho p JOIN kho kt ON kt.id = p.tu_kho_id JOIN kho kd ON kd.id = p.den_kho_id
           WHERE p.trang_thai = 'Dang chuyen' AND p.den_kho_id IN (SELECT value FROM json_each(?)) ORDER BY p.created_at`,
        )
        .bind(khoJson),
    });
    stmts.push({
      kind: "gn_kho",
      stmt: db
        .prepare(
          `SELECT g.id, g.ma_phieu, g.loai_phieu, g.ngay_lap AS t, kd.ten_kho AS den, ${TEN_NGUOI("g.nguoi_lap")} AS nguoi, ${TOM_TAT_GN} AS tom_tat
           FROM phieu_giao_nhan g JOIN kho kd ON kd.id = g.den_kho_id
           WHERE g.da_xac_nhan = 0 AND g.loai_phieu IN ('Thu hoi', 'Chuyen kho') AND g.den_kho_id IN (SELECT value FROM json_each(?))`,
        )
        .bind(khoJson),
    });
  }
  if (user.ma_nv) {
    stmts.push({
      kind: "gn_nv",
      stmt: db
        .prepare(
          `SELECT g.id, g.ma_phieu, g.loai_phieu, g.ngay_lap AS t, ${TEN_NGUOI("g.nguoi_lap")} AS nguoi, ${TOM_TAT_GN} AS tom_tat
           FROM phieu_giao_nhan g
           WHERE g.da_xac_nhan = 0 AND ((g.loai_phieu = 'Cap phat' AND g.nhan_vien_id = ?) OR (g.loai_phieu = 'Dieu chuyen' AND g.nhan_vien_nhan_moi_id = ?))`,
        )
        .bind(user.ma_nv, user.ma_nv),
    });
    stmts.push({
      kind: "cp_nv",
      stmt: db
        .prepare(
          `SELECT p.id, p.ma_phieu, p.created_at AS t, kt.ten_kho AS tu, ${TOM_TAT_CK} AS tom_tat
           FROM phieu_chuyen_kho p JOIN kho kt ON kt.id = p.tu_kho_id
           WHERE p.loai = 'Cap phat NV' AND p.trang_thai = 'Da giao' AND p.da_xac_nhan = 0 AND p.den_nhan_vien_id = ?`,
        )
        .bind(user.ma_nv),
    });
  }
  if (laHC) {
    stmts.push({
      kind: "hoan_tat",
      stmt: db.prepare(
        `SELECT x.id, x.ma_phieu, x.loai, x.created_at AS t, ${TEN_NGUOI("x.nguoi_de_xuat")} AS nguoi, ${TOM_TAT_XL} AS tom_tat
         FROM phieu_xu_ly_ts x WHERE x.trang_thai = 'Da duyet' AND x.loai IN ('Thanh ly', 'Tieu huy')`,
      ),
    });
    stmts.push({
      kind: "hong",
      stmt: db.prepare(
        `SELECT COUNT(*) AS n, MIN(updated_at) AS t, SUM(COALESCE(nguyen_gia, 0)) AS gt FROM ccdc WHERE vo_hieu_hoa = 0 AND trang_thai_hien_tai = 'Hong'`,
      ),
    });
    stmts.push({
      kind: "kiem_ke",
      stmt: db.prepare(
        `SELECT d.id, d.ma_phieu, d.ten_dot, d.ngay_bat_dau AS t, (SELECT COUNT(*) FROM kiem_ke_ct k WHERE k.dot_kiem_ke_id = d.id) AS da_kiem
         FROM dot_kiem_ke d WHERE d.trang_thai = 'Dang thuc hien'`,
      ),
    });
  }
  stmts.push({
    kind: "bi_tu_choi_ck",
    stmt: db
      .prepare(
        `SELECT p.id, p.ma_phieu, p.trang_thai, p.updated_at AS t, ${TOM_TAT_CK} AS tom_tat FROM phieu_chuyen_kho p
         WHERE p.nguoi_lap = ? AND p.trang_thai IN ('Ke toan tu choi', 'Bi tu choi') AND p.updated_at >= ?`,
      )
      .bind(user.email, tuanTruoc),
  });
  stmts.push({
    kind: "bi_tu_choi_xl",
    stmt: db
      .prepare(
        `SELECT x.id, x.ma_phieu, x.loai, (SELECT MAX(l.ngay_xu_ly) FROM phieu_xu_ly_ts_log l WHERE l.phieu_id = x.id) AS t, ${TOM_TAT_XL} AS tom_tat
         FROM phieu_xu_ly_ts x WHERE x.nguoi_de_xuat = ? AND x.trang_thai = 'Tu choi'
           AND (SELECT MAX(l.ngay_xu_ly) FROM phieu_xu_ly_ts_log l WHERE l.phieu_id = x.id) >= ?`,
      )
      .bind(user.email, tuanTruoc),
  });

  const kq = await db.batch<R>(stmts.map((s) => s.stmt));
  const quaHan = (t: string | number | null) => typeof t === "string" && t < moc;
  const s = (v: string | number | null | undefined) => (v == null ? "" : String(v));

  stmts.forEach(({ kind }, i) => {
    for (const r of kq[i].results) {
      const base = { id: s(r.id), ma_phieu: (r.ma_phieu as string) ?? null, thoi_gian: s(r.t) };
      switch (kind) {
        case "kt_ck":
          rows.push({ ...base, key: `kt_ck:${r.id}`, tab: "cho-duyet", loai: "Nhập mua tiêu hao", loai_phieu: "chuyen_kho", noi_dung: s(r.tom_tat), don_vi_nguoi_tao: `${s(r.den)} · ${s(r.nguoi)}`, trang_thai: "Chờ kế toán duyệt", qua_han: quaHan(r.t), hanh_dong: "ke_toan_duyet_ck" });
          break;
        case "kt_xl":
          rows.push({ ...base, key: `kt_xl:${r.id}`, tab: "cho-duyet", loai: LOAI_XL[s(r.loai)] ?? s(r.loai), loai_phieu: "xu_ly", noi_dung: `${r.so_ts} TS: ${s(r.tom_tat)}`, don_vi_nguoi_tao: s(r.nguoi), trang_thai: "Chờ kế toán duyệt", qua_han: quaHan(r.t), hanh_dong: "ke_toan_duyet_xl" });
          break;
        case "nhan_kho":
          rows.push({ ...base, key: `nhan_kho:${r.id}`, tab: "ban-giao", loai: "Nhận chuyển kho", loai_phieu: "chuyen_kho", noi_dung: s(r.tom_tat), don_vi_nguoi_tao: `${s(r.tu)} → ${s(r.den)}`, trang_thai: "Chờ nhận", qua_han: quaHan(r.t), hanh_dong: "nhan_kho" });
          break;
        case "gn_kho":
          rows.push({ ...base, key: `gn_kho:${r.id}`, tab: "ban-giao", loai: r.loai_phieu === "Thu hoi" ? "Thu hồi về kho" : "Chuyển TSCĐ về kho", loai_phieu: "giao_nhan", noi_dung: s(r.tom_tat), don_vi_nguoi_tao: `${s(r.den)} · ${s(r.nguoi)}`, trang_thai: "Chờ xác nhận", qua_han: quaHan(r.t), hanh_dong: "xac_nhan_gn" });
          break;
        case "gn_nv":
          rows.push({ ...base, key: `gn_nv:${r.id}`, tab: r.loai_phieu === "Cap phat" ? "cap-phat" : "ban-giao", loai: r.loai_phieu === "Cap phat" ? "Nhận cấp phát TSCĐ" : "Nhận điều chuyển TSCĐ", loai_phieu: "giao_nhan", noi_dung: s(r.tom_tat), don_vi_nguoi_tao: s(r.nguoi), trang_thai: "Chờ tôi xác nhận", qua_han: quaHan(r.t), hanh_dong: "xac_nhan_gn" });
          break;
        case "cp_nv":
          rows.push({ ...base, key: `cp_nv:${r.id}`, tab: "cap-phat", loai: "Nhận cấp phát tiêu hao", loai_phieu: "chuyen_kho", noi_dung: s(r.tom_tat), don_vi_nguoi_tao: s(r.tu), trang_thai: "Chờ tôi xác nhận", qua_han: quaHan(r.t), hanh_dong: "xac_nhan_cp" });
          break;
        case "hoan_tat":
          rows.push({ ...base, key: `hoan_tat:${r.id}`, tab: "khac", loai: r.loai === "Thanh ly" ? "Hoàn tất thanh lý" : "Hoàn tất tiêu hủy", loai_phieu: "xu_ly", noi_dung: s(r.tom_tat), don_vi_nguoi_tao: s(r.nguoi), trang_thai: "KT đã duyệt", qua_han: false, hanh_dong: "hoan_tat_xl" });
          break;
        case "hong":
          if (Number(r.n) > 0)
            rows.push({ key: "hong", id: "hong", ma_phieu: null, thoi_gian: s(r.t), tab: "khac", loai: "Tài sản hỏng chờ xử lý", loai_phieu: "tai_san", noi_dung: `${r.n} tài sản hỏng: đề xuất thanh lý/tiêu hủy hoặc đánh dấu sửa xong`, don_vi_nguoi_tao: "Kho tổng HCNS", trang_thai: "Cần xử lý", qua_han: false, hanh_dong: "xu_ly_hong", so_luong: Number(r.n) });
          break;
        case "kiem_ke":
          rows.push({ ...base, key: `kiem_ke:${r.id}`, tab: "khac", loai: "Kiểm kê đang thực hiện", loai_phieu: "kiem_ke", noi_dung: `${s(r.ten_dot)} - đã kiểm ${r.da_kiem} tài sản`, don_vi_nguoi_tao: "HCNS", trang_thai: "Đang thực hiện", qua_han: false, hanh_dong: "mo_kiem_ke" });
          break;
        case "bi_tu_choi_ck":
          rows.push({ ...base, key: `tc_ck:${r.id}`, tab: "khac", loai: r.trang_thai === "Ke toan tu choi" ? "Phiếu bị KT từ chối" : "Phiếu bị từ chối nhận", loai_phieu: "chuyen_kho", noi_dung: s(r.tom_tat), don_vi_nguoi_tao: "Tôi lập", trang_thai: "Bị từ chối", qua_han: false, hanh_dong: "xem_ck" });
          break;
        case "bi_tu_choi_xl":
          rows.push({ ...base, key: `tc_xl:${r.id}`, tab: "khac", loai: `${LOAI_XL[s(r.loai)] ?? r.loai} bị từ chối`, loai_phieu: "xu_ly", noi_dung: s(r.tom_tat), don_vi_nguoi_tao: "Tôi đề xuất", trang_thai: "Bị từ chối", qua_han: false, hanh_dong: "xem_xl" });
          break;
      }
    }
  });
  rows.sort((a, b) => a.thoi_gian.localeCompare(b.thoi_gian));
  return rows;
}

// ======================================================================================
// Canh bao
// ======================================================================================
type LoaiCanhBao = "cho-ban-giao" | "qua-han-duyet" | "ton-am" | "bao-hong-cho-duyet" | "chenh-lech-kiem-ke" | "sap-het-bao-hanh" | "don-gia-bat-thuong";
const MUC_DO: Record<LoaiCanhBao, "cao" | "trung_binh" | "thap"> = {
  "cho-ban-giao": "cao",
  "qua-han-duyet": "cao",
  "ton-am": "cao",
  "bao-hong-cho-duyet": "trung_binh",
  "chenh-lech-kiem-ke": "trung_binh",
  "sap-het-bao-hanh": "thap",
  "don-gia-bat-thuong": "thap",
};

interface CanhBao {
  loai: LoaiCanhBao;
  tieu_de: string;
  mo_ta: string;
  so_luong: number;
  muc_do: "cao" | "trung_binh" | "thap";
}

function cauLenhCanhBao(db: D1Database, pv: PhamVi) {
  const moc = truGio(nowVN(), QUA_HAN_GIO);
  const homNay = nowVN().slice(0, 10);
  const pk = dkPhieuKho(pv);
  const ts = dkTaiSan(pv);
  const ton = dkCotKho(pv, "t.kho_id");
  const gnDk = pv.toanBo
    ? { sql: "1=1", binds: [] as unknown[] }
    : {
        sql: "(g.tu_kho_id IN (SELECT value FROM json_each(?)) OR g.den_kho_id IN (SELECT value FROM json_each(?)) OR g.nhan_vien_id IN (SELECT value FROM json_each(?)) OR g.nhan_vien_nhan_moi_id IN (SELECT value FROM json_each(?)))",
        binds: [JSON.stringify(pv.khoIds), JSON.stringify(pv.khoIds), JSON.stringify(pv.nhomMaNv), JSON.stringify(pv.nhomMaNv)],
      };
  return {
    // Chi tiet tung loai (dung chung cho dem + danh sach): moi dong co ma, ten, chi_tiet, thoi_gian, kind, ref.
    "cho-ban-giao": db
      .prepare(
        `SELECT p.ma_phieu AS ma, 'Chuyển kho chưa nhận' AS ten, kt.ten_kho || ' → ' || kd.ten_kho AS chi_tiet, p.created_at AS thoi_gian, 'chuyen_kho' AS kind, p.id AS ref
         FROM phieu_chuyen_kho p JOIN kho kt ON kt.id = p.tu_kho_id JOIN kho kd ON kd.id = p.den_kho_id
         WHERE p.trang_thai = 'Dang chuyen' AND p.created_at < ? AND ${pk.sql}
         UNION ALL
         SELECT g.ma_phieu, 'Giao nhận TSCĐ chưa xác nhận', g.loai_phieu, g.ngay_lap, 'giao_nhan', g.id
         FROM phieu_giao_nhan g WHERE g.da_xac_nhan = 0 AND g.ngay_lap < ? AND ${gnDk.sql}
         ORDER BY 4`,
      )
      .bind(moc, ...pk.binds, moc, ...gnDk.binds),
    "qua-han-duyet": db
      .prepare(
        `SELECT p.ma_phieu AS ma, 'Nhập mua tiêu hao' AS ten, ${TOM_TAT_CK} AS chi_tiet, p.created_at AS thoi_gian, 'chuyen_kho' AS kind, p.id AS ref
         FROM phieu_chuyen_kho p WHERE p.trang_thai = 'Cho ke toan duyet' AND p.created_at < ? AND ${pk.sql}
         UNION ALL
         SELECT x.ma_phieu, CASE x.loai WHEN 'Nhap mua' THEN 'Nhập tài sản' WHEN 'Bao hong' THEN 'Báo hỏng' WHEN 'Thanh ly' THEN 'Thanh lý' ELSE 'Tiêu hủy' END,
                ${TOM_TAT_XL}, x.created_at, 'xu_ly', x.id
         FROM phieu_xu_ly_ts x WHERE x.trang_thai = 'Cho ke toan duyet' AND x.created_at < ?
           AND EXISTS (SELECT 1 FROM phieu_xu_ly_ts_ct ct JOIN ccdc c ON c.id = ct.ccdc_id WHERE ct.phieu_id = x.id AND (${ts.sql} OR c.trang_thai_hien_tai = 'Cho duyet nhap' AND ${pv.toanBo ? "1=1" : "0=1"}))
         ORDER BY 4`,
      )
      .bind(moc, ...pk.binds, moc, ...ts.binds),
    "ton-am": db
      .prepare(
        `SELECT t.vt_id AS ma, v.ten_vt AS ten, k.ten_kho || ': tồn ' || printf('%g', t.ton) || ' ' || COALESCE(v.don_vi_tinh, '') AS chi_tiet, NULL AS thoi_gian, 'vat_tu' AS kind, t.vt_id AS ref
         FROM v_ton_kho t JOIN kho k ON k.id = t.kho_id JOIN vt_tieu_hao v ON v.id = t.vt_id
         WHERE t.ton < 0 AND ${ton.sql} ORDER BY t.ton`,
      )
      .bind(...ton.binds),
    "bao-hong-cho-duyet": db
      .prepare(
        `SELECT x.ma_phieu AS ma, 'Báo hỏng' AS ten, ${TOM_TAT_XL} AS chi_tiet, x.created_at AS thoi_gian, 'xu_ly' AS kind, x.id AS ref
         FROM phieu_xu_ly_ts x WHERE x.loai = 'Bao hong' AND x.trang_thai = 'Cho ke toan duyet'
           AND EXISTS (SELECT 1 FROM phieu_xu_ly_ts_ct ct JOIN ccdc c ON c.id = ct.ccdc_id WHERE ct.phieu_id = x.id AND ${ts.sql})
         ORDER BY x.created_at`,
      )
      .bind(...ts.binds),
    "chenh-lech-kiem-ke": db
      .prepare(
        `SELECT k.ccdc_id AS ma, c.ten_ccdc AS ten, d.ten_dot || ': ' || CASE k.tinh_trang_thuc_te WHEN 'Thieu' THEN 'Thiếu' WHEN 'Thua' THEN 'Thừa' WHEN 'Hong' THEN 'Hỏng' ELSE 'Sai người giữ' END AS chi_tiet,
                k.kiem_ke_luc AS thoi_gian, 'tai_san' AS kind, k.ccdc_id AS ref
         FROM kiem_ke_ct k JOIN dot_kiem_ke d ON d.id = k.dot_kiem_ke_id JOIN ccdc c ON c.id = k.ccdc_id
         WHERE k.tinh_trang_thuc_te != 'Dung vi tri' AND ${ts.sql}
           AND d.id = (SELECT id FROM dot_kiem_ke ORDER BY created_at DESC LIMIT 1)
         ORDER BY k.kiem_ke_luc DESC`,
      )
      .bind(...ts.binds),
    "sap-het-bao-hanh": db
      .prepare(
        `SELECT c.id AS ma, c.ten_ccdc AS ten, 'Hết bảo hành ' || c.han_bao_hanh AS chi_tiet, c.han_bao_hanh AS thoi_gian, 'tai_san' AS kind, c.id AS ref
         FROM ccdc c WHERE c.vo_hieu_hoa = 0 AND c.trang_thai_hien_tai NOT IN ('Da thanh ly', 'Da tieu huy') AND c.han_bao_hanh IS NOT NULL
           AND date(c.han_bao_hanh) BETWEEN date(?) AND date(?, '+30 days') AND ${ts.sql}
         ORDER BY c.han_bao_hanh`,
      )
      .bind(homNay, homNay, ...ts.binds),
    "don-gia-bat-thuong": db
      .prepare(
        `SELECT p.ma_phieu AS ma, v.ten_vt AS ten,
                'Đơn giá ' || printf('%,d', CAST(ct.don_gia AS INTEGER)) || 'đ, tham khảo ' || printf('%,d', CAST(v.don_gia_tham_khao AS INTEGER)) || 'đ' AS chi_tiet,
                p.created_at AS thoi_gian, 'chuyen_kho' AS kind, p.id AS ref
         FROM phieu_chuyen_kho_ct ct JOIN phieu_chuyen_kho p ON p.id = ct.phieu_id JOIN vt_tieu_hao v ON v.id = ct.vt_id
         WHERE v.don_gia_tham_khao > 0 AND ct.don_gia > 0 AND (ct.don_gia > 5 * v.don_gia_tham_khao OR ct.don_gia * 5 < v.don_gia_tham_khao) AND ${pk.sql}
         ORDER BY p.created_at DESC`,
      )
      .bind(...pk.binds),
  } satisfies Record<LoaiCanhBao, D1PreparedStatement>;
}

async function layCanhBao(db: D1Database, pv: PhamVi): Promise<CanhBao[]> {
  const lenh = cauLenhCanhBao(db, pv);
  const loais = Object.keys(lenh) as LoaiCanhBao[];
  const kq = await db.batch<{ kind: string; ten: string }>(loais.map((l) => lenh[l]));
  const ds: CanhBao[] = loais.map((loai, i) => {
    const r = kq[i].results;
    const n = r.length;
    const dem = (ten: string) => r.filter((x) => x.ten === ten).length;
    const moTa: Record<LoaiCanhBao, string> = {
      "cho-ban-giao": `${dem("Chuyển kho chưa nhận")} phiếu chuyển kho chưa nhận, ${dem("Giao nhận TSCĐ chưa xác nhận")} giao nhận TSCĐ chưa xác nhận`,
      "qua-han-duyet": `${dem("Nhập mua tiêu hao")} phiếu nhập mua, ${n - dem("Nhập mua tiêu hao")} phiếu xử lý tài sản chờ KT quá ${QUA_HAN_GIO}h`,
      "ton-am": `${n} vật tư tồn âm theo kho - cần kiểm kê, điều chỉnh`,
      "bao-hong-cho-duyet": `${n} phiếu báo hỏng cần Kế toán duyệt`,
      "chenh-lech-kiem-ke": `${n} tài sản chênh lệch ở đợt kiểm kê gần nhất`,
      "sap-het-bao-hanh": `${n} tài sản hết bảo hành trong 30 ngày`,
      "don-gia-bat-thuong": `${n} dòng phiếu có đơn giá lệch quá 5 lần giá tham khảo`,
    };
    const tieuDe: Record<LoaiCanhBao, string> = {
      "cho-ban-giao": `Tài sản chờ bàn giao (quá ${QUA_HAN_GIO}h)`,
      "qua-han-duyet": "Phiếu quá hạn duyệt",
      "ton-am": "Tồn kho âm",
      "bao-hong-cho-duyet": "Báo hỏng chờ duyệt",
      "chenh-lech-kiem-ke": "Chênh lệch kiểm kê",
      "sap-het-bao-hanh": "Tài sản sắp hết bảo hành",
      "don-gia-bat-thuong": "Đơn giá bất thường",
    };
    return { loai, tieu_de: tieuDe[loai], mo_ta: moTa[loai], so_luong: n, muc_do: MUC_DO[loai] };
  });
  const thuTu = { cao: 0, trung_binh: 1, thap: 2 };
  return ds.sort((a, b) => Number(b.so_luong > 0) - Number(a.so_luong > 0) || thuTu[a.muc_do] - thuTu[b.muc_do] || b.so_luong - a.so_luong);
}

// GET /viec-can-lam - danh sach viec cua nguoi dang dang nhap + dem theo tab + so do menu/chuong.
dashboard.get("/viec-can-lam", async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const pv = await layPhamVi(db, user);
  const [rows, canhBao] = await Promise.all([layViecCanLam(db, user, pv), pv.xemTongHop ? layCanhBao(db, pv) : Promise.resolve([])]);
  const dem = (f: (r: ViecRow) => boolean) => rows.filter(f).length;
  const laKT = user.vai_tro === "Admin" || user.vai_tro === "Ke toan";
  const hong = rows.find((r) => r.hanh_dong === "xu_ly_hong")?.so_luong ?? 0;
  return c.json({
    cap_nhat_luc: nowVN(),
    rows,
    tabs: {
      "tat-ca": rows.length,
      "cho-duyet": dem((r) => r.tab === "cho-duyet"),
      "cap-phat": dem((r) => r.tab === "cap-phat"),
      "ban-giao": dem((r) => r.tab === "ban-giao"),
      khac: dem((r) => r.tab === "khac"),
    },
    qua_han: dem((r) => r.qua_han),
    menu_badges: {
      "viec-can-lam": rows.length,
      kho: dem((r) => r.hanh_dong === "nhan_kho"),
      "cap-phat": dem((r) => r.hanh_dong === "ke_toan_duyet_ck"),
      "giao-nhan": dem((r) => r.hanh_dong === "xac_nhan_gn"),
      "bao-hong": laKT ? dem((r) => r.hanh_dong === "ke_toan_duyet_xl" && r.loai === "Báo hỏng") : hong,
      "thanh-ly": laKT
        ? dem((r) => r.hanh_dong === "ke_toan_duyet_xl" && (r.loai === "Thanh lý" || r.loai === "Tiêu hủy"))
        : dem((r) => r.hanh_dong === "hoan_tat_xl"),
      "kiem-ke": dem((r) => r.hanh_dong === "mo_kiem_ke"),
      "canh-bao": canhBao.filter((x) => x.so_luong > 0).length,
      "thong-bao": rows.length,
    },
  });
});

// GET /canh-bao[?loai=] - tong hop 7 loai canh bao; co loai -> kem danh sach chi tiet (toi da 500 dong).
dashboard.get("/canh-bao", async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const goc = await layPhamVi(db, user);
  if (!goc.xemTongHop) return c.json({ error: "FORBIDDEN" }, 403);
  const pv = await phamViYeuCau(db, user, c.req.query("kho_id"));
  if (!pv) return c.json({ error: "FORBIDDEN" }, 403);
  const ds = await layCanhBao(db, pv);
  const loai = c.req.query("loai") as LoaiCanhBao | undefined;
  let chiTiet: unknown[] | null = null;
  if (loai) {
    const lenh = cauLenhCanhBao(db, pv);
    if (!(loai in lenh)) return c.json({ error: "LOAI_KHONG_HOP_LE" }, 400);
    chiTiet = (await lenh[loai].all()).results.slice(0, 500);
  }
  return c.json({ cap_nhat_luc: nowVN(), nguong_gio: QUA_HAN_GIO, rows: ds, chi_tiet: chiTiet });
});

// GET /tim-kiem?q= - tai san, vat tu, nhan vien, phieu (theo ma_phieu) trong pham vi, moi nhom <= 6.
dashboard.get("/tim-kiem", async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2) return c.json({ tai_san: [], vat_tu: [], nhan_vien: [], phieu: [] });
  const pv = await layPhamVi(db, user);
  const like = `%${q.replace(/[%_]/g, "")}%`;
  // Moi tu khoa phai khop (vd "laptop dell" -> ten chua ca "laptop" va "dell", khong can lien nhau).
  const tu = q.replace(/[%_]/g, "").split(/\s+/).filter(Boolean).slice(0, 5).map((w) => `%${w}%`);
  const moiTu = (cot: string[]) => ({
    sql: tu.map(() => `(${cot.map((c) => `${c} LIKE ?`).join(" OR ")})`).join(" AND "),
    binds: tu.flatMap((w) => cot.map(() => w)),
  });
  const tkTs = moiTu(["c.id", "c.ten_ccdc", "c.so_seri"]);
  const tkVt = moiTu(["id", "ten_vt"]);
  const tkNv = moiTu(["ma_nv", "ten_nv"]);
  const ts = dkTaiSan(pv);
  const pk = dkPhieuKho(pv);
  const nhomJson = JSON.stringify(pv.nhomMaNv);
  const khoJson = JSON.stringify(pv.khoIds);

  const [taiSan, vatTu, nhanVien, phieuCk, phieuGn, phieuXl] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT c.id, c.ten_ccdc AS ten, c.trang_thai_hien_tai AS trang_thai, COALESCE(nv.ten_nv, k.ten_kho) AS vi_tri
         FROM ccdc c LEFT JOIN nhan_vien nv ON nv.ma_nv = c.nguoi_dang_giu LEFT JOIN kho k ON k.id = c.kho_id
         WHERE c.vo_hieu_hoa = 0 AND ${tkTs.sql} AND ${ts.sql}
         ORDER BY c.id LIMIT 6`,
      )
      .bind(...tkTs.binds, ...ts.binds),
    db
      .prepare(`SELECT id, ten_vt AS ten, don_vi_tinh FROM vt_tieu_hao WHERE vo_hieu_hoa = 0 AND ? = 1 AND ${tkVt.sql} ORDER BY ten_vt LIMIT 6`)
      .bind(pv.xemTongHop ? 1 : 0, ...tkVt.binds),
    db
      .prepare(
        `SELECT ma_nv AS id, ten_nv AS ten, bo_phan FROM nhan_vien
         WHERE ${tkNv.sql} AND (? = 1 OR ma_nv IN (SELECT value FROM json_each(?)))
         ORDER BY dang_lam_viec DESC, ten_nv LIMIT 6`,
      )
      .bind(...tkNv.binds, pv.toanBo ? 1 : 0, nhomJson),
    db
      .prepare(
        `SELECT p.id, p.ma_phieu, p.loai, p.trang_thai, p.created_at FROM phieu_chuyen_kho p
         WHERE p.ma_phieu LIKE ? AND (${pk.sql} OR p.nguoi_lap = ? OR p.den_nhan_vien_id IN (SELECT value FROM json_each(?)))
         ORDER BY p.created_at DESC LIMIT 6`,
      )
      .bind(like, ...pk.binds, user.email, nhomJson),
    db
      .prepare(
        `SELECT g.id, g.ma_phieu, g.loai_phieu AS loai, g.da_xac_nhan, g.ngay_lap AS created_at FROM phieu_giao_nhan g
         WHERE g.ma_phieu LIKE ? AND (? = 1 OR g.nguoi_lap = ? OR g.tu_kho_id IN (SELECT value FROM json_each(?)) OR g.den_kho_id IN (SELECT value FROM json_each(?))
           OR g.nhan_vien_id IN (SELECT value FROM json_each(?)) OR g.nhan_vien_nhan_moi_id IN (SELECT value FROM json_each(?)))
         ORDER BY g.ngay_lap DESC LIMIT 6`,
      )
      .bind(like, pv.toanBo ? 1 : 0, user.email, khoJson, khoJson, nhomJson, nhomJson),
    db
      .prepare(
        `SELECT x.id, x.ma_phieu, x.loai, x.trang_thai, x.created_at FROM phieu_xu_ly_ts x
         WHERE x.ma_phieu LIKE ? AND (? = 1 OR x.nguoi_de_xuat = ?
           OR EXISTS (SELECT 1 FROM phieu_xu_ly_ts_ct ct JOIN ccdc c ON c.id = ct.ccdc_id WHERE ct.phieu_id = x.id AND ${ts.sql}))
         ORDER BY x.created_at DESC LIMIT 6`,
      )
      .bind(like, pv.toanBo ? 1 : 0, user.email, ...ts.binds),
  ]);

  const phieu = [
    ...phieuCk.results.map((r) => ({ ...r, loai_phieu: "chuyen_kho" })),
    ...phieuGn.results.map((r) => ({ ...r, loai_phieu: "giao_nhan" })),
    ...phieuXl.results.map((r) => ({ ...r, loai_phieu: "xu_ly" })),
  ].slice(0, 8);

  return c.json({ tai_san: taiSan.results, vat_tu: vatTu.results, nhan_vien: nhanVien.results, phieu });
});

export default dashboard;
