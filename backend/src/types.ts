export type VaiTro = "Admin" | "Ke toan" | "HCNS" | "Quan ly";
export type TrangThaiDuyet = "Cho duyet" | "Da duyet" | "Tu choi";

export interface AppUser {
  email: string;
  ten: string;
  vai_tro: VaiTro | null;
  trang_thai_duyet: TrangThaiDuyet;
  bi_khoa: boolean;
  // Ho so nhan_vien lien ket (nhan_vien.email_dang_nhap = email) - null neu chua lien ket. Quyen
  // Quan ly (nhom cap duoi) / Nhan vien (TS minh giu) deu dua vao ma nay.
  ma_nv: string | null;
  // URL anh Google (luu luc dang nhap, migration 0008) - null thi frontend hien chu cai dau.
  anh_dai_dien: string | null;
  // Da phap nhan (migration 0014): cong ty tai khoan duoc xem/thao tac (Admin: moi cong ty dang hoat dong;
  // khac: user_cong_ty, rong -> cong ty cua ho so nhan vien / cong ty mac dinh). cong_ty_xem = bo loc
  // "cong ty" tren giao dien (header x-cong-ty) giao voi cong_ty_ids; tat_ca_cong_ty = dang xem MOI cong ty.
  cong_ty_ids: number[];
  cong_ty_xem: number[];
  tat_ca_cong_ty: boolean;
  // Quyen them "Xem ton kho toan cong ty" (users.xem_ton, migration 0017) - chi doc, trong cac cong ty duoc phep.
  xem_ton: boolean;
}

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  BOOTSTRAP_ADMIN_EMAIL: string;
  GOOGLE_REDIRECT_URI: string;
  FRONTEND_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  LOCAL_DEV_BYPASS_AUTH?: string;
  // Danh ba "ETX nhan su" (lib/etxNhanSuClient.ts): BASE_URL khong nhay cam (vars), API_KEY la secret.
  ETX_HR_BASE_URL: string;
  ETX_HR_API_KEY?: string;
}

declare module "hono" {
  interface ContextVariableMap {
    email: string;
    user: AppUser;
    requestId: string;
  }
}
