import { Hono, type Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { dkCotKho, dkPhieuKho, dkTaiSan, layPhamVi, locTheoKho, type PhamVi } from "../lib/phamVi";
import { nowVN } from "../lib/vnTime";

const baoCao = new Hono<{ Bindings: Env }>();
baoCao.use("*", verifySessionMiddleware, loadUser, async (c, next) => {
  // Bao cao toan he thong: chi quan tri / thu kho / quan ly co nhom (nhan vien thuong -> 403).
  const pv = await layPhamVi(c.env.DB, c.get("user"));
  if (!pv.xemTongHop) return c.json({ error: "FORBIDDEN" }, 403);
  await next();
});

// Pham vi bao cao tai san: toan he thong (Admin/KT/HCNS) hoac kho phu trach + nhom (QL / thu kho).
// ?kho_id= thu hep ve 1 kho (kiem quyen qua locTheoKho, khong tin client). null = kho ngoai quyen.
async function phamViBaoCao(c: Context<{ Bindings: Env }>): Promise<PhamVi | null> {
  const pv = await layPhamVi(c.env.DB, c.get("user"));
  const khoId = c.req.query("kho_id");
  return khoId ? locTheoKho(c.env.DB, pv, Number(khoId)) : pv;
}
const CON_QUAN_LY = "c.vo_hieu_hoa = 0 AND c.trang_thai_hien_tai NOT IN ('Da thanh ly', 'Da tieu huy')";

// GET /ton-kho?kho_id= - ton TAI SAN TIEU HAO tinh dong (view v_ton_kho, KHONG denormalize - bai
// hoc cot "Tong ton hien tai" khong dang tin cua nguon cu). Co kho_id: ton tung vat tu tai kho do
// (+ so luong dang tren duong toi kho). Khong co kho_id: tong toan he thong + so kho con hang.
baoCao.get("/ton-kho", async (c) => {
  // Thu kho / QL chi xem ton kho minh phu trach (khong tin kho_id client gui); chi 1 kho -> xem thang kho do.
  const pv = await layPhamVi(c.env.DB, c.get("user"));
  const khoId = c.req.query("kho_id") || (!pv.toanBo && pv.khoIds.length === 1 ? String(pv.khoIds[0]) : undefined);
  if (khoId && !pv.toanBo && !pv.khoIds.includes(Number(khoId))) return c.json({ error: "FORBIDDEN" }, 403);
  if (khoId) {
    const { results } = await c.env.DB.prepare(
      `SELECT v.id, v.ten_vt, v.don_vi_tinh, n.ten_nhom, v.don_gia_tham_khao,
              COALESCE(t.ton, 0) AS ton,
              COALESCE((SELECT SUM(ct.so_luong) FROM phieu_chuyen_kho p JOIN phieu_chuyen_kho_ct ct ON ct.phieu_id = p.id
                        WHERE p.den_kho_id = ?1 AND p.trang_thai = 'Dang chuyen' AND ct.vt_id = v.id), 0) AS dang_chuyen_den
       FROM vt_tieu_hao v
       LEFT JOIN nhom_ccdc n ON n.id = v.nhom_id
       LEFT JOIN v_ton_kho t ON t.vt_id = v.id AND t.kho_id = ?1
       WHERE v.vo_hieu_hoa = 0 AND (COALESCE(t.ton, 0) != 0 OR EXISTS (
         SELECT 1 FROM phieu_chuyen_kho p JOIN phieu_chuyen_kho_ct ct ON ct.phieu_id = p.id
         WHERE p.den_kho_id = ?1 AND p.trang_thai = 'Dang chuyen' AND ct.vt_id = v.id))
       ORDER BY v.ten_vt`,
    )
      .bind(Number(khoId))
      .all();
    return c.json({ rows: results });
  }
  const { results } = await c.env.DB.prepare(
    `SELECT v.id, v.ten_vt, v.don_vi_tinh, n.ten_nhom, v.don_gia_tham_khao,
            COALESCE(SUM(t.ton), 0) AS ton,
            COUNT(CASE WHEN t.ton > 0 THEN 1 END) AS so_kho_con_hang,
            COUNT(CASE WHEN t.ton < 0 THEN 1 END) AS so_kho_am
     FROM vt_tieu_hao v
     LEFT JOIN nhom_ccdc n ON n.id = v.nhom_id
     LEFT JOIN v_ton_kho t ON t.vt_id = v.id AND (?1 = 1 OR t.kho_id IN (SELECT value FROM json_each(?2)))
     WHERE v.vo_hieu_hoa = 0
     GROUP BY v.id
     ORDER BY v.ten_vt`,
  )
    .bind(pv.toanBo ? 1 : 0, JSON.stringify(pv.khoIds))
    .all();
  return c.json({ rows: results });
});

// GET /ts-theo-kho?kho_id= - so tai san co dinh dang nam trong tung kho (trong pham vi).
baoCao.get("/ts-theo-kho", async (c) => {
  const pv = await phamViBaoCao(c);
  if (!pv) return c.json({ error: "FORBIDDEN" }, 403);
  const dk = dkCotKho(pv, "k.id");
  const { results } = await c.env.DB.prepare(
    `SELECT k.id, k.ten_kho, k.loai, COUNT(c.id) AS so_luong, COALESCE(SUM(c.nguyen_gia), 0) AS gia_tri,
            COUNT(CASE WHEN c.trang_thai_hien_tai = 'Hong' THEN 1 END) AS so_hong
     FROM kho k LEFT JOIN ccdc c ON c.kho_id = k.id AND ${CON_QUAN_LY}
     WHERE k.bat_tat = 1 AND k.loai != 'Mua hang' AND ${dk.sql}
     GROUP BY k.id HAVING COUNT(c.id) > 0 ORDER BY so_luong DESC`,
  )
    .bind(...dk.binds)
    .all();
  return c.json({ rows: results });
});

// GET /tong-quan?kho_id= - bang tong hop: tai san theo trang thai (SL + nguyen gia), tieu hao ton kho,
// phieu dang cho xu ly - tat ca trong pham vi nguoi xem.
baoCao.get("/tong-quan", async (c) => {
  const pv = await phamViBaoCao(c);
  if (!pv) return c.json({ error: "FORBIDDEN" }, 403);
  const ts = dkTaiSan(pv);
  const pk = dkPhieuKho(pv);
  const tk = dkCotKho(pv, "t.kho_id");
  const [theoTrangThai, tieuHao, choKt, dangChuyen, choKtXl, dotKk] = await Promise.all([
    c.env.DB.prepare(
      `SELECT c.trang_thai_hien_tai AS trang_thai, COUNT(*) AS so_luong, COALESCE(SUM(c.nguyen_gia), 0) AS gia_tri
       FROM ccdc c WHERE c.vo_hieu_hoa = 0 AND ${ts.sql} GROUP BY c.trang_thai_hien_tai ORDER BY so_luong DESC`,
    )
      .bind(...ts.binds)
      .all<{ trang_thai: string; so_luong: number; gia_tri: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(DISTINCT CASE WHEN t.ton > 0 THEN t.vt_id END) AS so_mat_hang,
              COALESCE(SUM(CASE WHEN t.ton > 0 THEN t.ton * COALESCE(v.don_gia_tham_khao, 0) END), 0) AS gia_tri,
              COUNT(CASE WHEN t.ton < 0 THEN 1 END) AS so_ton_am
       FROM v_ton_kho t JOIN vt_tieu_hao v ON v.id = t.vt_id JOIN kho k ON k.id = t.kho_id
       WHERE k.loai != 'Mua hang' AND ${tk.sql}`,
    )
      .bind(...tk.binds)
      .first<{ so_mat_hang: number; gia_tri: number; so_ton_am: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM phieu_chuyen_kho p WHERE p.trang_thai = 'Cho ke toan duyet' AND ${pk.sql}`)
      .bind(...pk.binds)
      .first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM phieu_chuyen_kho p WHERE p.trang_thai = 'Dang chuyen' AND ${pk.sql}`)
      .bind(...pk.binds)
      .first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(DISTINCT x.id) AS n FROM phieu_xu_ly_ts x JOIN phieu_xu_ly_ts_ct ct ON ct.phieu_id = x.id JOIN ccdc c ON c.id = ct.ccdc_id
       WHERE x.trang_thai = 'Cho ke toan duyet' AND ${ts.sql}`,
    )
      .bind(...ts.binds)
      .first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM dot_kiem_ke WHERE trang_thai = 'Dang thuc hien'`).first<{ n: number }>(),
  ]);
  return c.json({
    theo_trang_thai: theoTrangThai.results,
    tieu_hao: tieuHao ?? { so_mat_hang: 0, gia_tri: 0, so_ton_am: 0 },
    chuyen_kho_cho_kt: choKt?.n ?? 0,
    phieu_dang_chuyen: dangChuyen?.n ?? 0,
    xu_ly_ts_cho_kt: choKtXl?.n ?? 0,
    dot_kiem_ke_dang_thuc_hien: dotKk?.n ?? 0,
    cap_nhat_luc: nowVN(),
  });
});

// GET /theo-nhan-vien?kho_id= - tai san dang giu theo tung nhan vien (SL, nguyen gia, so hong).
baoCao.get("/theo-nhan-vien", async (c) => {
  const pv = await phamViBaoCao(c);
  if (!pv) return c.json({ error: "FORBIDDEN" }, 403);
  const ts = dkTaiSan(pv);
  const { results } = await c.env.DB.prepare(
    `SELECT nv.ma_nv, nv.ten_nv, nv.bo_phan, nv.chuc_vu, nv.dang_lam_viec, COUNT(c.id) AS so_luong_ccdc,
            COALESCE(SUM(c.nguyen_gia), 0) AS gia_tri,
            COUNT(CASE WHEN c.trang_thai_hien_tai = 'Hong' THEN 1 END) AS so_hong
     FROM nhan_vien nv JOIN ccdc c ON c.nguoi_dang_giu = nv.ma_nv AND ${CON_QUAN_LY}
     WHERE ${ts.sql}
     GROUP BY nv.ma_nv ORDER BY so_luong_ccdc DESC, nv.ten_nv`,
  )
    .bind(...ts.binds)
    .all();
  return c.json({ rows: results });
});

// GET /theo-bo-phan?kho_id= - tai san dang giu theo bo phan (gom qua nhan_vien.bo_phan).
baoCao.get("/theo-bo-phan", async (c) => {
  const pv = await phamViBaoCao(c);
  if (!pv) return c.json({ error: "FORBIDDEN" }, 403);
  const ts = dkTaiSan(pv);
  const { results } = await c.env.DB.prepare(
    `SELECT COALESCE(NULLIF(TRIM(nv.bo_phan), ''), 'Chưa rõ bộ phận') AS bo_phan, COUNT(DISTINCT nv.ma_nv) AS so_nhan_vien,
            COUNT(c.id) AS so_luong_ccdc, COALESCE(SUM(c.nguyen_gia), 0) AS gia_tri
     FROM ccdc c JOIN nhan_vien nv ON nv.ma_nv = c.nguoi_dang_giu
     WHERE ${CON_QUAN_LY} AND ${ts.sql}
     GROUP BY 1 ORDER BY so_luong_ccdc DESC`,
  )
    .bind(...ts.binds)
    .all();
  return c.json({ rows: results });
});

// GET /sap-het-bao-hanh?ngay=&kho_id= - TS het han bao hanh trong N ngay toi (mac dinh 30) + so TS
// da het han / chua nhap han bao hanh (bao cao noi ro do phu du lieu, khong gia vo "khong co gi").
baoCao.get("/sap-het-bao-hanh", async (c) => {
  const pv = await phamViBaoCao(c);
  if (!pv) return c.json({ error: "FORBIDDEN" }, 403);
  const ts = dkTaiSan(pv);
  const soNgay = Math.min(Math.max(Number(c.req.query("ngay") ?? 30) || 30, 1), 365);
  const homNay = nowVN().slice(0, 10);
  const denNgay = new Date(Date.parse(`${homNay}T00:00:00Z`) + soNgay * 86400e3).toISOString().slice(0, 10);
  const [ds, dem] = await Promise.all([
    c.env.DB.prepare(
      `SELECT c.id, c.ten_ccdc, c.han_bao_hanh, c.trang_thai_hien_tai, c.nha_cung_cap, c.nguyen_gia,
              nv.ten_nv AS nguoi_dang_giu_ten, k.ten_kho,
              CAST(julianday(date(c.han_bao_hanh)) - julianday(date(?)) AS INTEGER) AS con_lai
       FROM ccdc c LEFT JOIN nhan_vien nv ON nv.ma_nv = c.nguoi_dang_giu LEFT JOIN kho k ON k.id = c.kho_id
       WHERE ${CON_QUAN_LY} AND c.han_bao_hanh IS NOT NULL
         AND date(c.han_bao_hanh) BETWEEN date(?) AND date(?) AND ${ts.sql}
       ORDER BY c.han_bao_hanh ASC`,
    )
      .bind(homNay, homNay, denNgay, ...ts.binds)
      .all(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS tong, COUNT(c.han_bao_hanh) AS co_han,
              COUNT(CASE WHEN date(c.han_bao_hanh) < date(?) THEN 1 END) AS da_het
       FROM ccdc c WHERE ${CON_QUAN_LY} AND ${ts.sql}`,
    )
      .bind(homNay, ...ts.binds)
      .first<{ tong: number; co_han: number; da_het: number }>(),
  ]);
  return c.json({ rows: ds.results, so_ngay: soNgay, thong_ke: dem ?? { tong: 0, co_han: 0, da_het: 0 } });
});

// GET /kiem-ke-chenh-lech?dot_id=&kho_id= - dong kiem_ke_ct co chenh lech (khac "Dung vi tri").
baoCao.get("/kiem-ke-chenh-lech", async (c) => {
  const pv = await phamViBaoCao(c);
  if (!pv) return c.json({ error: "FORBIDDEN" }, 403);
  const ts = dkTaiSan(pv);
  const dotId = c.req.query("dot_id") || null;
  const { results } = await c.env.DB.prepare(
    `SELECT k.id, k.dot_kiem_ke_id, d.ten_dot, d.ma_phieu AS ma_dot, d.trang_thai AS trang_thai_dot, k.ccdc_id, c.ten_ccdc,
            c.nguyen_gia, k.tinh_trang_thuc_te, nvh.ten_nv AS he_thong_nguoi_giu_ten, kh.ten_kho AS he_thong_kho,
            k.nguoi_dang_giu_thuc_te, nv.ten_nv AS nguoi_dang_giu_thuc_te_ten, k.ghi_chu, k.kiem_ke_luc
     FROM kiem_ke_ct k
     JOIN dot_kiem_ke d ON d.id = k.dot_kiem_ke_id
     JOIN ccdc c ON c.id = k.ccdc_id
     LEFT JOIN nhan_vien nv ON nv.ma_nv = k.nguoi_dang_giu_thuc_te
     LEFT JOIN nhan_vien nvh ON nvh.ma_nv = c.nguoi_dang_giu
     LEFT JOIN kho kh ON kh.id = c.kho_id
     WHERE k.tinh_trang_thuc_te != 'Dung vi tri' AND (? IS NULL OR k.dot_kiem_ke_id = ?) AND ${ts.sql}
     ORDER BY k.kiem_ke_luc DESC`,
  )
    .bind(dotId, dotId, ...ts.binds)
    .all();
  return c.json({ rows: results });
});

// GET /da-thanh-ly?nam=&kho_id= - phieu thanh ly / tieu huy da hoan tat (+ nguyen gia TS, gia tri thu hoi).
baoCao.get("/da-thanh-ly", async (c) => {
  const pv = await phamViBaoCao(c);
  if (!pv) return c.json({ error: "FORBIDDEN" }, 403);
  const ts = dkTaiSan(pv);
  const nam = c.req.query("nam") || null;
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.ma_phieu, p.loai, p.ly_do, p.ngay_de_xuat, p.nguoi_de_xuat, u.ten AS nguoi_de_xuat_ten, p.gia_tri_thu_hoi,
            COUNT(ct.id) AS so_luong_ccdc, COALESCE(SUM(c.nguyen_gia), 0) AS nguyen_gia,
            GROUP_CONCAT(c.ten_ccdc, ', ') AS tom_tat
     FROM phieu_xu_ly_ts p
     JOIN phieu_xu_ly_ts_ct ct ON ct.phieu_id = p.id
     JOIN ccdc c ON c.id = ct.ccdc_id
     LEFT JOIN users u ON u.email = p.nguoi_de_xuat
     WHERE p.loai IN ('Thanh ly', 'Tieu huy') AND p.trang_thai = 'Da hoan tat'
       AND (? IS NULL OR substr(p.ngay_de_xuat, 1, 4) = ?) AND ${ts.sql}
     GROUP BY p.id
     ORDER BY p.ngay_de_xuat DESC`,
  )
    .bind(nam, nam, ...ts.binds)
    .all();
  return c.json({ rows: results });
});

export default baoCao;
