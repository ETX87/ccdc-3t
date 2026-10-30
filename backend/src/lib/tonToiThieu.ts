import { KHO_TON_SQL } from "./quyen";

// Ton kho toi thieu (migration 0021): vat tu tieu hao (vt_tieu_hao.ton_toi_thieu) + TSCD theo dong hang
// (ts_ton_toi_thieu). So voi TONG ton cua cong ty - dung chung cho danh muc, canh bao va bao cao email.

/** Ten dong hang TSCD da chuan hoa - CUNG quy tac sinh ma TS (routes/ccdc.ts): trim, gop khoang trang, chu thuong, giu dau. */
export const chuanTen = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export type MucTon = "het" | "duoi" | "sap" | "du" | "khong";

/** Nguong "sap cham": ton con <= 120% muc toi thieu -> chuan bi dat hang. */
const NGUONG_SAP = 1.2;

export function danhGiaTon(ton: number, toiThieu: number | null): { muc: MucTon; danh_gia: string; de_xuat: string; thieu: number } {
  if (!toiThieu || toiThieu <= 0) return { muc: "khong", danh_gia: "Không quy định", de_xuat: "Không quy định tồn kho tối thiểu – theo dõi nhu cầu", thieu: 0 };
  const thieu = Math.max(0, toiThieu - ton);
  if (ton <= 0) return { muc: "het", danh_gia: "Hết hàng", de_xuat: "Đặt hàng gấp", thieu };
  if (ton < toiThieu) return { muc: "duoi", danh_gia: "Dưới mức tối thiểu", de_xuat: "Cần đặt hàng ngay", thieu };
  if (ton <= toiThieu * NGUONG_SAP) return { muc: "sap", danh_gia: "Sắp chạm mức tối thiểu", de_xuat: "Chuẩn bị đặt hàng", thieu: 0 };
  return { muc: "du", danh_gia: "Tồn kho đảm bảo", de_xuat: "Chưa cần đặt hàng", thieu: 0 };
}

export interface DongTonToiThieu {
  loai: "vat_tu" | "tai_san";
  cong_ty_id: number;
  /** vat tu: ma vat tu; TSCD: id dong cau hinh ts_ton_toi_thieu. */
  ma: string;
  ten: string;
  don_vi_tinh: string | null;
  ton: number;
  ton_toi_thieu: number;
  thoi_gian_dat_hang: string | null;
  muc: MucTon;
  danh_gia: string;
  de_xuat: string;
  thieu: number;
}

const json = (ids: number[]) => JSON.stringify(ids);

/**
 * Tong ton vat tu theo cong ty = v_ton_kho (kho tinh ton) + hang DANG CHUYEN toi kho tinh ton (da tru o kho nguon, chua
 * cong vao kho nhan - van la hang cua cong ty). Chi cac vat tu co dat ton_toi_thieu > 0 (ca = false: moi vat tu).
 */
export async function tonVatTu(db: D1Database, congTyIds: number[], chiCoToiThieu = true): Promise<Map<string, number>> {
  const loc = chiCoToiThieu ? "AND v.ton_toi_thieu > 0" : "";
  const [ton, dangChuyen] = await db.batch<{ vt_id: string; sl: number }>([
    db
      .prepare(
        `SELECT t.vt_id, SUM(t.ton) AS sl FROM v_ton_kho t JOIN vt_tieu_hao v ON v.id = t.vt_id
         WHERE v.cong_ty_id IN (SELECT value FROM json_each(?)) ${loc} GROUP BY t.vt_id`,
      )
      .bind(json(congTyIds)),
    db
      .prepare(
        `SELECT COALESCE(ct.vt_id_den, ct.vt_id) AS vt_id, SUM(ct.so_luong) AS sl
         FROM phieu_chuyen_kho p JOIN phieu_chuyen_kho_ct ct ON ct.phieu_id = p.id
         JOIN kho k ON k.id = p.den_kho_id AND k.loai ${KHO_TON_SQL}
         JOIN vt_tieu_hao v ON v.id = COALESCE(ct.vt_id_den, ct.vt_id)
         WHERE p.trang_thai = 'Dang chuyen' AND v.cong_ty_id IN (SELECT value FROM json_each(?)) ${loc}
         GROUP BY 1`,
      )
      .bind(json(congTyIds)),
  ]);
  const m = new Map<string, number>();
  for (const r of [...ton.results, ...dangChuyen.results]) m.set(r.vt_id, (m.get(r.vt_id) ?? 0) + (r.sl ?? 0));
  return m;
}

/** So TSCD san sang cap phat theo dong hang (khoa = chuanTen) cua tung cong ty: "congTyId|khoa" -> so luong. */
export async function tonTaiSan(db: D1Database, congTyIds: number[]): Promise<Map<string, number>> {
  const { results } = await db
    .prepare(
      `SELECT c.cong_ty_id, c.ten_ccdc, COUNT(*) AS sl FROM ccdc c JOIN kho k ON k.id = c.kho_id AND k.loai ${KHO_TON_SQL}
       WHERE c.vo_hieu_hoa = 0 AND c.trang_thai_hien_tai = 'Trong kho' AND c.tinh_trang != 'Hong'
         AND c.cong_ty_id IN (SELECT value FROM json_each(?))
       GROUP BY c.cong_ty_id, c.ten_ccdc`,
    )
    .bind(json(congTyIds))
    .all<{ cong_ty_id: number; ten_ccdc: string; sl: number }>();
  const m = new Map<string, number>();
  for (const r of results) {
    const k = `${r.cong_ty_id}|${chuanTen(r.ten_ccdc)}`;
    m.set(k, (m.get(k) ?? 0) + r.sl);
  }
  return m;
}

/** Moi muc da cai ton toi thieu (vat tu + TSCD) cua cac cong ty, kem ton hien tai + danh gia. Sap xep muc nang truoc. */
export async function layTonToiThieu(db: D1Database, congTyIds: number[]): Promise<DongTonToiThieu[]> {
  if (!congTyIds.length) return [];
  const [vts, tss] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT id, ten_vt, don_vi_tinh, cong_ty_id, ton_toi_thieu, thoi_gian_dat_hang FROM vt_tieu_hao
         WHERE vo_hieu_hoa = 0 AND ton_toi_thieu > 0 AND cong_ty_id IN (SELECT value FROM json_each(?))`,
      )
      .bind(json(congTyIds)),
    db
      .prepare(
        `SELECT id, cong_ty_id, ten_ts, khoa, ton_toi_thieu, thoi_gian_dat_hang FROM ts_ton_toi_thieu
         WHERE ton_toi_thieu > 0 AND cong_ty_id IN (SELECT value FROM json_each(?))`,
      )
      .bind(json(congTyIds)),
  ]);
  const [tonVt, tonTs] = await Promise.all([vts.results.length ? tonVatTu(db, congTyIds) : new Map<string, number>(), tss.results.length ? tonTaiSan(db, congTyIds) : new Map<string, number>()]);
  const ds: DongTonToiThieu[] = [];
  for (const v of vts.results as { id: string; ten_vt: string; don_vi_tinh: string | null; cong_ty_id: number; ton_toi_thieu: number; thoi_gian_dat_hang: string | null }[]) {
    const ton = tonVt.get(v.id) ?? 0;
    ds.push({ loai: "vat_tu", cong_ty_id: v.cong_ty_id, ma: v.id, ten: v.ten_vt, don_vi_tinh: v.don_vi_tinh, ton, ton_toi_thieu: v.ton_toi_thieu, thoi_gian_dat_hang: v.thoi_gian_dat_hang, ...danhGiaTon(ton, v.ton_toi_thieu) });
  }
  for (const r of tss.results as { id: number; cong_ty_id: number; ten_ts: string; khoa: string; ton_toi_thieu: number; thoi_gian_dat_hang: string | null }[]) {
    const ton = tonTs.get(`${r.cong_ty_id}|${r.khoa}`) ?? 0;
    ds.push({ loai: "tai_san", cong_ty_id: r.cong_ty_id, ma: String(r.id), ten: r.ten_ts, don_vi_tinh: null, ton, ton_toi_thieu: r.ton_toi_thieu, thoi_gian_dat_hang: r.thoi_gian_dat_hang, ...danhGiaTon(ton, r.ton_toi_thieu) });
  }
  const thuTu: Record<MucTon, number> = { het: 0, duoi: 1, sap: 2, du: 3, khong: 4 };
  return ds.sort((a, b) => thuTu[a.muc] - thuTu[b.muc] || b.thieu / b.ton_toi_thieu - a.thieu / a.ton_toi_thieu || a.ten.localeCompare(b.ten, "vi"));
}

/** Muc can xu ly (het / duoi / sap) - dung cho canh bao + diem noi bat bao cao. */
export const canXuLy = (d: DongTonToiThieu) => d.muc === "het" || d.muc === "duoi" || d.muc === "sap";
