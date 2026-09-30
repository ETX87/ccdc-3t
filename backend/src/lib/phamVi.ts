import type { AppUser } from "../types";
import { khoPhuTrach, getKho } from "./quyen";

// Pham vi DU LIEU TONG HOP nguoi dung duoc xem (tong quan, viec can lam, canh bao, tim kiem):
//   - Admin / Ke toan / HCNS: toan he thong.
//   - Thu kho / Quan ly: cac kho minh phu trach (tru kho mua hang ao) + tai san nhom minh giu
//     (ban than + cap duoi truc tiep).
//   - Nhan vien thuong: chi tai san minh giu (nhomMaNv = [ma_nv]).
// MOI truy van tong hop PHAI loc qua day - khong tin kho_id client gui (kiem bang locTheoKho).

export interface PhamVi {
  toanBo: boolean;
  khoIds: number[];
  nhomMaNv: string[];
  /** Duoc xem man tong hop (tong quan / canh bao / bao cao). */
  xemTongHop: boolean;
}

export async function layPhamVi(db: D1Database, user: AppUser): Promise<PhamVi> {
  const toanBo = user.vai_tro === "Admin" || user.vai_tro === "Ke toan" || user.vai_tro === "HCNS";
  const kho = (await khoPhuTrach(db, user)).filter((k) => k.loai !== "Mua hang");
  let nhom: string[] = [];
  if (user.ma_nv) {
    const { results } = await db
      .prepare("SELECT ma_nv FROM nhan_vien WHERE quan_ly_id = ? AND dang_lam_viec = 1")
      .bind(user.ma_nv)
      .all<{ ma_nv: string }>();
    nhom = [user.ma_nv, ...results.map((r) => r.ma_nv)];
  }
  return {
    toanBo,
    khoIds: kho.map((k) => k.id),
    nhomMaNv: nhom,
    xemTongHop: toanBo || kho.length > 0 || nhom.length > 1,
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

const dsHoi = (n: number) => Array(n).fill("?").join(",");

/** Dieu kien tai san (bang ccdc, alias a) thuoc pham vi: nam trong kho pham vi HOAC nhom dang giu. */
export function dkTaiSan(pv: PhamVi, a = "c"): DieuKien {
  if (pv.toanBo) return { sql: "1=1", binds: [] };
  const parts: string[] = [];
  const binds: unknown[] = [];
  if (pv.khoIds.length) {
    parts.push(`${a}.kho_id IN (${dsHoi(pv.khoIds.length)})`);
    binds.push(...pv.khoIds);
  }
  if (pv.nhomMaNv.length) {
    parts.push(`${a}.nguoi_dang_giu IN (${dsHoi(pv.nhomMaNv.length)})`);
    binds.push(...pv.nhomMaNv);
  }
  return parts.length ? { sql: `(${parts.join(" OR ")})`, binds } : { sql: "0=1", binds: [] };
}

/** Dieu kien phieu chuyen kho (alias a) co kho nguon/dich thuoc pham vi. */
export function dkPhieuKho(pv: PhamVi, a = "p"): DieuKien {
  if (pv.toanBo) return { sql: "1=1", binds: [] };
  if (!pv.khoIds.length) return { sql: "0=1", binds: [] };
  const q = dsHoi(pv.khoIds.length);
  return { sql: `(${a}.tu_kho_id IN (${q}) OR ${a}.den_kho_id IN (${q}))`, binds: [...pv.khoIds, ...pv.khoIds] };
}

/** Dieu kien theo 1 cot kho (vd v_ton_kho.kho_id, phieu.tu_kho_id). */
export function dkCotKho(pv: PhamVi, cot: string): DieuKien {
  if (pv.toanBo) return { sql: "1=1", binds: [] };
  if (!pv.khoIds.length) return { sql: "0=1", binds: [] };
  return { sql: `${cot} IN (${dsHoi(pv.khoIds.length)})`, binds: [...pv.khoIds] };
}
