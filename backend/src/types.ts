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
