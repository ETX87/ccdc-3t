import { LOCALE, t } from "./i18n";
import { ApiError } from "../api/client";
import type { AppUser, LoaiKho } from "../types";

// Nhan hien thi + tone dung chung moi man hinh (gia tri luu DB khong dau, xem migration 0006).
export type Tone = "neutral" | "success" | "warning" | "danger";

export const TRANG_THAI_TS: Record<string, { label: string; tone: Tone }> = {
  "Cho duyet nhap": { label: t("Chờ KT duyệt nhập"), tone: "warning" },
  "Trong kho": { label: t("Trong kho"), tone: "neutral" },
  "Dang cap phat": { label: t("Đang cấp phát"), tone: "success" },
  "Dang bao tri": { label: t("Đang bảo trì"), tone: "warning" },
  "Cho duyet bao hong": { label: t("Chờ KT duyệt báo hỏng"), tone: "warning" },
  Hong: { label: t("Hỏng"), tone: "danger" },
  "Cho thanh ly": { label: t("Chờ thanh lý"), tone: "warning" },
  "Cho tieu huy": { label: t("Chờ tiêu hủy"), tone: "warning" },
  "Da thanh ly": { label: t("Đã thanh lý"), tone: "danger" },
  "Da tieu huy": { label: t("Đã tiêu hủy"), tone: "danger" },
};

export const LOAI_KHO: Record<LoaiKho, string> = {
  "Mua hang": t("Kho mua hàng"),
  HCNS: t("Kho HCNS"),
  Mien: t("Kho miền"),
  "Quan ly": t("Kho quản lý"),
  "Tieu hao": t("Kho tiêu hao"),
};

/** Kho TINH TON (khong phai kho mua hang - nguon ao, hay kho tieu hao - diem tieu dung van phong). */
export const laKhoTon = (k: { loai: LoaiKho | string }) => k.loai !== "Mua hang" && k.loai !== "Tieu hao";

export const LOAI_PHIEU_CK: Record<string, string> = {
  "Nhap mua": t("Nhập mua"),
  "Chuyen kho": t("Chuyển kho"),
  "Cap phat NV": t("Cấp phát NV"),
  "Dieu chinh": t("Điều chỉnh tồn"),
};

export const TRANG_THAI_CK: Record<string, { label: string; tone: Tone }> = {
  "Cho ke toan duyet": { label: t("Chờ KT duyệt"), tone: "warning" },
  "Ke toan tu choi": { label: t("KT từ chối"), tone: "danger" },
  "Dang chuyen": { label: t("Đang chuyển"), tone: "warning" },
  "Da nhan": { label: t("Đã nhận"), tone: "success" },
  "Bi tu choi": { label: t("Bị từ chối nhận"), tone: "danger" },
  "Da giao": { label: t("Đã giao"), tone: "success" },
  "Da huy": { label: t("Đã hủy"), tone: "neutral" },
  "Da dieu chinh": { label: t("Đã điều chỉnh"), tone: "success" },
};

export const LOAI_XU_LY: Record<string, string> = {
  "Nhap mua": t("Nhập mua TSCĐ"),
  "Bao hong": t("Báo hỏng"),
  "Thanh ly": t("Thanh lý"),
  "Tieu huy": t("Tiêu hủy"),
};

export const TRANG_THAI_XU_LY: Record<string, { label: string; tone: Tone }> = {
  "Cho ke toan duyet": { label: t("Chờ KT duyệt"), tone: "warning" },
  "Da duyet": { label: t("KT đã duyệt"), tone: "neutral" },
  "Tu choi": { label: t("KT từ chối"), tone: "danger" },
  "Da hoan tat": { label: t("Hoàn tất"), tone: "success" },
};

export const VAI_TRO: Record<string, string> = {
  Admin: "Admin",
  "Ke toan": t("Kế toán"),
  HCNS: "HCNS",
  "Quan ly": t("Quản lý"),
};

export function tenVaiTro(v: string | null) {
  return v ? (VAI_TRO[v] ?? v) : t("Nhân viên");
}

export const isAdmin = (u: AppUser) => u.vai_tro === "Admin";
export const isKeToan = (u: AppUser) => u.vai_tro === "Admin" || u.vai_tro === "Ke toan";
export const isHcns = (u: AppUser) => u.vai_tro === "Admin" || u.vai_tro === "HCNS";
// Co kho nao de xuat hang di (khong tinh kho mua hang - nguon ao chi dung nhap mua).
export const coKhoThaoTac = (u: AppUser) => u.kho_phu_trach.some(laKhoTon);

const LOI: Record<string, string> = {
  VUOT_TON: t("Số lượng xuất vượt tồn kho nguồn."),
  HO_SO_DA_LIEN_KET: t("Hồ sơ này đã liên kết với một email đăng nhập khác."),
  EMAIL_DA_LIEN_KET: t("Email này đã liên kết với một hồ sơ nhân viên khác."),
  HO_SO_DA_NGHI: t("Hồ sơ này đã nghỉ việc."),
  KHONG_PHU_TRACH_KHO_NGUON: t("Bạn không phụ trách kho nguồn này."),
  KHONG_PHU_TRACH_KHO_DICH: t("Bạn không phụ trách kho nhận."),
  NGOAI_NHOM_QUAN_LY: t("Người này không thuộc nhóm cấp dưới của quản lý."),
  QL_KHONG_DUNG_TEN_TU_DO: t("Kho quản lý chỉ cấp cho nhân viên trong danh bạ thuộc nhóm."),
  CHON_1_NGUOI_NHAN: t("Chọn đúng 1 người nhận (nhân viên hoặc tên tự do)."),
  CHI_HCNS_NHAP_MUA: t("Chỉ HCNS được lập phiếu nhập mua."),
  CHI_KE_TOAN: t("Chỉ Kế toán được duyệt."),
  CHI_HCNS: t("Chỉ HCNS thực hiện được thao tác này."),
  CAN_LY_DO: t("Vui lòng nhập lý do."),
  SAI_TRANG_THAI: t("Phiếu đã được xử lý bởi người khác - tải lại để xem trạng thái mới."),
  CCDC_KHONG_O_KHO_NGUON: t("Có tài sản không nằm trong kho nguồn."),
  CCDC_KHONG_DUNG_NGUOI_GIU: t("Có tài sản không thuộc người giữ đã chọn."),
  CCDC_KHONG_TRONG_KHO: t("Chỉ xử lý được tài sản đang nằm trong kho (đã thu hồi)."),
  KHONG_CO_QUYEN_BAO_HONG: t("Bạn không có quyền báo hỏng tài sản này."),
  SAI_TRANG_THAI_TS: t("Tài sản đang ở trạng thái không cho phép thao tác này."),
  KHONG_TU_DUYET: t("Người lập phiếu không được tự duyệt phiếu của mình - Kế toán khác duyệt."),
  TRUNG_KHO: t("Kho nguồn và kho đích trùng nhau."),
  QL_KHONG_CHUYEN_SANG_KHO_QL_KHAC: t("Kho quản lý chỉ trả về kho HCNS/miền."),
  CHI_DOI_KHO_QL_MIEN: t("Chỉ đổi qua lại được giữa kho quản lý và kho miền."),
  USER_CHUA_DANG_NHAP: t("Email này chưa từng đăng nhập hệ thống - cần đăng nhập 1 lần trước khi gán."),
  ID_EXISTS: t("Mã này đã tồn tại."),
  FORBIDDEN: t("Bạn không có quyền thực hiện thao tác này."),
  DRIVE_CHUA_KET_NOI: t("Chưa kết nối Google Drive - Admin cần kết nối trước khi tải tệp."),
  DRIVE_LOI: t("Tải tệp lên Google Drive thất bại - vui lòng thử lại."),
  TEP_QUA_LON: t("Tệp lớn hơn 10MB."),
  SAI_DINH_DANG: t("Chỉ nhận ảnh (JPG, PNG, WEBP, HEIC) hoặc PDF."),
  DANG_CAP_PHAT: t("Tài sản đang nằm trong một phiếu cấp phát chưa hoàn tất."),
  DANG_CHO_DUYET: t("Đang có phiếu chờ duyệt cho tài sản này."),
  CHON_CONG_TY: t("Vui lòng chọn công ty."),
  CONG_TY_NOT_FOUND: t("Không tìm thấy công ty hoặc công ty đã ngừng hoạt động."),
  KHAC_CONG_TY: t("Các tài sản / hồ sơ phải cùng một công ty."),
  NHOM_KHAC_CONG_TY: t("Nhóm đã chọn thuộc công ty khác."),
  NHAN_VIEN_KHAC_CONG_TY: t("Nhân viên thuộc công ty khác với kho."),
  TS_KHAC_CONG_TY: t("Có tài sản thuộc công ty khác."),
  DANG_CHO_CHUYEN_CONG_TY: t("Tài sản đang nằm trong phiếu chuyển công ty chờ duyệt."),
  CHUA_KE_TOAN_DUYET: t("Phiếu chuyển công ty chưa được Kế toán duyệt."),
  DANG_GIU_TS_CONG_TY_CU: t("Nhân viên còn giữ tài sản của công ty cũ - thu hồi hoặc điều chuyển hết trước khi đổi công ty."),
  MA_CONG_TY_TRUNG: t("Mã công ty đã tồn tại."),
  KHONG_TAT_CONG_TY_MAC_DINH: t("Không thể ngừng công ty mặc định."),
  KHONG_TAT_KHO_HE_THONG: t("Không thể ngừng kho mua hàng / kho HCNS cuối cùng của công ty."),
  KHO_TIEU_HAO_KHONG_XUAT: t("Kho tiêu hao là điểm tiêu dùng - không xuất đi được."),
  KHO_TIEU_HAO_CHI_XUAT_DUNG: t("Vào kho tiêu hao văn phòng dùng phiếu cấp phát (xuất tiêu dùng), không dùng chuyển kho."),
  DA_DUYET_KHONG_SUA: t("Phiếu đã được Kế toán duyệt hoặc đã hủy - không sửa được nữa."),
  KHONG_CO_CHENH_LECH: t("Tồn thực tế khớp sổ sách - không có gì để điều chỉnh."),
  TRUNG_VAT_TU: t("Một vật tư chỉ nhập 1 dòng."),
  VT_NOT_FOUND: t("Có mặt hàng không thuộc danh mục công ty của kho nguồn."),
};

export function thongBaoLoi(e: unknown, macDinh = t("Không thực hiện được - vui lòng thử lại.")) {
  const err = e as ApiError;
  const code = err?.code;
  if (code === "VUOT_TON" && err.body?.ton !== undefined) return t("Vượt tồn: kho nguồn chỉ còn {ton} ({vt_id}).", { ton: String(err.body.ton), vt_id: String(err.body.vt_id) });
  return (code && LOI[code]) || macDinh;
}

export function fmtTien(v: number | null | undefined) {
  return v == null ? "-" : v.toLocaleString(LOCALE);
}

export const LOAI_GIAO_NHAN: Record<string, string> = {
  "Cap phat": t("Cấp phát"),
  "Thu hoi": t("Thu hồi"),
  "Dieu chuyen": t("Điều chuyển"),
  "Chuyen kho": t("Chuyển kho"),
};

export const TINH_TRANG_KIEM_KE: Record<string, { label: string; tone: Tone }> = {
  "Dung vi tri": { label: t("Đúng vị trí"), tone: "success" },
  Thieu: { label: t("Thiếu"), tone: "danger" },
  Thua: { label: t("Thừa"), tone: "warning" },
  Hong: { label: t("Hỏng"), tone: "danger" },
  "Sai nguoi giu": { label: t("Sai người giữ"), tone: "warning" },
};

export const TINH_TRANG_TS: Record<string, string> = { Tot: t("Tốt"), "Can bao tri": t("Cần bảo trì"), Hong: t("Hỏng") };
