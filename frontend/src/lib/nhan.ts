import { ApiError } from "../api/client";
import type { AppUser, LoaiKho } from "../types";

// Nhan hien thi + tone dung chung moi man hinh (gia tri luu DB khong dau, xem migration 0006).
export type Tone = "neutral" | "success" | "warning" | "danger";

export const TRANG_THAI_TS: Record<string, { label: string; tone: Tone }> = {
  "Cho duyet nhap": { label: "Chờ KT duyệt nhập", tone: "warning" },
  "Trong kho": { label: "Trong kho", tone: "neutral" },
  "Dang cap phat": { label: "Đang cấp phát", tone: "success" },
  "Dang bao tri": { label: "Đang bảo trì", tone: "warning" },
  "Cho duyet bao hong": { label: "Chờ KT duyệt báo hỏng", tone: "warning" },
  Hong: { label: "Hỏng", tone: "danger" },
  "Cho thanh ly": { label: "Chờ thanh lý", tone: "warning" },
  "Cho tieu huy": { label: "Chờ tiêu hủy", tone: "warning" },
  "Da thanh ly": { label: "Đã thanh lý", tone: "danger" },
  "Da tieu huy": { label: "Đã tiêu hủy", tone: "danger" },
};

export const LOAI_KHO: Record<LoaiKho, string> = {
  "Mua hang": "Kho mua hàng",
  HCNS: "Kho HCNS",
  Mien: "Kho miền",
  "Quan ly": "Kho quản lý",
};

export const LOAI_PHIEU_CK: Record<string, string> = {
  "Nhap mua": "Nhập mua",
  "Chuyen kho": "Chuyển kho",
  "Cap phat NV": "Cấp phát NV",
};

export const TRANG_THAI_CK: Record<string, { label: string; tone: Tone }> = {
  "Cho ke toan duyet": { label: "Chờ KT duyệt", tone: "warning" },
  "Ke toan tu choi": { label: "KT từ chối", tone: "danger" },
  "Dang chuyen": { label: "Đang chuyển", tone: "warning" },
  "Da nhan": { label: "Đã nhận", tone: "success" },
  "Bi tu choi": { label: "Bị từ chối nhận", tone: "danger" },
  "Da giao": { label: "Đã giao", tone: "success" },
};

export const LOAI_XU_LY: Record<string, string> = {
  "Nhap mua": "Nhập mua TSCĐ",
  "Bao hong": "Báo hỏng",
  "Thanh ly": "Thanh lý",
  "Tieu huy": "Tiêu hủy",
};

export const TRANG_THAI_XU_LY: Record<string, { label: string; tone: Tone }> = {
  "Cho ke toan duyet": { label: "Chờ KT duyệt", tone: "warning" },
  "Da duyet": { label: "KT đã duyệt", tone: "neutral" },
  "Tu choi": { label: "KT từ chối", tone: "danger" },
  "Da hoan tat": { label: "Hoàn tất", tone: "success" },
};

export const VAI_TRO: Record<string, string> = {
  Admin: "Admin",
  "Ke toan": "Kế toán",
  HCNS: "HCNS",
  "Quan ly": "Quản lý",
};

export function tenVaiTro(v: string | null) {
  return v ? (VAI_TRO[v] ?? v) : "Nhân viên";
}

export const isAdmin = (u: AppUser) => u.vai_tro === "Admin";
export const isKeToan = (u: AppUser) => u.vai_tro === "Admin" || u.vai_tro === "Ke toan";
export const isHcns = (u: AppUser) => u.vai_tro === "Admin" || u.vai_tro === "HCNS";
// Co kho nao de xuat hang di (khong tinh kho mua hang - nguon ao chi dung nhap mua).
export const coKhoThaoTac = (u: AppUser) => u.kho_phu_trach.some((k) => k.loai !== "Mua hang");

const LOI: Record<string, string> = {
  VUOT_TON: "Số lượng xuất vượt tồn kho nguồn.",
  KHONG_PHU_TRACH_KHO_NGUON: "Bạn không phụ trách kho nguồn này.",
  KHONG_PHU_TRACH_KHO_DICH: "Bạn không phụ trách kho nhận.",
  NGOAI_NHOM_QUAN_LY: "Người này không thuộc nhóm cấp dưới của quản lý.",
  QL_KHONG_DUNG_TEN_TU_DO: "Kho quản lý chỉ cấp cho nhân viên trong danh bạ thuộc nhóm.",
  CHON_1_NGUOI_NHAN: "Chọn đúng 1 người nhận (nhân viên hoặc tên tự do).",
  CHI_HCNS_NHAP_MUA: "Chỉ HCNS được lập phiếu nhập mua.",
  CHI_KE_TOAN: "Chỉ Kế toán được duyệt.",
  CHI_HCNS: "Chỉ HCNS thực hiện được thao tác này.",
  CAN_LY_DO: "Vui lòng nhập lý do.",
  SAI_TRANG_THAI: "Phiếu đã được xử lý bởi người khác - tải lại để xem trạng thái mới.",
  CCDC_KHONG_O_KHO_NGUON: "Có tài sản không nằm trong kho nguồn.",
  CCDC_KHONG_DUNG_NGUOI_GIU: "Có tài sản không thuộc người giữ đã chọn.",
  CCDC_KHONG_TRONG_KHO: "Chỉ xử lý được tài sản đang nằm trong kho (đã thu hồi).",
  KHONG_CO_QUYEN_BAO_HONG: "Bạn không có quyền báo hỏng tài sản này.",
  SAI_TRANG_THAI_TS: "Tài sản đang ở trạng thái không cho phép thao tác này.",
  XAC_NHAN_HO_CAN_GHI_CHU: "Xác nhận hộ kho nhận bắt buộc ghi chú lý do.",
  TRUNG_KHO: "Kho nguồn và kho đích trùng nhau.",
  QL_KHONG_CHUYEN_SANG_KHO_QL_KHAC: "Kho quản lý chỉ trả về kho HCNS/miền.",
  USER_CHUA_DANG_NHAP: "Email này chưa từng đăng nhập hệ thống - cần đăng nhập 1 lần trước khi gán.",
  ID_EXISTS: "Mã này đã tồn tại.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
};

export function thongBaoLoi(e: unknown, macDinh = "Không thực hiện được - vui lòng thử lại.") {
  const err = e as ApiError;
  const code = err?.code;
  if (code === "VUOT_TON" && err.body?.ton !== undefined) return `Vượt tồn: kho nguồn chỉ còn ${err.body.ton} (${err.body.vt_id}).`;
  return (code && LOI[code]) || macDinh;
}

export function fmtTien(v: number | null | undefined) {
  return v == null ? "-" : v.toLocaleString("vi-VN");
}

export const LOAI_GIAO_NHAN: Record<string, string> = {
  "Cap phat": "Cấp phát",
  "Thu hoi": "Thu hồi",
  "Dieu chuyen": "Điều chuyển",
  "Chuyen kho": "Chuyển kho",
};

export const TINH_TRANG_KIEM_KE: Record<string, { label: string; tone: Tone }> = {
  "Dung vi tri": { label: "Đúng vị trí", tone: "success" },
  Thieu: { label: "Thiếu", tone: "danger" },
  Thua: { label: "Thừa", tone: "warning" },
  Hong: { label: "Hỏng", tone: "danger" },
  "Sai nguoi giu": { label: "Sai người giữ", tone: "warning" },
};

export const TINH_TRANG_TS: Record<string, string> = { Tot: "Tốt", "Can bao tri": "Cần bảo trì", Hong: "Hỏng" };
