import {
  Home,
  ClipboardCheck,
  Laptop,
  Store,
  Package,
  ArrowLeftRight,
  Clock,
  Trash2,
  ClipboardList,
  BarChart2,
  Bell,
  Settings,
} from "lucide-react";
import type { AppUser } from "../types";
import type { NavParams, TabKey } from "./navigation";

// Menu theo vai tro (1 nguon duy nhat cho sidebar, menu truot tren dien thoai va man mac dinh).
// Quyen that van kiem o server - day chi an cac muc nguoi dung khong dung duoc.
export const laQuanTri = (u: AppUser) => u.vai_tro === "Admin" || u.vai_tro === "Ke toan" || u.vai_tro === "HCNS";
export const laHcnsHoacAdmin = (u: AppUser) => u.vai_tro === "Admin" || u.vai_tro === "HCNS";
export const coKho = (u: AppUser) => u.kho_phu_trach.some((k) => k.loai !== "Mua hang");
export const coNhom = (u: AppUser) => u.co_cap_duoi;
/** Duoc xem so lieu tong hop (tong quan, canh bao, bao cao): quan tri, thu kho, quan ly co nhom. */
export const xemTongHop = (u: AppUser) => laQuanTri(u) || coKho(u) || coNhom(u);

export interface MenuChild {
  label: string;
  tab: TabKey;
  params?: NavParams;
  /** So do cua muc con (menu_badges) - muc cha chi hien tong khi dang dong. */
  badgeKey?: string;
  /** Tham so them khi bam luc co so do (vd loc san phieu cho duyet). */
  badgeParams?: NavParams;
  show: (u: AppUser) => boolean;
}

export interface MenuItem {
  key: string;
  label: string;
  icon: typeof Home;
  /** Muc don: mo tab nay. Muc co con: mo/dong danh sach con. */
  tab?: TabKey;
  params?: NavParams;
  children?: MenuChild[];
  /** Khoa trong menu_badges (/api/dashboard/viec-can-lam) - so do tren menu. */
  badgeKey?: string;
  show: (u: AppUser) => boolean;
}

const moiNguoi = () => true;

export const MENU: MenuItem[] = [
  { key: "tong-quan", label: "Tổng quan", icon: Home, tab: "tong-quan", show: xemTongHop },
  { key: "viec-can-lam", label: "Việc cần làm", icon: ClipboardCheck, tab: "viec-can-lam", badgeKey: "viec-can-lam", show: moiNguoi },
  {
    key: "tai-san",
    label: "Tài sản",
    icon: Laptop,
    show: moiNguoi,
    children: [
      { label: "Danh mục tài sản cố định", tab: "tai-san", show: xemTongHop },
      { label: "Tài sản của tôi", tab: "ca-nhan", show: moiNguoi },
      { label: "Nhóm của tôi", tab: "nhom", show: coNhom },
    ],
  },
  { key: "kho", label: "Kho & tồn", icon: Store, tab: "kho", badgeKey: "kho", show: (u) => laQuanTri(u) || coKho(u) },
  {
    key: "cap-phat",
    label: "Cấp phát",
    icon: Package,
    badgeKey: "cap-phat",
    show: (u) => laQuanTri(u) || coKho(u),
    children: [
      {
        label: "Phiếu cấp phát & chuyển kho",
        tab: "cap-phat",
        params: { tab: "phieu" },
        badgeKey: "cap-phat",
        badgeParams: { trang_thai: "Cho ke toan duyet", thang: "" },
        show: moiNguoi,
      },
      { label: "Tồn kho tiêu hao", tab: "cap-phat", params: { tab: "ton-kho" }, show: moiNguoi },
      { label: "Danh mục vật tư", tab: "cap-phat", params: { tab: "danh-muc" }, show: moiNguoi },
    ],
  },
  { key: "giao-nhan", label: "Điều chuyển", icon: ArrowLeftRight, tab: "giao-nhan", badgeKey: "giao-nhan", show: (u) => laQuanTri(u) || coKho(u) || coNhom(u) },
  { key: "bao-hong", label: "Báo hỏng", icon: Clock, tab: "bao-hong", badgeKey: "bao-hong", show: moiNguoi },
  { key: "thanh-ly", label: "Thanh lý & tiêu hủy", icon: Trash2, tab: "thanh-ly", badgeKey: "thanh-ly", show: laQuanTri },
  { key: "kiem-ke", label: "Kiểm kê", icon: ClipboardList, tab: "kiem-ke", badgeKey: "kiem-ke", show: laQuanTri },
  {
    key: "bao-cao",
    label: "Báo cáo",
    icon: BarChart2,
    show: xemTongHop,
    children: [
      { label: "Tổng hợp", tab: "bao-cao", params: { tab: "tong-quan" }, show: moiNguoi },
      { label: "Theo nhân viên", tab: "bao-cao", params: { tab: "theo-nhan-vien" }, show: moiNguoi },
      { label: "Theo bộ phận", tab: "bao-cao", params: { tab: "theo-bo-phan" }, show: moiNguoi },
      { label: "Sắp hết bảo hành", tab: "bao-cao", params: { tab: "sap-het-bao-hanh" }, show: moiNguoi },
      { label: "Chênh lệch kiểm kê", tab: "bao-cao", params: { tab: "kiem-ke-chenh-lech" }, show: moiNguoi },
      { label: "Đã thanh lý / tiêu hủy", tab: "bao-cao", params: { tab: "da-thanh-ly" }, show: moiNguoi },
    ],
  },
  { key: "canh-bao", label: "Cảnh báo", icon: Bell, tab: "canh-bao", badgeKey: "canh-bao", show: xemTongHop },
  {
    key: "cau-hinh",
    label: "Cấu hình",
    icon: Settings,
    show: laQuanTri,
    children: [
      { label: "Tài khoản & phân quyền", tab: "tai-khoan", show: (u) => u.vai_tro === "Admin" },
      { label: "Nhân viên & sơ đồ quản lý", tab: "nhan-vien", show: laQuanTri },
    ],
  },
];

/** Menu da loc theo nguoi dung (bo muc/con khong duoc xem, bo nhom khong con con nao). */
export function menuCua(u: AppUser): MenuItem[] {
  return MENU.filter((m) => m.show(u))
    .map((m) => (m.children ? { ...m, children: m.children.filter((c) => c.show(u)) } : m))
    .filter((m) => !m.children || m.children.length > 0);
}

/** Man mo dau: nguoi xem duoc tong hop -> Tong quan, nhan vien thuong -> Viec can lam. */
export function tabMacDinh(u: AppUser): TabKey {
  return xemTongHop(u) ? "tong-quan" : "viec-can-lam";
}

/** Tab co nam trong menu cua nguoi dung khong (chan mo tab ngoai quyen qua link/tham so). */
export function duocMoTab(u: AppUser, tab: TabKey): boolean {
  return menuCua(u).some((m) => m.tab === tab || m.children?.some((c) => c.tab === tab));
}
