import type { AppUser } from "../types";

// Da phap nhan (migration 0014): bo loc "cong ty dang xem" luu tren may (localStorage), gui kem MOI request qua
// header x-cong-ty (api/client.ts) - server giao voi cong ty tai khoan duoc phep (middleware/loadUser.ts).
// "" = tat ca cong ty duoc phep. Doi cong ty = luu + tai lai trang (moi man tu tai lai dung pham vi).
const KEY = "ccdc_cong_ty";

function doc(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export const congTyDangChon: string = doc();

export function setCongTy(id: string) {
  if (id === congTyDangChon) return;
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* bo qua */
  }
  window.location.reload();
}

/** Cong ty dang xem thuc te (bo loc da luu nhung khong con duoc phep -> coi nhu tat ca). */
export function congTyXem(u: AppUser | null): { id: number; ma: string; ten: string }[] {
  const ds = u?.cong_ty ?? [];
  const chon = ds.find((c) => String(c.id) === congTyDangChon);
  return chon ? [chon] : ds;
}

/**
 * Cong ty cho ban ghi MOI tao trong form: dang loc 1 cong ty / chi co 1 cong ty -> dung luon (khong hien o
 * chon); nhieu cong ty -> form hien o chon (canChon), mac dinh cong ty dau.
 */
export function congTyMacDinh(u: AppUser | null): { canChon: boolean; macDinh: number | null; ds: { id: number; ma: string; ten: string }[] } {
  const ds = congTyXem(u);
  return { canChon: ds.length > 1, macDinh: ds[0]?.id ?? null, ds };
}

/** Nhieu cong ty dang hien cung luc -> nen hien cot / nhan cong ty trong bang. */
export function hienCongTy(u: AppUser | null): boolean {
  return congTyXem(u).length > 1;
}

export function maCongTy(u: AppUser | null, id: number | null | undefined): string {
  return u?.cong_ty?.find((c) => c.id === id)?.ma ?? "";
}
