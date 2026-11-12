import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { nowVN } from "../lib/vnTime";
import { docTrang, layTrang } from "../lib/phanTrang";
import { LoiGop, lapKeHoach, lenhThucHien, type GiuEmail, type YeuCau } from "../lib/gopNhanVien";
import { coCongTy, congTyLoc, congTyTao, duocThemNvVaoCongTy, khoPhuTrach, laHcns } from "../lib/quyen";
import type { AppUser } from "../types";
import { congTyCuaNv, lenhTaoKhoQl, NV_THUOC_CT } from "../lib/nvCongTy";
import { TEN_NV } from "../lib/nhanCongTy";
import { layPhamVi } from "../lib/phamVi";

/** Ho so ton tai + nguoi dung la HCNS/Admin 1 trong cac cong ty cua ho so (da phap nhan, nhan vien kiem nhiem). */
async function nvQuanTri(db: D1Database, user: AppUser, maNv: string) {
  const cts = await congTyCuaNv(db, maNv);
  if (!cts.length) return { error: "NOT_FOUND" as const, status: 404 as const };
  if (!cts.some((ct) => laHcns(user, ct))) return { error: "FORBIDDEN" as const, status: 403 as const };
  return { congTyId: cts[0], congTyPhu: cts.slice(1) };
}

/** Danh sach cong ty kiem nhiem tu body: so nguyen, bo trung, bo cong ty chinh. */
function docCongTyPhu(v: unknown, chinh: number): number[] | null {
  if (v === undefined) return null;
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map(Number).filter((x) => Number.isInteger(x) && x > 0 && x !== chinh))];
}

/**
 * Lenh ghi lai cong ty kiem nhiem (bo cong ty khong con, them cong ty moi - giu nguyen dong cu kem nguoi them) + tao kho
 * QL o cong ty moi neu can (cho NV va QL cua NV).
 */
function lenhCongTyPhu(db: D1Database, maNv: string, phu: number[], quanLy: string | null, nguoiThem: string) {
  const now = nowVN();
  const s = [db.prepare("DELETE FROM nhan_vien_cong_ty WHERE ma_nv = ? AND cong_ty_id NOT IN (SELECT value FROM json_each(?))").bind(maNv, JSON.stringify(phu))];
  for (const ct of phu) {
    s.push(
      db.prepare("INSERT OR IGNORE INTO nhan_vien_cong_ty (ma_nv, cong_ty_id, created_at, nguoi_them) VALUES (?, ?, ?, ?)").bind(maNv, ct, now, nguoiThem),
    );
  }
  s.push(lenhTaoKhoQl(db, maNv, now));
  if (quanLy) s.push(lenhTaoKhoQl(db, quanLy, now));
  return s;
}

// Bo dau + viet thuong de so khop ten tieng Viet (khong phan biet hoa/thuong, dau).
function boDau(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u0111/gi, "d").toLowerCase().trim();
}

const nhanVien = new Hono<{ Bindings: Env }>();
nhanVien.use("*", verifySessionMiddleware, loadUser);

const TS_DANG_GIU = `SELECT 1 FROM ccdc c WHERE c.nguoi_dang_giu = n.ma_nv AND c.vo_hieu_hoa = 0
               AND c.trang_thai_hien_tai NOT IN ('Da thanh ly', 'Da tieu huy')`;
const CAP_DUOI = "SELECT 1 FROM nhan_vien x WHERE x.quan_ly_id = n.ma_nv AND x.dang_lam_viec = 1";

function dkTrangThai(tt: string | undefined) {
  return tt === "tat-ca" ? "1=1" : tt === "nghi" ? "n.dang_lam_viec = 0" : "n.dang_lam_viec = 1";
}

// GET /?trang_thai=nghi|tat-ca&search=&bo_phan=&loc=quan-ly|chua-co-ql|giu-ts&quan_ly_id=&page=&gon=1
// Mac dinh chi NV dang lam viec. ?page=N -> 1 trang { rows, total } (bang man Nhan vien - truoc day tai
// ca ~1.800 ho so, moi dong 2 truy van con dem). ?gon=1 -> chi ma + ten (o chon nhan vien trong form).
nhanVien.get("/", async (c) => {
  const q = (k: string) => c.req.query(k)?.trim() || undefined;
  // Nhan vien cac cong ty dang xem; ?cong_ty_id= cho o chon nguoi nhan theo cong ty cua kho trong form.
  // Nhan vien kiem nhiem (nhan_vien_cong_ty) hien o MOI cong ty ho thuoc ve.
  const conditions = [dkTrangThai(q("trang_thai")), NV_THUOC_CT("n.ma_nv")];
  const binds: unknown[] = [JSON.stringify(congTyLoc(c.get("user"), q("cong_ty_id")))];
  const search = q("search");
  if (search) {
    const cot = ["n.ma_nv", "n.ten_nv", "COALESCE(n.bo_phan,'')", "COALESCE(n.chuc_vu,'')", "COALESCE(n.email_dang_nhap,'')"];
    conditions.push(`(${cot.map((x) => `LOWER(${x}) LIKE LOWER(?)`).join(" OR ")})`);
    binds.push(...cot.map(() => `%${search}%`));
  }
  if (q("bo_phan")) {
    conditions.push("n.bo_phan = ?");
    binds.push(q("bo_phan"));
  }
  if (q("quan_ly_id")) {
    conditions.push("n.quan_ly_id = ?");
    binds.push(q("quan_ly_id"));
  }
  const loc = q("loc");
  if (loc === "quan-ly") conditions.push(`EXISTS (${CAP_DUOI})`);
  else if (loc === "chua-co-ql") conditions.push("n.quan_ly_id IS NULL");
  else if (loc === "giu-ts") conditions.push(`EXISTS (${TS_DANG_GIU})`);
  const where = conditions.join(" AND ");

  if (q("gon") === "1") {
    // cong_ty_ids = cong ty chinh + kiem nhiem (o chon nguoi nhan trong form loc theo cong ty kho bang danh sach nay).
    const { results } = await c.env.DB.prepare(
      `SELECT n.ma_nv, ${TEN_NV("n")} AS ten_nv, n.cong_ty_id, (SELECT group_concat(v.cong_ty_id) FROM v_nv_cong_ty v WHERE v.ma_nv = n.ma_nv) AS cts
       FROM nhan_vien n WHERE ${where} ORDER BY n.ten_nv`,
    )
      .bind(...binds)
      .all<{ ma_nv: string; ten_nv: string; cong_ty_id: number; cts: string | null }>();
    return c.json({ rows: results.map(({ cts, ...n }) => ({ ...n, cong_ty_ids: (cts ?? String(n.cong_ty_id)).split(",").map(Number) })) });
  }

  const sql = `SELECT n.ma_nv, n.ten_nv, n.bo_phan, n.chuc_vu, n.sdt, n.email_dang_nhap, n.dang_lam_viec, n.ma_etx,
            n.quan_ly_id, ${TEN_NV("ql")} AS quan_ly_ten, n.cong_ty_id,
            (SELECT json_group_array(x.cong_ty_id) FROM nhan_vien_cong_ty x WHERE x.ma_nv = n.ma_nv) AS cong_ty_phu,
            (SELECT COUNT(*) FROM nhan_vien x WHERE x.quan_ly_id = n.ma_nv AND x.dang_lam_viec = 1) AS so_cap_duoi,
            (SELECT COUNT(*) FROM ccdc c WHERE c.nguoi_dang_giu = n.ma_nv AND c.vo_hieu_hoa = 0
               AND c.trang_thai_hien_tai NOT IN ('Da thanh ly', 'Da tieu huy')) AS so_ts_dang_giu,
            n.updated_at
     FROM nhan_vien n LEFT JOIN nhan_vien ql ON ql.ma_nv = n.quan_ly_id
     WHERE ${where} ORDER BY n.ten_nv`;
  const trang = docTrang(c);
  if (trang) return c.json(await layTrang(c.env.DB, trang, { sql: `SELECT COUNT(*) AS n FROM nhan_vien n WHERE ${where}`, binds }, { sql, binds }));
  const { results } = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all();
  return c.json({ rows: results });
});

// GET /thong-ke?trang_thai= - KPI + so dem tab + danh sach bo phan cho man Nhan vien (thay cho viec
// tai ca danh sach ve trinh duyet de dem).
nhanVien.get("/thong-ke", async (c) => {
  // Cong ty dang xem: chen thang danh sach id (so nguyen tu loadUser, khong phai du lieu client).
  const dk = `${dkTrangThai(c.req.query("trang_thai"))} AND n.ma_nv IN (SELECT ma_nv FROM v_nv_cong_ty WHERE cong_ty_id IN (${c.get("user").cong_ty_xem.map(Number).join(",") || "0"}))`;
  const [tk, bp] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT COUNT(*) AS tong,
              SUM(CASE WHEN EXISTS (${CAP_DUOI}) THEN 1 ELSE 0 END) AS quan_ly,
              SUM(CASE WHEN n.quan_ly_id IS NULL THEN 1 ELSE 0 END) AS chua_co_ql,
              SUM(CASE WHEN EXISTS (${TS_DANG_GIU}) THEN 1 ELSE 0 END) AS giu_ts,
              SUM(CASE WHEN n.email_dang_nhap IS NOT NULL THEN 1 ELSE 0 END) AS co_tk,
              (SELECT COUNT(*) FROM ccdc c JOIN nhan_vien n ON n.ma_nv = c.nguoi_dang_giu WHERE ${dk} AND c.vo_hieu_hoa = 0
                 AND c.trang_thai_hien_tai NOT IN ('Da thanh ly', 'Da tieu huy')) AS so_ts_giu
       FROM nhan_vien n WHERE ${dk}`,
    ),
    c.env.DB.prepare(`SELECT DISTINCT n.bo_phan FROM nhan_vien n WHERE ${dk} AND n.bo_phan IS NOT NULL AND n.bo_phan != '' ORDER BY n.bo_phan`),
  ]);
  const r = (tk.results[0] ?? {}) as Record<string, number | null>;
  return c.json({
    tong: r.tong ?? 0,
    quan_ly: r.quan_ly ?? 0,
    chua_co_ql: r.chua_co_ql ?? 0,
    giu_ts: r.giu_ts ?? 0,
    co_tk: r.co_tk ?? 0,
    so_ts_giu: r.so_ts_giu ?? 0,
    bo_phan: (bp.results as { bo_phan: string }[]).map((x) => x.bo_phan),
  });
});

// GET /cap-duoi?ql=<ma_nv> - nhom cap duoi truc tiep. Mac dinh la nhom cua CHINH user dang dang
// nhap; chi Admin/HCNS moi xem duoc nhom cua QL khac qua ?ql=.
nhanVien.get("/cap-duoi", async (c) => {
  const user = c.get("user");
  const qlParam = c.req.query("ql");
  const ql = qlParam && (user.vai_tro === "Admin" || user.vai_tro === "HCNS") ? qlParam : user.ma_nv;
  if (!ql) return c.json({ rows: [] });
  const { results } = await c.env.DB.prepare(
    `SELECT n.ma_nv, ${TEN_NV("n")} AS ten_nv, n.bo_phan, n.chuc_vu, n.email_dang_nhap,
            (SELECT COUNT(*) FROM ccdc c WHERE c.nguoi_dang_giu = n.ma_nv AND c.vo_hieu_hoa = 0) AS so_ts_dang_giu
     FROM nhan_vien n WHERE n.quan_ly_id = ? AND n.dang_lam_viec = 1 ORDER BY n.ten_nv`,
  )
    .bind(ql)
    .all();
  return c.json({ rows: results });
});

// (Dang ky TRUOC "/:ma_nv" - Hono khop theo thu tu, "/:ma_nv" se nuot "/etx".)
// GET /etx?search= - tra danh ba ETX day du (ca nguoi da nghi) + ho so CCDC dang giu ma do.
nhanVien.get("/etx", requireRole("Admin", "HCNS"), async (c) => {
  const q = boDau(c.req.query("search") ?? "");
  if (q.length < 2) return c.json({ rows: [] });
  // Loc o JS (khong dung LIKE): LIKE cua SQLite phan biet hoa/thuong voi chu co dau ("Bình An" != "BÌNH AN").
  // Danh ba ~3.600 dong - doc het moi lan tra van nhe.
  const { results } = await c.env.DB.prepare(
    `SELECT e.ma_nhan_su, e.ho_ten, e.chuc_danh, e.gmail, e.trang_thai_lam_viec, n.ma_nv AS ho_so_ma_nv, n.ten_nv AS ho_so_ten
     FROM etx_nhan_su e LEFT JOIN nhan_vien n ON n.ma_etx = e.ma_nhan_su`,
  ).all<{ ma_nhan_su: string; ho_ten: string; gmail: string | null; trang_thai_lam_viec: string }>();
  const rows = results
    .filter((e) => boDau(e.ma_nhan_su) === q || boDau(e.ho_ten).includes(q) || boDau(e.gmail ?? "").includes(q))
    .sort((a, b) => (a.trang_thai_lam_viec === b.trang_thai_lam_viec ? a.ho_ten.localeCompare(b.ho_ten, "vi") : a.trang_thai_lam_viec === "on" ? -1 : 1))
    .slice(0, 20);
  return c.json({ rows });
});

// GET /cong-ty-khac?search=&cong_ty_id= - goi y khi tim nhan vien KHONG thay trong cong ty dang xem / cong ty cua form
// (2026-10-28, user yeu cau): ho so khop o CONG TY KHAC (vd dang xem 3T, nguoi do thuoc NSKX). Khop ma / ten / email bo
// dau, loc o JS. Admin/HCNS/KT thay moi cong ty (de them kiem nhiem); con lai chi cac cong ty tai khoan duoc phep.
// Moi dong: cong ty cua ho so, xem_duoc (doi cong ty dang xem sang de thay), them_duoc (cong ty dang tim ma nguoi dung
// them kiem nhiem duoc - cung quy tac PUT: HCNS ca cong ty them lan 1 cong ty cua ho so).
nhanVien.get("/cong-ty-khac", async (c) => {
  const user = c.get("user");
  const tuKhoa = boDau(c.req.query("search") ?? "");
  if (tuKhoa.length < 2) return c.json({ rows: [] });
  const dangTim = congTyLoc(user, c.req.query("cong_ty_id"));
  // Cong ty dang tim ma nguoi dung them nhan vien vao duoc (HCNS / thu kho HCNS-Mien-Trung chuyen-QL) -> thay moi cong ty.
  const dsKho = await khoPhuTrach(c.env.DB, user);
  const quyenThem: number[] = [];
  for (const ct of dangTim) if (await duocThemNvVaoCongTy(c.env.DB, user, ct, dsKho)) quyenThem.push(ct);
  const toanBo = user.vai_tro === "Admin" || user.vai_tro === "HCNS" || user.vai_tro === "Ke toan" || quyenThem.length > 0;
  const [nvs, cts] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT n.ma_nv, n.ten_nv, n.bo_phan, n.chuc_vu, n.email_dang_nhap, n.dang_lam_viec, n.cong_ty_id,
              (SELECT json_group_array(v.cong_ty_id) FROM v_nv_cong_ty v WHERE v.ma_nv = n.ma_nv) AS cts
       FROM nhan_vien n
       WHERE NOT EXISTS (SELECT 1 FROM v_nv_cong_ty v WHERE v.ma_nv = n.ma_nv AND v.cong_ty_id IN (SELECT value FROM json_each(?)))`,
    ).bind(JSON.stringify(dangTim)),
    c.env.DB.prepare("SELECT id, ma, ten FROM cong_ty"),
  ]);
  const ctMap = new Map((cts.results as { id: number; ma: string; ten: string }[]).map((x) => [x.id, x]));
  type Nv = { ma_nv: string; ten_nv: string; bo_phan: string | null; chuc_vu: string | null; email_dang_nhap: string | null; dang_lam_viec: number; cong_ty_id: number; cts: string };
  const rows = (nvs.results as Nv[])
    .map((n) => ({ ...n, ds: (JSON.parse(n.cts || "[]") as number[]).filter(Boolean) }))
    .filter((n) => toanBo || n.ds.some((ct) => user.cong_ty_ids.includes(ct)))
    .filter((n) => [n.ma_nv, n.ten_nv, n.email_dang_nhap ?? ""].some((x) => boDau(x).includes(tuKhoa)))
    // Dang lam viec truoc, ten khop dau chuoi truoc.
    .sort((a, b) => b.dang_lam_viec - a.dang_lam_viec || Number(!boDau(a.ten_nv).startsWith(tuKhoa)) - Number(!boDau(b.ten_nv).startsWith(tuKhoa)))
    .slice(0, 8)
    .map((n) => {
      return {
        ma_nv: n.ma_nv,
        ten_nv: n.ten_nv,
        bo_phan: n.bo_phan,
        chuc_vu: n.chuc_vu,
        dang_lam_viec: n.dang_lam_viec,
        cong_ty: n.ds.map((id) => ({ id, ma: ctMap.get(id)?.ma ?? String(id), ten: ctMap.get(id)?.ten ?? "", chinh: id === n.cong_ty_id })),
        xem_duoc: n.ds.filter((ct) => user.cong_ty_ids.includes(ct)),
        them_duoc: n.dang_lam_viec ? quyenThem.map((id) => ({ id, ma: ctMap.get(id)?.ma ?? String(id) })) : [],
      };
    });
  return c.json({ rows });
});

// GET /:ma_nv/ho-so - HO SO 1 nhan vien tren 1 man (2026-11-12, user: tim nhan vien -> mo thang chi tiet): thong tin, tai
// san dang giu, tieu hao duoc cap phat (tung lan + gop theo mat hang), lich su giao nhan tai san. Quyen: chinh minh,
// Admin/KT/HCNS (cong ty dang xem), QL voi nhom cua minh - cung pham vi o tim kiem. Du lieu loc theo cong ty dang xem.
nhanVien.get("/:ma_nv/ho-so", async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const ma = c.req.param("ma_nv") ?? "";
  const pv = await layPhamVi(db, user);
  if (ma !== user.ma_nv && !pv.toanBo && !pv.nhomMaNv.includes(ma)) return c.json({ error: "FORBIDDEN" }, 403);
  const ctXem = JSON.stringify(user.cong_ty_xem);
  const [nvR, cts, ts, gn, th, cd] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT n.ma_nv, n.ten_nv, n.bo_phan, n.chuc_vu, n.sdt, n.email_dang_nhap, n.dang_lam_viec, n.ma_etx, n.cong_ty_id,
                n.quan_ly_id, ql.ten_nv AS quan_ly_ten, n.updated_at
         FROM nhan_vien n LEFT JOIN nhan_vien ql ON ql.ma_nv = n.quan_ly_id WHERE n.ma_nv = ?`,
      )
      .bind(ma),
    db.prepare("SELECT v.cong_ty_id AS id, ct.ma, ct.ten FROM v_nv_cong_ty v JOIN cong_ty ct ON ct.id = v.cong_ty_id WHERE v.ma_nv = ?").bind(ma),
    db
      .prepare(
        `SELECT c.id, c.ten_ccdc, n.ten_nhom, c.trang_thai_hien_tai, c.tinh_trang, c.so_seri, c.nguyen_gia, c.ngay_mua, c.han_bao_hanh,
                ct.ma AS cong_ty_ma,
                (SELECT MAX(g.ngay_lap) FROM phieu_giao_nhan_ct x JOIN phieu_giao_nhan g ON g.id = x.phieu_id
                 WHERE x.ccdc_id = c.id AND (g.nhan_vien_id = ?1 AND g.loai_phieu = 'Cap phat' OR g.nhan_vien_nhan_moi_id = ?1)) AS ngay_nhan
         FROM ccdc c LEFT JOIN nhom_ccdc n ON n.id = c.nhom_id LEFT JOIN cong_ty ct ON ct.id = c.cong_ty_id
         WHERE c.nguoi_dang_giu = ?1 AND c.vo_hieu_hoa = 0 AND c.trang_thai_hien_tai NOT IN ('Da thanh ly', 'Da tieu huy')
           AND c.cong_ty_id IN (SELECT value FROM json_each(?2))
         ORDER BY c.ten_ccdc, c.id`,
      )
      .bind(ma, ctXem),
    db
      .prepare(
        `SELECT g.id AS phieu_id, g.ma_phieu, g.loai_phieu, g.ngay_lap, g.da_xac_nhan, g.xac_nhan_luc, g.nguoi_lap, g.ghi_chu,
                g.nhan_vien_id, g.nhan_vien_nhan_moi_id, ${TEN_NV("a")} AS nv_giu_ten, ${TEN_NV("b")} AS nv_moi_ten,
                kt.ten_kho AS tu_kho, kd.ten_kho AS den_kho, x.ccdc_id, c.ten_ccdc, c.nguyen_gia
         FROM phieu_giao_nhan g JOIN phieu_giao_nhan_ct x ON x.phieu_id = g.id JOIN ccdc c ON c.id = x.ccdc_id
         LEFT JOIN nhan_vien a ON a.ma_nv = g.nhan_vien_id LEFT JOIN nhan_vien b ON b.ma_nv = g.nhan_vien_nhan_moi_id
         LEFT JOIN kho kt ON kt.id = g.tu_kho_id LEFT JOIN kho kd ON kd.id = g.den_kho_id
         WHERE (g.nhan_vien_id = ?1 OR g.nhan_vien_nhan_moi_id = ?1) AND c.cong_ty_id IN (SELECT value FROM json_each(?2))
         ORDER BY g.ngay_lap DESC LIMIT 5000`,
      )
      .bind(ma, ctXem),
    db
      .prepare(
        `SELECT p.id AS phieu_id, p.ma_phieu, p.created_at, p.trang_thai, p.da_xac_nhan, p.xac_nhan_luc, p.nguoi_lap, p.ghi_chu,
                k.ten_kho AS tu_kho, ct.vt_id, v.ten_vt, v.don_vi_tinh, nh.ten_nhom, ct.so_luong, ct.don_gia,
                COALESCE(ct.thanh_tien, ct.so_luong * COALESCE(ct.don_gia, v.don_gia_tham_khao)) AS thanh_tien
         FROM phieu_chuyen_kho p JOIN phieu_chuyen_kho_ct ct ON ct.phieu_id = p.id JOIN vt_tieu_hao v ON v.id = ct.vt_id
         JOIN kho k ON k.id = p.tu_kho_id LEFT JOIN nhom_ccdc nh ON nh.id = v.nhom_id
         WHERE p.loai = 'Cap phat NV' AND p.den_nhan_vien_id = ?1 AND k.cong_ty_id IN (SELECT value FROM json_each(?2))
         ORDER BY p.created_at DESC LIMIT 5000`,
      )
      .bind(ma, ctXem),
    // Nhan su dang quan ly (2026-11-12): cap duoi truc tiep + gian tiep (de quy theo quan_ly_id, toi da 6 cap), dang lam
    // viec, thuoc cong ty dang xem; kem so TS dang giu + gia tri, so phieu tieu hao duoc cap.
    db
      .prepare(
        `WITH RECURSIVE cay(ma_nv, cap, duong) AS (
           SELECT ma_nv, 1, '/' || ma_nv || '/' FROM nhan_vien WHERE quan_ly_id = ?1 AND dang_lam_viec = 1
           UNION ALL
           SELECT n.ma_nv, cay.cap + 1, cay.duong || n.ma_nv || '/' FROM nhan_vien n JOIN cay ON n.quan_ly_id = cay.ma_nv
           WHERE n.dang_lam_viec = 1 AND cay.cap < 6 AND instr(cay.duong, '/' || n.ma_nv || '/') = 0
         )
         SELECT n.ma_nv, ${TEN_NV("n")} AS ten_nv, n.bo_phan, n.chuc_vu, n.sdt, n.email_dang_nhap, MIN(cay.cap) AS cap,
                n.quan_ly_id, ql.ten_nv AS quan_ly_ten,
                (SELECT COUNT(*) FROM nhan_vien x WHERE x.quan_ly_id = n.ma_nv AND x.dang_lam_viec = 1) AS so_cap_duoi,
                (SELECT COUNT(*) FROM ccdc c WHERE c.nguoi_dang_giu = n.ma_nv AND c.vo_hieu_hoa = 0
                   AND c.trang_thai_hien_tai NOT IN ('Da thanh ly', 'Da tieu huy') AND c.cong_ty_id IN (SELECT value FROM json_each(?2))) AS so_ts,
                (SELECT COALESCE(SUM(c.nguyen_gia), 0) FROM ccdc c WHERE c.nguoi_dang_giu = n.ma_nv AND c.vo_hieu_hoa = 0
                   AND c.trang_thai_hien_tai NOT IN ('Da thanh ly', 'Da tieu huy') AND c.cong_ty_id IN (SELECT value FROM json_each(?2))) AS gia_tri_ts,
                (SELECT COUNT(*) FROM phieu_chuyen_kho p JOIN kho k ON k.id = p.tu_kho_id WHERE p.loai = 'Cap phat NV' AND p.trang_thai = 'Da giao'
                   AND p.den_nhan_vien_id = n.ma_nv AND k.cong_ty_id IN (SELECT value FROM json_each(?2))) AS so_phieu_th
         FROM cay JOIN nhan_vien n ON n.ma_nv = cay.ma_nv LEFT JOIN nhan_vien ql ON ql.ma_nv = n.quan_ly_id
         WHERE n.ma_nv IN (SELECT ma_nv FROM v_nv_cong_ty WHERE cong_ty_id IN (SELECT value FROM json_each(?2)))
         GROUP BY n.ma_nv ORDER BY cap, n.ten_nv`,
      )
      .bind(ma, ctXem),
  ]);
  const nv = nvR.results[0];
  if (!nv) return c.json({ error: "NOT_FOUND" }, 404);
  if (ma !== user.ma_nv && !(cts.results as { id: number }[]).some((x) => user.cong_ty_ids.includes(x.id))) return c.json({ error: "FORBIDDEN" }, 403);

  const N = (v: unknown) => Number(v ?? 0) || 0;
  // Huong giao nhan voi CHINH nhan vien nay: nhan vao / tra ra.
  const giaoNhan = gn.results.map((r) => {
    const loai = String(r.loai_phieu);
    const nhanVao = loai === "Cap phat" || (loai === "Dieu chuyen" && r.nhan_vien_nhan_moi_id === ma);
    return {
      ...r,
      huong: nhanVao ? "nhan" : "tra",
      doi_tac: loai === "Dieu chuyen" ? (nhanVao ? r.nv_giu_ten : r.nv_moi_ten) : loai === "Cap phat" ? r.tu_kho : r.den_kho,
    };
  });
  // Tieu hao: phieu 'Da giao' moi co hieu luc (tieu hao het khi giao); da_xac_nhan = NV da bam nhan.
  const tieuHao = th.results;
  const hieuLuc = tieuHao.filter((r) => r.trang_thai === "Da giao");
  const theoVt = new Map<string, { vt_id: string; ten_vt: unknown; don_vi_tinh: unknown; ten_nhom: unknown; so_luong: number; so_lan: number; gia_tri: number; da_nhan: number; cho_xac_nhan: number; lan_dau: string; lan_cuoi: string }>();
  for (const r of hieuLuc) {
    const k = String(r.vt_id);
    const x = theoVt.get(k) ?? { vt_id: k, ten_vt: r.ten_vt, don_vi_tinh: r.don_vi_tinh, ten_nhom: r.ten_nhom, so_luong: 0, so_lan: 0, gia_tri: 0, da_nhan: 0, cho_xac_nhan: 0, lan_dau: String(r.created_at), lan_cuoi: String(r.created_at) };
    x.so_luong += N(r.so_luong);
    x.so_lan++;
    x.gia_tri += N(r.thanh_tien);
    if (r.da_xac_nhan) x.da_nhan += N(r.so_luong);
    else x.cho_xac_nhan += N(r.so_luong);
    if (String(r.created_at) < x.lan_dau) x.lan_dau = String(r.created_at);
    if (String(r.created_at) > x.lan_cuoi) x.lan_cuoi = String(r.created_at);
    theoVt.set(k, x);
  }
  const phieuCho = new Set(hieuLuc.filter((r) => !r.da_xac_nhan).map((r) => r.phieu_id));
  return c.json({
    nv: { ...nv, cong_ty: cts.results },
    tong: {
      ts_so: ts.results.length,
      ts_gia_tri: ts.results.reduce((s, r) => s + N(r.nguyen_gia), 0),
      ts_cho_xac_nhan: gn.results.filter((r, i) => giaoNhan[i].huong === "nhan" && !r.da_xac_nhan).length,
      th_so_phieu: new Set(hieuLuc.map((r) => r.phieu_id)).size,
      th_so_mat_hang: theoVt.size,
      th_gia_tri: hieuLuc.reduce((s, r) => s + N(r.thanh_tien), 0),
      th_phieu_cho_xac_nhan: phieuCho.size,
      th_lan_cuoi: hieuLuc[0]?.created_at ?? null,
    },
    tai_san: ts.results,
    giao_nhan: giaoNhan,
    tieu_hao: tieuHao,
    tieu_hao_theo_vt: [...theoVt.values()].sort((a, b) => b.lan_cuoi.localeCompare(a.lan_cuoi)),
    nhan_su: cd.results,
    cap_nhat_luc: nowVN(),
  });
});

nhanVien.get("/:ma_nv", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM nhan_vien WHERE ma_nv = ?").bind(c.req.param("ma_nv")).first<{ cong_ty_id: number }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  const cts = await congTyCuaNv(c.env.DB, c.req.param("ma_nv"));
  if (!cts.some((ct) => coCongTy(c.get("user"), ct))) return c.json({ error: "FORBIDDEN" }, 403);
  return c.json({ row: { ...row, cong_ty_phu: cts.slice(1) } });
});

interface Body {
  ma_nv?: string;
  ten_nv?: string;
  bo_phan?: string | null;
  chuc_vu?: string | null;
  sdt?: string | null;
  email_dang_nhap?: string | null;
  ghi_chu?: string | null;
  quan_ly_id?: string | null;
  cong_ty_id?: number;
  /** Cong ty kiem nhiem (ngoai cong ty chinh). Vang mat = giu nguyen. */
  cong_ty_phu?: number[];
}

// Gan quan ly truc tiep -> dam bao QL do co kho QL rieng o moi cong ty can (chuoi kho ... -> KHO QL -> NV). Idempotent.
const taoKhoQl = (db: D1Database, qlMaNv: string) => lenhTaoKhoQl(db, qlMaNv, nowVN());

/** Kiem quyen + hop le danh sach cong ty kiem nhiem: phai la HCNS/Admin cua moi cong ty THEM / BOT. */
async function kiemTraCongTyPhu(db: D1Database, user: AppUser, cu: number[], moi: number[]): Promise<string | null> {
  const doi = [...moi.filter((x) => !cu.includes(x)), ...cu.filter((x) => !moi.includes(x))];
  if (doi.some((ct) => !laHcns(user, ct))) return "FORBIDDEN";
  if (moi.length) {
    const r = await db.prepare("SELECT COUNT(*) AS n FROM cong_ty WHERE bat_tat = 1 AND id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(moi)).first<{ n: number }>();
    if ((r?.n ?? 0) !== moi.length) return "CONG_TY_NOT_FOUND";
  }
  return null;
}

// email_dang_nhap co FK users(email) - bao loi ro rang thay vi de FK loi 500. 1 tai khoan chi gan 1 ho so
// dang lam viec (user chot 2026-10-01: "1 nhan su chi co 1 tai khoan").
async function kiemTraEmail(db: D1Database, email: string | null | undefined, maNv?: string): Promise<string | null> {
  if (!email) return null;
  const u = await db.prepare("SELECT email FROM users WHERE email = ?").bind(email).first();
  if (!u) return "USER_CHUA_DANG_NHAP";
  const khac = await db
    .prepare("SELECT 1 FROM nhan_vien WHERE LOWER(email_dang_nhap) = LOWER(?) AND ma_nv != ? AND dang_lam_viec = 1 LIMIT 1")
    .bind(email, maNv ?? "")
    .first();
  return khac ? "EMAIL_DA_LIEN_KET" : null;
}

async function kiemTraQuanLy(db: D1Database, maNv: string, qlId: string | null | undefined): Promise<string | null> {
  if (!qlId) return null;
  if (qlId === maNv) return "QUAN_LY_LA_CHINH_MINH";
  const ql = await db.prepare("SELECT ma_nv FROM nhan_vien WHERE ma_nv = ? AND dang_lam_viec = 1").bind(qlId).first();
  return ql ? null : "QUAN_LY_NOT_FOUND";
}

nhanVien.post("/", requireRole("Admin", "HCNS"), async (c) => {
  const body = await c.req.json<Body>().catch(() => null);
  if (!body?.ma_nv?.trim() || !body?.ten_nv?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);

  const existing = await c.env.DB.prepare("SELECT ma_nv FROM nhan_vien WHERE ma_nv = ?").bind(body.ma_nv.trim()).first();
  if (existing) return c.json({ error: "MA_NV_EXISTS" }, 409);
  const congTyId = congTyTao(c.get("user"), body.cong_ty_id);
  if (!congTyId || !laHcns(c.get("user"), congTyId)) return c.json({ error: "CHON_CONG_TY" }, 400);
  const loiQl = await kiemTraQuanLy(c.env.DB, body.ma_nv.trim(), body.quan_ly_id);
  if (loiQl) return c.json({ error: loiQl }, 400);
  const loiEmail = await kiemTraEmail(c.env.DB, body.email_dang_nhap, body.ma_nv.trim());
  if (loiEmail) return c.json({ error: loiEmail }, 400);
  const phu = docCongTyPhu(body.cong_ty_phu, congTyId) ?? [];
  const loiPhu = await kiemTraCongTyPhu(c.env.DB, c.get("user"), [], phu);
  if (loiPhu) return c.json({ error: loiPhu }, loiPhu === "FORBIDDEN" ? 403 : 400);

  const stmts = [
    c.env.DB.prepare(
      `INSERT INTO nhan_vien (ma_nv, ten_nv, bo_phan, chuc_vu, sdt, email_dang_nhap, ghi_chu, quan_ly_id, cong_ty_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      body.ma_nv.trim(),
      body.ten_nv.trim(),
      body.bo_phan ?? null,
      body.chuc_vu ?? null,
      body.sdt ?? null,
      body.email_dang_nhap || null,
      body.ghi_chu ?? null,
      body.quan_ly_id || null,
      congTyId,
      nowVN(),
      nowVN(),
    ),
  ];
  if (body.quan_ly_id) stmts.push(taoKhoQl(c.env.DB, body.quan_ly_id));
  if (phu.length) stmts.push(...lenhCongTyPhu(c.env.DB, body.ma_nv.trim(), phu, body.quan_ly_id || null, c.get("user").email));
  await c.env.DB.batch(stmts);

  return c.json({ ok: true, ma_nv: body.ma_nv.trim() });
});

nhanVien.put("/:ma_nv", requireRole("Admin", "HCNS"), async (c) => {
  const maNv = c.req.param("ma_nv");
  const body = await c.req.json<Body>().catch(() => null);
  if (!body?.ten_nv?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);
  const user = c.get("user");
  const qt = await nvQuanTri(c.env.DB, user, maNv ?? "");
  if ("error" in qt) return c.json({ error: qt.error }, qt.status);
  // Doi cong ty chinh / kiem nhiem: phai co quyen moi cong ty them / bot; khong con giu TS cua cong ty bi bo (tai san
  // moi cong ty doc lap - thu hoi hoac chuyen cong ty TS truoc) va khong con kho QL o cong ty bi bo.
  const congTyMoi = body.cong_ty_id != null ? Number(body.cong_ty_id) : qt.congTyId;
  if (congTyMoi !== qt.congTyId && (!laHcns(user, congTyMoi) || !laHcns(user, qt.congTyId))) return c.json({ error: "FORBIDDEN" }, 403);
  const phuMoi = docCongTyPhu(body.cong_ty_phu, congTyMoi) ?? qt.congTyPhu.filter((x) => x !== congTyMoi);
  const loiPhu = await kiemTraCongTyPhu(c.env.DB, user, qt.congTyPhu, phuMoi);
  if (loiPhu) return c.json({ error: loiPhu }, loiPhu === "FORBIDDEN" ? 403 : 400);
  const tapMoi = JSON.stringify([congTyMoi, ...phuMoi]);
  const [giu, khoBo] = await c.env.DB.batch<{ n: number }>([
    c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM ccdc WHERE nguoi_dang_giu = ? AND vo_hieu_hoa = 0 AND cong_ty_id NOT IN (SELECT value FROM json_each(?))",
    ).bind(maNv, tapMoi),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM kho WHERE nhan_vien_id = ? AND cong_ty_id NOT IN (SELECT value FROM json_each(?))").bind(maNv, tapMoi),
  ]);
  const nGiu = giu.results[0]?.n ?? 0;
  if (nGiu > 0) return c.json({ error: "DANG_GIU_TS_CONG_TY_CU", so_luong: nGiu }, 400);
  if ((khoBo.results[0]?.n ?? 0) > 0) return c.json({ error: "CON_KHO_QL_CONG_TY_CU" }, 400);
  const loiQl = await kiemTraQuanLy(c.env.DB, maNv ?? "", body.quan_ly_id);
  if (loiQl) return c.json({ error: loiQl }, 400);
  const loiEmail = await kiemTraEmail(c.env.DB, body.email_dang_nhap, maNv);
  if (loiEmail) return c.json({ error: loiEmail }, 400);

  const stmts = [
    c.env.DB.prepare(
      `UPDATE nhan_vien SET ten_nv = ?, bo_phan = ?, chuc_vu = ?, sdt = ?, email_dang_nhap = ?, ghi_chu = ?,
           quan_ly_id = CASE WHEN ? = 1 THEN ? ELSE quan_ly_id END, cong_ty_id = ?, updated_at = ?
       WHERE ma_nv = ?`,
    ).bind(
      body.ten_nv.trim(),
      body.bo_phan ?? null,
      body.chuc_vu ?? null,
      body.sdt ?? null,
      body.email_dang_nhap || null,
      body.ghi_chu ?? null,
      // quan_ly_id vang mat trong body = giu nguyen (client cu khong gui truong nay).
      body.quan_ly_id === undefined ? 0 : 1,
      body.quan_ly_id || null,
      congTyMoi,
      nowVN(),
      maNv,
    ),
  ];
  if (body.quan_ly_id) stmts.push(taoKhoQl(c.env.DB, body.quan_ly_id));
  const ql = body.quan_ly_id === undefined ? ((await c.env.DB.prepare("SELECT quan_ly_id FROM nhan_vien WHERE ma_nv = ?").bind(maNv).first<{ quan_ly_id: string | null }>())?.quan_ly_id ?? null) : body.quan_ly_id || null;
  stmts.push(...lenhCongTyPhu(c.env.DB, maNv ?? "", phuMoi, ql, user.email));
  const [result] = await c.env.DB.batch(stmts);
  if ((result.meta.changes ?? 0) === 0) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json({ ok: true });
});

// POST /:ma_nv/them-kiem-nhiem { cong_ty_id } - them nhan vien (cong ty khac) vao danh sach nhan su cong ty `cong_ty_id`
// (kiem nhiem) - tu goi y "co o cong ty khac" / khi chon nguoi nhan tai san khac cong ty (popup xac nhan). KHONG ghi de cac
// truong khac cua ho so nhu PUT. Quyen: duocThemNvVaoCongTy (HCNS/Admin cong ty do, thu kho HCNS/Mien/Trung chuyen/QL cua
// cong ty do); ghi nguoi them. Tao kho QL neu can.
nhanVien.post("/:ma_nv/them-kiem-nhiem", async (c) => {
  const maNv = c.req.param("ma_nv") ?? "";
  const body = await c.req.json<{ cong_ty_id?: number }>().catch(() => null);
  const ct = Number(body?.cong_ty_id);
  if (!ct) return c.json({ error: "CHON_CONG_TY" }, 400);
  const user = c.get("user");
  if (!(await duocThemNvVaoCongTy(c.env.DB, user, ct))) return c.json({ error: "FORBIDDEN" }, 403);
  const cts = await congTyCuaNv(c.env.DB, maNv);
  if (!cts.length) return c.json({ error: "NOT_FOUND" }, 404);
  if (cts.includes(ct)) return c.json({ ok: true, da_co: true });
  const [nv, cty] = await Promise.all([
    c.env.DB.prepare("SELECT dang_lam_viec, quan_ly_id FROM nhan_vien WHERE ma_nv = ?").bind(maNv).first<{ dang_lam_viec: number; quan_ly_id: string | null }>(),
    c.env.DB.prepare("SELECT 1 AS ok FROM cong_ty WHERE id = ? AND bat_tat = 1").bind(ct).first(),
  ]);
  if (!nv?.dang_lam_viec) return c.json({ error: "HO_SO_DA_NGHI" }, 400);
  if (!cty) return c.json({ error: "CONG_TY_NOT_FOUND" }, 400);
  await c.env.DB.batch([
    ...lenhCongTyPhu(c.env.DB, maNv, [...cts.slice(1), ct], nv.quan_ly_id, user.email),
    c.env.DB.prepare("UPDATE nhan_vien SET updated_at = ? WHERE ma_nv = ?").bind(nowVN(), maNv),
  ]);
  return c.json({ ok: true });
});

// POST /:ma_nv/lien-ket-tai-khoan { email } - CHI gan email_dang_nhap (khong dung PUT ghi de ca ho so).
// Dung o "Tai san cua toi" khi Admin/HCNS chua lien ket ho so cua chinh minh. Khong ghi de lien ket san
// co: ho so da gan email khac / email da gan ho so dang lam viec khac -> 409.
nhanVien.post("/:ma_nv/lien-ket-tai-khoan", requireRole("Admin", "HCNS"), async (c) => {
  const maNv = c.req.param("ma_nv");
  const body = await c.req.json<{ email?: string }>().catch(() => null);
  const email = body?.email?.trim().toLowerCase();
  if (!email) return c.json({ error: "MISSING_FIELDS" }, 400);
  const qt = await nvQuanTri(c.env.DB, c.get("user"), maNv ?? "");
  if ("error" in qt) return c.json({ error: qt.error }, qt.status);
  const loiEmail = await kiemTraEmail(c.env.DB, email);
  if (loiEmail) return c.json({ error: loiEmail }, 400);

  const [nv, khac] = await Promise.all([
    c.env.DB.prepare("SELECT email_dang_nhap, dang_lam_viec FROM nhan_vien WHERE ma_nv = ?")
      .bind(maNv)
      .first<{ email_dang_nhap: string | null; dang_lam_viec: number }>(),
    c.env.DB.prepare("SELECT ma_nv FROM nhan_vien WHERE LOWER(email_dang_nhap) = ? AND ma_nv != ? AND dang_lam_viec = 1 LIMIT 1")
      .bind(email, maNv)
      .first<{ ma_nv: string }>(),
  ]);
  if (!nv) return c.json({ error: "NOT_FOUND" }, 404);
  if (!nv.dang_lam_viec) return c.json({ error: "HO_SO_DA_NGHI" }, 400);
  if (nv.email_dang_nhap && nv.email_dang_nhap.toLowerCase() !== email) return c.json({ error: "HO_SO_DA_LIEN_KET" }, 409);
  if (khac) return c.json({ error: "EMAIL_DA_LIEN_KET", ma_nv: khac.ma_nv }, 409);

  await c.env.DB.prepare("UPDATE nhan_vien SET email_dang_nhap = ?, updated_at = ? WHERE ma_nv = ?").bind(email, nowVN(), maNv).run();
  return c.json({ ok: true });
});

// ---- Doi ma / gop ho so / gan ma ETX chuan (lib/gopNhanVien.ts) ------------------------------------------
function docYeuCau(body: { loai?: string; dich?: string; ma_moi?: string; ma_etx?: string } | null): YeuCau | null {
  if (body?.loai === "gop" && body.dich) return { loai: "gop", dich: body.dich };
  if (body?.loai === "doi-ma" && body.ma_moi) return { loai: "doi-ma", maMoi: body.ma_moi };
  if (body?.loai === "gan-etx" && body.ma_etx) return { loai: "gan-etx", maEtx: body.ma_etx };
  return null;
}

// POST /:ma_nv/doi-ma { loai: gop|doi-ma|gan-etx, dich|ma_moi|ma_etx, giu_email?: dich|nguon, xem_truoc?: true }
// xem_truoc -> tra ke hoach (so tai san / phieu / kho se chuyen, canh bao), khong ghi gi.
nhanVien.post("/:ma_nv/doi-ma", requireRole("Admin", "HCNS"), async (c) => {
  const body = await c.req.json<{ loai?: string; dich?: string; ma_moi?: string; ma_etx?: string; giu_email?: GiuEmail; xem_truoc?: boolean }>().catch(() => null);
  const yc = docYeuCau(body);
  if (!yc) return c.json({ error: "MISSING_FIELDS" }, 400);
  const qt = await nvQuanTri(c.env.DB, c.get("user"), c.req.param("ma_nv") ?? "");
  if ("error" in qt) return c.json({ error: qt.error }, qt.status);
  try {
    const k = await lapKeHoach(c.env.DB, c.req.param("ma_nv") ?? "", yc, body?.giu_email === "nguon" ? "nguon" : "dich");
    if (body?.xem_truoc) return c.json({ ke_hoach: k });
    try {
      await c.env.DB.batch(lenhThucHien(c.env.DB, k, c.get("user").email));
    } catch (e) {
      if (String(e).includes("CHECK constraint failed")) return c.json({ error: "DU_LIEU_DA_DOI" }, 409);
      throw e;
    }
    return c.json({ ok: true, ma_dich: k.maDich });
  } catch (e) {
    if (e instanceof LoiGop) return c.json({ error: e.code, ...e.extra }, e.code === "NOT_FOUND" ? 404 : 400);
    throw e;
  }
});

// GET /:ma_nv/lich-su-ma - nhat ky doi ma / gop lien quan ho so nay (ca ma cu da gop vao).
nhanVien.get("/:ma_nv/lich-su-ma", async (c) => {
  const ma = c.req.param("ma_nv");
  const { results } = await c.env.DB.prepare(
    `SELECT id, thao_tac, ma_nguon, ten_nguon, ma_dich, ma_etx, chi_tiet, nguoi_thuc_hien, created_at
     FROM nhan_vien_lich_su_ma WHERE ma_nguon = ?1 OR ma_dich = ?1 ORDER BY id DESC LIMIT 50`,
  )
    .bind(ma)
    .all();
  return c.json({ rows: results });
});

// DELETE /:ma_nv - danh dau nghi viec (dang_lam_viec=0). Chan neu con dang giu CCDC nao.
nhanVien.delete("/:ma_nv", requireRole("Admin", "HCNS"), async (c) => {
  const maNv = c.req.param("ma_nv");
  const qt = await nvQuanTri(c.env.DB, c.get("user"), maNv ?? "");
  if ("error" in qt) return c.json({ error: qt.error }, qt.status);
  const holding = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM ccdc WHERE nguoi_dang_giu = ?").bind(maNv).first<{ n: number }>();
  if (holding && holding.n > 0) return c.json({ error: "DANG_GIU_CCDC" }, 400);

  await c.env.DB.prepare("UPDATE nhan_vien SET dang_lam_viec = 0, updated_at = ? WHERE ma_nv = ?").bind(nowVN(), maNv).run();
  return c.json({ ok: true });
});

export default nhanVien;
