export type VaiTro = "Admin" | "Ke toan" | "HCNS" | "Quan ly";
export type TrangThaiDuyet = "Cho duyet" | "Da duyet" | "Tu choi";

export interface AppUser {
  email: string;
  ten: string;
  vai_tro: VaiTro | null;
  trang_thai_duyet: TrangThaiDuyet;
  bi_khoa: boolean;
  ma_nv: string | null;
  kho_phu_trach: { id: number; ten_kho: string; loai: LoaiKho; nhan_vien_id?: string | null }[];
  co_cap_duoi: boolean;
  anh_dai_dien: string | null;
}

export type LoaiKho = "Mua hang" | "HCNS" | "Mien" | "Quan ly";
