import type { AppUser } from "../types";
import { khoPhuTrach, getKho } from "./quyen";

// Pham vi DU LIEU TONG HOP nguoi dung duoc xem (tong quan, viec can lam, canh bao, tim kiem):
//   - Admin / Ke toan / HCNS: toan he thong (hoac toan bo cac cong ty dang xem - congTyToan, da phap nhan).
//   - Thu kho / Quan ly: cac kho minh phu trach (tru kho mua hang ao) + tai san nhom minh giu
//     (ban than + cap duoi truc tiep).
//   - Nhan vien thuong: chi tai san minh giu (nhomMaNv = [ma_nv]).
//   Moi pham vi chi trong user.cong_ty_xem (bo loc cong ty tren giao dien giao voi cong ty duoc phep).
// MOI truy van tong hop PHAI loc qua day - khong tin kho_id client gui (kiem bang locTheoKho).

export interface PhamVi {
  toanBo: boolean;
  khoIds: number[];
  nhomMaNv: string[];
  /** Duoc xem man tong hop (tong quan / canh bao / bao cao). */
  xemTongHop: boolean;
  /**
   * Da phap nhan: vai tro toan quyen (Admin/KT/HCNS) nhung chi xem 1 so cong ty -> toanBo = false, khoIds =
   * MOI kho + nhomMaNv = MOI nhan vien cac cong ty do (truy van cu tu loc dung), dkTaiSan loc thang theo
   * ccdc.cong_ty_id. null = khong ap dung (toanBo that, hoac thu kho / QL / NV).
   */
  congTyToan?: number[] | null;
}

/** Pham vi "toan bo cac cong ty dang xem" (moi kho + moi nhan vien cua cac cong ty do). */
async function phamViCongTy(db: D1Database, user: AppUser): Promise<PhamVi> {
  const congTy = JSON.stringify(user.cong_ty_xem);
  const [kho, nv] = await db.batch<{ id: number; ma_nv: string }>([
    db.prepare("SELECT id FROM kho WHERE loai != 'Mua hang' AND cong_ty_id IN (SELECT value FROM json_each(?))").bind(congTy),
    db.prepare("SELECT ma_nv FROM nhan_vien WHERE cong_ty_id IN (SELECT value FROM json_each(?))").bind(congTy),
  ]);
  return {
    toanBo: false,
    khoIds: kho.results.map((r) => r.id),
    nhomMaNv: nv.results.map((r) => r.ma_nv),
    xemTongHop: true,
    congTyToan: user.cong_ty_xem,
  };
}

/**
 * Pham vi cho cac man XEM TON (ton tieu hao, ton theo kho, the kho, Kho & ton, danh muc TSCD): tai khoan co quyen them
 * "Xem ton kho toan cong ty" (users.xem_ton) duoc xem moi kho / moi tai san CUA CAC CONG TY MINH DUOC PHEP (chi doc);
 * con lai = layPhamVi. KHONG dung cho viec can lam / thao tac ghi.
 */
export async function layPhamViXemTon(db: D1Database, user: AppUser): Promise<PhamVi> {
  const toanQuyen = user.vai_tro === "Admin" || user.vai_tro === "Ke toan" || user.vai_tro === "HCNS";
  if (user.xem_ton && !toanQuyen) return phamViCongTy(db, user);
  return layPhamVi(db, user);
}

export async function layPhamVi(db: D1Database, user: AppUser): Promise<PhamVi> {
  const toanQuyen = user.vai_tro === "Admin" || user.vai_tro === "Ke toan" || user.vai_tro === "HCNS";
  const congTy = JSON.stringify(user.cong_ty_xem);
  if (toanQuyen && !user.tat_ca_cong_ty) return phamViCongTy(db, user);
  const kho = (await khoPhuTrach(db, user)).filter((k) => k.loai !== "Mua hang" && user.cong_ty_xem.includes(k.cong_ty_id));
  let nhom: string[] = [];
  if (user.ma_nv) {
    const { results } = await db
      .prepare("SELECT ma_nv FROM nhan_vien WHERE quan_ly_id = ? AND dang_lam_viec = 1 AND cong_ty_id IN (SELECT value FROM json_each(?))")
      .bind(user.ma_nv, congTy)
      .all<{ ma_nv: string }>();
    nhom = [user.ma_nv, ...results.map((r) => r.ma_nv)];
  }
  return {
    toanBo: toanQuyen,
    khoIds: kho.map((k) => k.id),
    nhomMaNv: nhom,
    xemTongHop: toanQuyen || kho.length > 0 || nhom.length > 1,
    congTyToan: null,
  };
}

/** Thu hep pham vi ve 1 kho ("don vi" tren bo loc). null = kho ngoai quyen / khong ton tai. */
export async function locTheoKho(db: D1Database, pv: PhamVi, khoId: number): Promise<PhamVi | null> {
  if (!pv.toanBo && !pv.khoIds.includes(khoId)) return null;
  const kho = await getKho(db, khoId);
  if (!kho) return null;
  let nhom: string[] = [];
  if (kho.loai === "Quan ly" && kho.nhan_vien_id) {
    const { results } = await db
      .prepare("SELECT ma_nv FROM nhan_vien WHERE quan_ly_id = ? AND dang_lam_viec = 1")
      .bind(kho.nhan_vien_id)
      .all<{ ma_nv: string }>();
    nhom = [kho.nhan_vien_id, ...results.map((r) => r.ma_nv)];
  }
  return { toanBo: false, khoIds: [khoId], nhomMaNv: nhom, xemTongHop: true };
}

export interface DieuKien {
  sql: string;
  binds: unknown[];
}

// Danh sach truyen bang 1 tham so JSON (json_each) - KHONG "?" cho tung phan tu: D1 gioi han 100 tham so/cau
// lenh, quan ly co >100 cap duoi lam vo chup so lieu hang ngay (gap that 2026-10-01).
const trong = (cot: string, ds: unknown[]) => ({ sql: `${cot} IN (SELECT value FROM json_each(?))`, bind: JSON.stringify(ds) });

/** Dieu kien tai san (bang ccdc, alias a) thuoc pham vi: nam trong kho pham vi HOAC nhom dang giu. */
export function dkTaiSan(pv: PhamVi, a = "c"): DieuKien {
  if (pv.toanBo) return { sql: "1=1", binds: [] };
  if (pv.congTyToan) {
    const t = trong(`${a}.cong_ty_id`, pv.congTyToan);
    return { sql: t.sql, binds: [t.bind] };
  }
  const parts: string[] = [];
  const binds: unknown[] = [];
  for (const [cot, ds] of [[`${a}.kho_id`, pv.khoIds], [`${a}.nguoi_dang_giu`, pv.nhomMaNv]] as const) {
    if (!ds.length) continue;
    const t = trong(cot, ds);
    parts.push(t.sql);
    binds.push(t.bind);
  }
  return parts.length ? { sql: `(${parts.join(" OR ")})`, binds } : { sql: "0=1", binds: [] };
}

/** Dieu kien phieu chuyen kho (alias a) co kho nguon/dich thuoc pham vi. */
export function dkPhieuKho(pv: PhamVi, a = "p"): DieuKien {
  if (pv.toanBo) return { sql: "1=1", binds: [] };
  if (!pv.khoIds.length) return { sql: "0=1", binds: [] };
  const tu = trong(`${a}.tu_kho_id`, pv.khoIds);
  const den = trong(`${a}.den_kho_id`, pv.khoIds);
  return { sql: `(${tu.sql} OR ${den.sql})`, binds: [tu.bind, den.bind] };
}

/** Dieu kien theo 1 cot kho (vd v_ton_kho.kho_id, phieu.tu_kho_id). */
export function dkCotKho(pv: PhamVi, cot: string): DieuKien {
  if (pv.toanBo) return { sql: "1=1", binds: [] };
  if (!pv.khoIds.length) return { sql: "0=1", binds: [] };
  const t = trong(cot, pv.khoIds);
  return { sql: t.sql, binds: [t.bind] };
}
