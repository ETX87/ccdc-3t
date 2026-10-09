export type VaiTro = "Admin" | "Ke toan" | "HCNS" | "Quan ly";
export type TrangThaiDuyet = "Cho duyet" | "Da duyet" | "Tu choi";

export interface AppUser {
  email: string;
  ten: string;
  vai_tro: VaiTro | null;
  trang_thai_duyet: TrangThaiDuyet;
  bi_khoa: boolean;
  ma_nv: string | null;
  kho_phu_trach: { id: number; ten_kho: string; loai: LoaiKho; nhan_vien_id?: string | null; cong_ty_id?: number }[];
  co_cap_duoi: boolean;
  /** Cong ty tai khoan duoc xem / thao tac (da phap nhan) - o chon cong ty tren topbar khi >= 2. */
  cong_ty: { id: number; ma: string; ten: string }[];
  anh_dai_dien: string | null;
}

export type LoaiKho = "Mua hang" | "HCNS" | "Mien" | "Quan ly" | "Tieu hao";
