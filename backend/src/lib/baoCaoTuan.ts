import { layTonToiThieu, type DongTonToiThieu } from "./tonToiThieu";
import { nowVN } from "./vnTime";
import { TEN_KHO, TEN_NV } from "./nhanCongTy";

// Bao cao dinh ky gui email (2026-10-30): gom so lieu nhanh cua cac cong ty duoc chon trong ky [tu, den] - tai san, tai
// khoan, tieu hao, ton toi thieu, viec ton dong - va tu rut ra "diem noi bat". Dung chung cho email HTML, file Excel dinh
// kem, xem truoc va tai Excel tren giao dien (routes/baoCaoEmail.ts). KHONG theo pham vi nguoi xem: day la bao cao quan
// tri toan cong ty, chi Admin cau hinh / gui.

export const QUA_HAN_GIO = 48;

export interface SoGt {
  sl: number;
  gt: number;
}
export interface CongTyBc {
  id: number;
  ma: string;
  ten: string;
}
export interface DongTheoCongTy {
  cong_ty_id: number;
  tong: SoGt;
  trong_kho: SoGt;
  dang_su_dung: SoGt;
  hong: number;
  cho_duyet_nhap: number;
  duoi_toi_thieu: number;
}
export interface DongTieuHao {
  cong_ty_id: number;
  vt_id: string;
  ten_vt: string;
  don_vi_tinh: string | null;
  ten_nhom: string | null;
  sl_cap_nv: number;
  sl_tieu_dung: number;
  sl_nhap: number;
  gt_xuat: number;
  gt_nhap: number;
}
export interface DongViec {
  loai: string;
  ma_phieu: string;
  noi_dung: string;
  cong_ty_id: number | null;
  thoi_gian: string;
  gio_cho: number;
  qua_han: boolean;
}
export interface NoiBat {
  muc: "cao" | "trung_binh" | "tot";
  noi_dung: string;
}

export interface BaoCaoTuan {
  tu: string;
  den: string;
  tao_luc: string;
  cong_ty: CongTyBc[];
  tai_san: { tong: SoGt; trong_kho: SoGt; dang_su_dung: SoGt; hong: number; cho_duyet_nhap: number; ky_truoc: SoGt | null; ngay_ky_truoc: string | null };
  theo_cong_ty: DongTheoCongTy[];
  tai_khoan: { dang_su_dung: number; cho_duyet: number; bi_khoa: number; tu_choi: number; moi_trong_ky: number };
  bien_dong_ts: { nhap_moi: SoGt; cap_phat: number; thu_hoi: number; dieu_chuyen: number; bao_hong: number; thanh_ly: number; tieu_huy: number };
  tieu_hao: {
    nhap_mua: { so_phieu: number; gt: number };
    cap_phat_nv: { so_phieu: number; gt: number };
    tieu_dung_vp: { so_phieu: number; gt: number };
    chuyen_kho: number;
    chi_tiet: DongTieuHao[];
  };
  ton_toi_thieu: DongTonToiThieu[];
  ton_am: number;
  viec: { cho_ke_toan: number; cho_nhan: number; bi_tu_choi: number; qua_han: number; chi_tiet: DongViec[] };
  noi_bat: NoiBat[];
}

const SO = (v: unknown) => Number(v ?? 0) || 0;

function gioGiua(tu: string, den: string): number {
  return Math.max(0, Math.round((Date.parse(`${den.replace(" ", "T")}Z`) - Date.parse(`${tu.replace(" ", "T")}Z`)) / 36e5));
}
function congNgay(ngay: string, soNgay: number): string {
  const d = new Date(`${ngay.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + soNgay);
  return d.toISOString().slice(0, 10);
}

/** Ky mac dinh: 7 ngay ket thuc hom nay (gio VN) - cron toi thu 5 = thu 6 tuan truoc -> thu 5 nay. */
export function kyMacDinh(): { tu: string; den: string } {
  const den = nowVN().slice(0, 10);
  return { tu: congNgay(den, -6), den };
}

export async function thuThapBaoCao(db: D1Database, congTyIdsChon: number[] | null, tu: string, den: string): Promise<BaoCaoTuan> {
  const taoLuc = nowVN();
  const { results: dsCt } = await db.prepare("SELECT id, ma, ten FROM cong_ty WHERE bat_tat = 1 ORDER BY id").all<CongTyBc>();
  const congTy = congTyIdsChon?.length ? dsCt.filter((c) => congTyIdsChon.includes(c.id)) : dsCt;
  const ids = congTy.map((c) => c.id);
  const J = JSON.stringify(ids);
  const IN = "IN (SELECT value FROM json_each(?))";
  const tuTg = `${tu} 00:00:00`;
  const denTg = `${den} 23:59:59`;
  const ngayKyTruoc = congNgay(den, -7);

  const q = (sql: string, ...binds: unknown[]) => db.prepare(sql).bind(...binds);
  const kq = await db.batch<Record<string, unknown>>([
    // 0 tai san theo cong ty x trang thai x tinh trang
    q(`SELECT cong_ty_id, trang_thai_hien_tai AS tt, tinh_trang, COUNT(*) AS sl, COALESCE(SUM(nguyen_gia), 0) AS gt
       FROM ccdc WHERE vo_hieu_hoa = 0 AND cong_ty_id ${IN} GROUP BY 1, 2, 3`, J),
    // 1 tai khoan (toan he thong - users khong gan cong ty)
    q(`SELECT trang_thai_duyet AS tt, bi_khoa, COUNT(*) AS n, SUM(CASE WHEN created_at BETWEEN ? AND ? THEN 1 ELSE 0 END) AS moi
       FROM users WHERE email NOT LIKE '%@he-thong.local' GROUP BY 1, 2`, tuTg, denTg),
    // 2 bien dong giao nhan TSCD trong ky (so TS)
    q(`SELECT g.loai_phieu AS loai, COUNT(*) AS n FROM phieu_giao_nhan g JOIN phieu_giao_nhan_ct ct ON ct.phieu_id = g.id JOIN ccdc c ON c.id = ct.ccdc_id
       WHERE g.ngay_lap BETWEEN ? AND ? AND c.cong_ty_id ${IN} GROUP BY 1`, tuTg, denTg, J),
    // 3 phieu xu ly TS trong ky (so TS, gia tri)
    q(`SELECT x.loai, COUNT(*) AS n, COALESCE(SUM(c.nguyen_gia), 0) AS gt FROM phieu_xu_ly_ts x JOIN phieu_xu_ly_ts_ct ct ON ct.phieu_id = x.id JOIN ccdc c ON c.id = ct.ccdc_id
       WHERE x.created_at BETWEEN ? AND ? AND x.trang_thai NOT IN ('Ke toan tu choi', 'Tu choi') AND c.cong_ty_id ${IN} GROUP BY 1`, tuTg, denTg, J),
    // 4 tieu hao theo vat tu trong ky
    q(`SELECT v.cong_ty_id, v.id AS vt_id, v.ten_vt, v.don_vi_tinh, n.ten_nhom,
              SUM(CASE WHEN p.loai = 'Cap phat NV' AND p.trang_thai = 'Da giao' AND p.den_kho_id IS NULL THEN ct.so_luong ELSE 0 END) AS sl_cap_nv,
              SUM(CASE WHEN p.loai = 'Cap phat NV' AND p.trang_thai = 'Da giao' AND kd.loai = 'Tieu hao' THEN ct.so_luong ELSE 0 END) AS sl_tieu_dung,
              SUM(CASE WHEN p.loai = 'Nhap mua' AND p.trang_thai = 'Da nhan' THEN ct.so_luong ELSE 0 END) AS sl_nhap,
              SUM(CASE WHEN p.loai = 'Cap phat NV' AND p.trang_thai = 'Da giao' THEN COALESCE(ct.thanh_tien, ct.so_luong * COALESCE(v.don_gia_tham_khao, 0)) ELSE 0 END) AS gt_xuat,
              SUM(CASE WHEN p.loai = 'Nhap mua' AND p.trang_thai = 'Da nhan' THEN COALESCE(ct.thanh_tien, ct.so_luong * COALESCE(v.don_gia_tham_khao, 0)) ELSE 0 END) AS gt_nhap
       FROM phieu_chuyen_kho p JOIN phieu_chuyen_kho_ct ct ON ct.phieu_id = p.id JOIN vt_tieu_hao v ON v.id = ct.vt_id
       LEFT JOIN nhom_ccdc n ON n.id = v.nhom_id LEFT JOIN kho kd ON kd.id = p.den_kho_id
       WHERE p.loai IN ('Cap phat NV', 'Nhap mua') AND p.created_at BETWEEN ? AND ? AND v.cong_ty_id ${IN}
       GROUP BY v.id HAVING sl_cap_nv + sl_tieu_dung + sl_nhap > 0 ORDER BY gt_xuat DESC, sl_cap_nv + sl_tieu_dung DESC`, tuTg, denTg, J),
    // 5 so phieu tieu hao trong ky theo nhom
    q(`SELECT CASE WHEN p.loai = 'Cap phat NV' AND kd.loai = 'Tieu hao' THEN 'tieu_dung' WHEN p.loai = 'Cap phat NV' THEN 'cap_nv' WHEN p.loai = 'Nhap mua' THEN 'nhap' ELSE 'chuyen' END AS nhom,
              COUNT(*) AS n
       FROM phieu_chuyen_kho p JOIN kho kt ON kt.id = p.tu_kho_id LEFT JOIN kho kd ON kd.id = p.den_kho_id
       WHERE p.created_at BETWEEN ? AND ? AND p.trang_thai IN ('Da giao', 'Da nhan', 'Dang chuyen')
         AND (kt.cong_ty_id ${IN} OR kd.cong_ty_id ${IN}) AND p.loai IN ('Cap phat NV', 'Nhap mua', 'Chuyen kho')
       GROUP BY 1`, tuTg, denTg, J, J),
    // 6 ton am (so cap kho x vat tu)
    q(`SELECT COUNT(*) AS n FROM v_ton_kho t JOIN kho k ON k.id = t.kho_id WHERE t.ton < 0 AND k.cong_ty_id ${IN}`, J),
    // 7 viec ton dong: phieu chuyen kho (cho KT / dang chuyen / bi tu choi chua xu ly)
    q(`SELECT p.ma_phieu, p.loai, p.trang_thai, p.created_at, COALESCE(kt.cong_ty_id, kd.cong_ty_id) AS cong_ty_id,
              ${TEN_KHO("kt")} AS tu, COALESCE(${TEN_KHO("kd")}, ${TEN_NV("nv")}, p.nguoi_nhan_ten_tu_do) AS den
       FROM phieu_chuyen_kho p LEFT JOIN kho kt ON kt.id = p.tu_kho_id LEFT JOIN kho kd ON kd.id = p.den_kho_id LEFT JOIN nhan_vien nv ON nv.ma_nv = p.den_nhan_vien_id
       WHERE (p.trang_thai IN ('Cho ke toan duyet', 'Dang chuyen', 'Ke toan tu choi') OR (p.trang_thai = 'Bi tu choi' AND p.da_xu_ly_tu_choi = 0))
         AND (kt.cong_ty_id ${IN} OR kd.cong_ty_id ${IN})`, J, J),
    // 8 viec ton dong: phieu xu ly TS cho KT duyet
    q(`SELECT x.ma_phieu, x.loai, x.created_at, MIN(c.cong_ty_id) AS cong_ty_id, COUNT(*) AS so_ts
       FROM phieu_xu_ly_ts x JOIN phieu_xu_ly_ts_ct ct ON ct.phieu_id = x.id JOIN ccdc c ON c.id = ct.ccdc_id
       WHERE x.trang_thai = 'Cho ke toan duyet' AND c.cong_ty_id ${IN} GROUP BY x.id`, J),
    // 9 viec ton dong: giao nhan TSCD chua xac nhan / cho KT duyet
    q(`SELECT g.ma_phieu, g.loai_phieu, g.trang_thai_duyet, g.ngay_lap AS created_at, MIN(c.cong_ty_id) AS cong_ty_id, COUNT(*) AS so_ts,
              ${TEN_KHO("kt")} AS tu, COALESCE(${TEN_KHO("kd")}, ${TEN_NV("nv")}, ${TEN_NV("nv0")}) AS den
       FROM phieu_giao_nhan g JOIN phieu_giao_nhan_ct ct ON ct.phieu_id = g.id JOIN ccdc c ON c.id = ct.ccdc_id
       LEFT JOIN kho kt ON kt.id = g.tu_kho_id LEFT JOIN kho kd ON kd.id = g.den_kho_id
       LEFT JOIN nhan_vien nv ON nv.ma_nv = g.nhan_vien_nhan_moi_id LEFT JOIN nhan_vien nv0 ON nv0.ma_nv = g.nhan_vien_id
       WHERE g.da_xac_nhan = 0 AND g.trang_thai_duyet IS NOT 'Ke toan tu choi' AND c.cong_ty_id ${IN} GROUP BY g.id`, J),
    // 10 so lieu tong TS ky truoc (anh chup thong_ke_ngay gan nhat <= den - 7 ngay)
    q(`SELECT ngay, pham_vi, so_luong, gia_tri FROM thong_ke_ngay WHERE chi_so = 'tong_ts'
         AND ngay = (SELECT MAX(ngay) FROM thong_ke_ngay WHERE ngay <= ?)`, ngayKyTruoc),
  ]);
  const R = (i: number) => kq[i].results as Record<string, unknown>[];

  // ---- tai san
  const CON_QL = (tt: string) => !["Da thanh ly", "Da tieu huy", "Cho duyet nhap"].includes(tt);
  const rong = (): SoGt => ({ sl: 0, gt: 0 });
  const theoCt = new Map<number, DongTheoCongTy>(ids.map((id) => [id, { cong_ty_id: id, tong: rong(), trong_kho: rong(), dang_su_dung: rong(), hong: 0, cho_duyet_nhap: 0, duoi_toi_thieu: 0 }]));
  for (const r of R(0)) {
    const d = theoCt.get(SO(r.cong_ty_id));
    if (!d) continue;
    const tt = String(r.tt);
    const sl = SO(r.sl);
    const gt = SO(r.gt);
    if (CON_QL(tt)) (d.tong.sl += sl), (d.tong.gt += gt);
    if (tt === "Trong kho") (d.trong_kho.sl += sl), (d.trong_kho.gt += gt);
    if (tt === "Dang cap phat") (d.dang_su_dung.sl += sl), (d.dang_su_dung.gt += gt);
    if (tt === "Hong" || (tt === "Trong kho" && r.tinh_trang === "Hong")) d.hong += sl;
    if (tt === "Cho duyet nhap") d.cho_duyet_nhap += sl;
  }
  const cong = (k: "tong" | "trong_kho" | "dang_su_dung"): SoGt =>
    [...theoCt.values()].reduce((s, d) => ({ sl: s.sl + d[k].sl, gt: s.gt + d[k].gt }), rong());

  const ktRows = R(10);
  const tatCaCt = ids.length === dsCt.length;
  const kyTruocRows = ktRows.filter((r) => (tatCaCt ? r.pham_vi === "all" : ids.some((id) => r.pham_vi === `cong_ty:${id}`)));
  const kyTruoc = kyTruocRows.length ? kyTruocRows.reduce<SoGt>((s, r) => ({ sl: s.sl + SO(r.so_luong), gt: s.gt + SO(r.gia_tri) }), rong()) : null;

  // ---- tai khoan
  const tk = { dang_su_dung: 0, cho_duyet: 0, bi_khoa: 0, tu_choi: 0, moi_trong_ky: 0 };
  for (const r of R(1)) {
    const n = SO(r.n);
    tk.moi_trong_ky += SO(r.moi);
    if (SO(r.bi_khoa)) tk.bi_khoa += n;
    else if (r.tt === "Da duyet") tk.dang_su_dung += n;
    else if (r.tt === "Cho duyet") tk.cho_duyet += n;
    else tk.tu_choi += n;
  }

  // ---- bien dong TSCD
  const gn = Object.fromEntries(R(2).map((r) => [String(r.loai), SO(r.n)]));
  const xl = Object.fromEntries(R(3).map((r) => [String(r.loai), { n: SO(r.n), gt: SO(r.gt) }]));

  // ---- tieu hao
  const chiTietTh = R(4).map((r) => ({
    cong_ty_id: SO(r.cong_ty_id),
    vt_id: String(r.vt_id),
    ten_vt: String(r.ten_vt),
    don_vi_tinh: (r.don_vi_tinh as string) ?? null,
    ten_nhom: (r.ten_nhom as string) ?? null,
    sl_cap_nv: SO(r.sl_cap_nv),
    sl_tieu_dung: SO(r.sl_tieu_dung),
    sl_nhap: SO(r.sl_nhap),
    gt_xuat: SO(r.gt_xuat),
    gt_nhap: SO(r.gt_nhap),
  }));
  const soPhieu = Object.fromEntries(R(5).map((r) => [String(r.nhom), SO(r.n)]));
  const sumTh = (f: (d: DongTieuHao) => number, loc: (d: DongTieuHao) => boolean = () => true) => chiTietTh.filter(loc).reduce((s, d) => s + f(d), 0);

  // ---- ton toi thieu
  const tonMin = await layTonToiThieu(db, ids);
  for (const d of tonMin) if (d.muc === "het" || d.muc === "duoi") theoCt.get(d.cong_ty_id)!.duoi_toi_thieu++;

  // ---- viec ton dong
  const viec: DongViec[] = [];
  const them = (loai: string, r: Record<string, unknown>, noiDung: string) => {
    const t = String(r.created_at ?? taoLuc);
    const gio = gioGiua(t, taoLuc);
    viec.push({ loai, ma_phieu: String(r.ma_phieu ?? ""), noi_dung: noiDung, cong_ty_id: r.cong_ty_id == null ? null : SO(r.cong_ty_id), thoi_gian: t, gio_cho: gio, qua_han: gio > QUA_HAN_GIO });
  };
  const LOAI_CK: Record<string, string> = { "Nhap mua": "Nhập mua tiêu hao", "Chuyen kho": "Chuyển kho", "Cap phat NV": "Cấp phát NV", "Dieu chinh": "Điều chỉnh tồn" };
  let choKt = 0;
  let choNhan = 0;
  let tuChoi = 0;
  for (const r of R(7)) {
    const tuDen = [r.tu, r.den].filter(Boolean).join(" → ");
    if (r.trang_thai === "Cho ke toan duyet") choKt++, them(`Chờ KT duyệt · ${LOAI_CK[String(r.loai)] ?? r.loai}`, r, tuDen);
    else if (r.trang_thai === "Dang chuyen") choNhan++, them("Chờ kho nhận hàng", r, tuDen);
    else tuChoi++, them(r.trang_thai === "Ke toan tu choi" ? "KT từ chối - chờ sửa / hủy" : "Bị từ chối nhận - chờ xử lý", r, tuDen);
  }
  const LOAI_XL: Record<string, string> = { "Nhap mua": "Nhập tài sản", "Bao hong": "Báo hỏng", "Thanh ly": "Thanh lý", "Tieu huy": "Tiêu hủy" };
  for (const r of R(8)) choKt++, them(`Chờ KT duyệt · ${LOAI_XL[String(r.loai)] ?? r.loai}`, r, `${SO(r.so_ts)} tài sản`);
  const LOAI_GN: Record<string, string> = { "Cap phat": "Cấp phát TSCĐ", "Thu hoi": "Thu hồi TSCĐ", "Dieu chuyen": "Điều chuyển TSCĐ", "Chuyen kho": "Chuyển kho TSCĐ" };
  for (const r of R(9)) {
    const nd = `${SO(r.so_ts)} tài sản${r.tu || r.den ? ` · ${[r.tu, r.den].filter(Boolean).join(" → ")}` : ""}`;
    if (r.trang_thai_duyet === "Cho ke toan duyet") choKt++, them(`Chờ KT duyệt · ${LOAI_GN[String(r.loai_phieu)] ?? r.loai_phieu}`, r, nd);
    else choNhan++, them(`Chờ xác nhận · ${LOAI_GN[String(r.loai_phieu)] ?? r.loai_phieu}`, r, nd);
  }
  viec.sort((a, b) => b.gio_cho - a.gio_cho);
  const quaHan = viec.filter((v) => v.qua_han).length;

  const tong = cong("tong");
  const hong = [...theoCt.values()].reduce((s, d) => s + d.hong, 0);
  const tonAm = SO(R(6)[0]?.n);

  // ---- diem noi bat (tu rut ra, muc nang truoc)
  const noiBat: NoiBat[] = [];
  const het = tonMin.filter((d) => d.muc === "het").length;
  const duoi = tonMin.filter((d) => d.muc === "duoi").length;
  const sap = tonMin.filter((d) => d.muc === "sap").length;
  if (het + duoi)
    noiBat.push({ muc: "cao", noi_dung: `${het + duoi} mặt hàng dưới mức tồn tối thiểu${het ? ` (${het} đã hết hàng)` : ""} – cần đặt hàng` });
  if (quaHan) noiBat.push({ muc: "cao", noi_dung: `${quaHan} phiếu chờ xử lý quá ${QUA_HAN_GIO} giờ` });
  if (tonAm) noiBat.push({ muc: "cao", noi_dung: `${tonAm} vật tư đang tồn âm theo kho – cần kiểm kê, điều chỉnh` });
  if (sap) noiBat.push({ muc: "trung_binh", noi_dung: `${sap} mặt hàng sắp chạm mức tồn tối thiểu – chuẩn bị đặt hàng` });
  if (hong) noiBat.push({ muc: "trung_binh", noi_dung: `${hong} tài sản hỏng chờ sửa chữa / thanh lý` });
  if (choKt) noiBat.push({ muc: "trung_binh", noi_dung: `${choKt} phiếu đang chờ Kế toán duyệt` });
  if (tuChoi) noiBat.push({ muc: "trung_binh", noi_dung: `${tuChoi} phiếu bị từ chối chưa xử lý` });
  if (tk.cho_duyet) noiBat.push({ muc: "trung_binh", noi_dung: `${tk.cho_duyet} tài khoản đang chờ duyệt` });
  if (kyTruoc && tong.sl !== kyTruoc.sl)
    noiBat.push({ muc: "tot", noi_dung: `Tổng tài sản ${tong.sl > kyTruoc.sl ? "tăng" : "giảm"} ${Math.abs(tong.sl - kyTruoc.sl)} so với 7 ngày trước` });
  if (!noiBat.some((n) => n.muc !== "tot")) noiBat.unshift({ muc: "tot", noi_dung: "Không có vấn đề cần xử lý gấp" });

  return {
    tu,
    den,
    tao_luc: taoLuc,
    cong_ty: congTy,
    tai_san: { tong, trong_kho: cong("trong_kho"), dang_su_dung: cong("dang_su_dung"), hong, cho_duyet_nhap: [...theoCt.values()].reduce((s, d) => s + d.cho_duyet_nhap, 0), ky_truoc: kyTruoc, ngay_ky_truoc: kyTruoc ? String(ktRows[0].ngay) : null },
    theo_cong_ty: [...theoCt.values()],
    tai_khoan: tk,
    bien_dong_ts: {
      nhap_moi: { sl: xl["Nhap mua"]?.n ?? 0, gt: xl["Nhap mua"]?.gt ?? 0 },
      cap_phat: gn["Cap phat"] ?? 0,
      thu_hoi: gn["Thu hoi"] ?? 0,
      dieu_chuyen: (gn["Dieu chuyen"] ?? 0) + (gn["Chuyen kho"] ?? 0),
      bao_hong: xl["Bao hong"]?.n ?? 0,
      thanh_ly: xl["Thanh ly"]?.n ?? 0,
      tieu_huy: xl["Tieu huy"]?.n ?? 0,
    },
    tieu_hao: {
      nhap_mua: { so_phieu: soPhieu.nhap ?? 0, gt: sumTh((d) => d.gt_nhap) },
      cap_phat_nv: { so_phieu: soPhieu.cap_nv ?? 0, gt: sumTh((d) => d.gt_xuat, (d) => d.sl_cap_nv > 0 && d.sl_tieu_dung === 0) },
      tieu_dung_vp: { so_phieu: soPhieu.tieu_dung ?? 0, gt: sumTh((d) => d.gt_xuat, (d) => d.sl_tieu_dung > 0 && d.sl_cap_nv === 0) },
      chuyen_kho: soPhieu.chuyen ?? 0,
      chi_tiet: chiTietTh,
    },
    ton_toi_thieu: tonMin,
    ton_am: tonAm,
    viec: { cho_ke_toan: choKt, cho_nhan: choNhan, bi_tu_choi: tuChoi, qua_han: quaHan, chi_tiet: viec },
    noi_bat: noiBat,
  };
}

/** Tieu de email: ky + so muc can xu ly (de nguoi nhan nam van de ngay tu hop thu). */
export function tieuDeBaoCao(bc: BaoCaoTuan): string {
  const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const duoi = bc.ton_toi_thieu.filter((d) => d.muc === "het" || d.muc === "duoi").length;
  const vanDe = [duoi ? `${duoi} mặt hàng dưới tồn tối thiểu` : "", bc.viec.qua_han ? `${bc.viec.qua_han} phiếu quá hạn` : ""].filter(Boolean).join(", ");
  return `[CCDC] Báo cáo tuần ${fmt(bc.tu)} – ${fmt(bc.den)}/${bc.den.slice(0, 4)}${vanDe ? ` · ${vanDe}` : " · Ổn định"}`;
}

