import { t } from "./i18n";
import {
  Home,
  ClipboardCheck,
  Laptop,
  Mail,
  Store,
  Package,
  ArrowLeftRight,
  Trash2,
  ClipboardList,
  BarChart2,
  Bell,
  Boxes,
  Building2,
  Network,
  PieChart,
  ShieldCheck,
  Tags,
  UserRound,
  Users,
  Warehouse,
  Wrench,
} from "lucide-react";
import type { AppUser } from "../types";
import { laKhoTon } from "./nhan";
import type { NavParams, TabKey } from "./navigation";

// Menu theo vai tro (1 nguon duy nhat cho sidebar, menu truot tren dien thoai va man mac dinh).
// Quyen that van kiem o server - day chi an cac muc nguoi dung khong dung duoc.
export const laQuanTri = (u: AppUser) => u.vai_tro === "Admin" || u.vai_tro === "Ke toan" || u.vai_tro === "HCNS";
export const laHcnsHoacAdmin = (u: AppUser) => u.vai_tro === "Admin" || u.vai_tro === "HCNS";
export const coKho = (u: AppUser) => u.kho_phu_trach.some(laKhoTon);
export const coNhom = (u: AppUser) => u.co_cap_duoi;
/** Duoc xem so lieu tong hop (tong quan, canh bao, bao cao): quan tri, thu kho, quan ly co nhom. */
export const xemTongHop = (u: AppUser) => laQuanTri(u) || coKho(u) || coNhom(u);
/** Quyen them "Xem ton kho toan cong ty" (Admin bat o Tai khoan & phan quyen) - chi xem ton / tai san. */
export const xemTon = (u: AppUser) => !!u.xem_ton;

export interface MenuChild {
  label: string;
  tab: TabKey;
  params?: NavParams;
  /** Muc mac dinh cua tab khi URL chua co params.tab (de to sang dung 1 muc). */
  macDinh?: boolean;
  /** So do cua muc con (menu_badges) - muc cha chi hien tong khi dang dong. */
  badgeKey?: string;
  /** Tham so them khi bam luc co so do (vd loc san phieu cho duyet). */
  badgeParams?: NavParams;
  show: (u: AppUser) => boolean;
}

/** Nhom menu (tieu de + mau rieng tren sidebar) - tach ro TSCD / tieu hao / kho / bao cao / cau hinh. */
export type NhomMenu = "chung" | "tscd" | "tieu-hao" | "kho" | "bao-cao" | "cau-hinh";
export const NHOM_MENU: Record<NhomMenu, string> = {
  chung: "",
  tscd: t("Tài sản cố định"),
  "tieu-hao": t("Vật tư tiêu hao"),
  kho: t("Kho"),
  "bao-cao": t("Báo cáo"),
  "cau-hinh": t("Cấu hình"),
};

export interface MenuItem {
  key: string;
  label: string;
  icon: typeof Home;
  nhom: NhomMenu;
  /** Muc don: mo tab nay. Muc co con: mo/dong danh sach con. */
  tab?: TabKey;
  params?: NavParams;
  macDinh?: boolean;
  children?: MenuChild[];
  /** Khoa trong menu_badges (/api/dashboard/viec-can-lam) - so do tren menu. */
  badgeKey?: string;
  badgeParams?: NavParams;
  show: (u: AppUser) => boolean;
}

/** Muc menu (cha don / con) co dang mo dung man hien tai khong - so ca params.tab neu muc co. */
export function khopMuc(m: { tab?: TabKey; params?: NavParams; macDinh?: boolean }, tab: TabKey, params: NavParams): boolean {
  if (!m.tab || m.tab !== tab) return false;
  if (!m.params?.tab) return true;
  return params.tab ? params.tab === m.params.tab : !!m.macDinh;
}

const moiNguoi = () => true;
const xemKhoTieuHao = (u: AppUser) => laQuanTri(u) || coKho(u);
const bc = (label: string, tab: string, show: (u: AppUser) => boolean = moiNguoi, macDinh = false): MenuChild => ({
  label,
  tab: "bao-cao",
  params: { tab },
  macDinh,
  show,
});

export const MENU: MenuItem[] = [
  // ---- chung
  { key: "tong-quan", nhom: "chung", label: t("Tổng quan"), icon: Home, tab: "tong-quan", show: xemTongHop },
  { key: "viec-can-lam", nhom: "chung", label: t("Việc cần làm"), icon: ClipboardCheck, tab: "viec-can-lam", badgeKey: "viec-can-lam", show: moiNguoi },
  { key: "canh-bao", nhom: "chung", label: t("Cảnh báo"), icon: Bell, tab: "canh-bao", badgeKey: "canh-bao", show: xemTongHop },
  // ---- tai san co dinh
  { key: "tai-san", nhom: "tscd", label: t("Danh mục tài sản"), icon: Laptop, tab: "tai-san", show: (u) => xemTongHop(u) || xemTon(u) },
  { key: "ca-nhan", nhom: "tscd", label: t("Tài sản của tôi"), icon: UserRound, tab: "ca-nhan", show: moiNguoi },
  { key: "nhom", nhom: "tscd", label: t("Nhóm của tôi"), icon: Users, tab: "nhom", show: coNhom },
  { key: "giao-nhan", nhom: "tscd", label: t("Cấp phát & điều chuyển"), icon: ArrowLeftRight, tab: "giao-nhan", badgeKey: "giao-nhan", show: (u) => laQuanTri(u) || coKho(u) || coNhom(u) },
  { key: "bao-hong", nhom: "tscd", label: t("Báo hỏng"), icon: Wrench, tab: "bao-hong", badgeKey: "bao-hong", show: moiNguoi },
  { key: "thanh-ly", nhom: "tscd", label: t("Thanh lý & tiêu hủy"), icon: Trash2, tab: "thanh-ly", badgeKey: "thanh-ly", show: laQuanTri },
  { key: "kiem-ke", nhom: "tscd", label: t("Kiểm kê"), icon: ClipboardList, tab: "kiem-ke", badgeKey: "kiem-ke", show: laQuanTri },
  // ---- vat tu tieu hao
  {
    key: "cap-phat",
    nhom: "tieu-hao",
    label: t("Phiếu cấp phát & chuyển kho"),
    icon: Package,
    tab: "cap-phat",
    params: { tab: "phieu" },
    macDinh: true,
    badgeKey: "cap-phat",
    badgeParams: { trang_thai: "Cho ke toan duyet", thang: "" },
    show: xemKhoTieuHao,
  },
  { key: "ton-tieu-hao", nhom: "tieu-hao", label: t("Tồn kho tiêu hao"), icon: Boxes, tab: "cap-phat", params: { tab: "ton-kho" }, show: (u) => xemKhoTieuHao(u) || xemTon(u) },
  { key: "danh-muc-vt", nhom: "tieu-hao", label: t("Danh mục vật tư"), icon: Tags, tab: "cap-phat", params: { tab: "danh-muc" }, show: xemKhoTieuHao },
  // ---- kho
  { key: "kho", nhom: "kho", label: t("Kho & tồn"), icon: Store, tab: "kho", params: { tab: "ton" }, macDinh: true, badgeKey: "kho", show: (u) => laQuanTri(u) || coKho(u) || xemTon(u) },
  // ---- bao cao
  {
    key: "bao-cao-tscd",
    nhom: "bao-cao",
    label: t("Báo cáo tài sản cố định"),
    icon: BarChart2,
    show: xemTongHop,
    children: [
      bc(t("Tổng hợp"), "tong-quan", moiNguoi, true),
      bc(t("Theo công ty"), "theo-cong-ty", (u) => laQuanTri(u) && u.cong_ty.length > 1),
      bc(t("Theo nhân viên"), "theo-nhan-vien"),
      bc(t("Theo bộ phận"), "theo-bo-phan"),
      bc(t("Sắp hết bảo hành"), "sap-het-bao-hanh"),
      bc(t("Chênh lệch kiểm kê"), "kiem-ke-chenh-lech"),
      bc(t("Đã thanh lý / tiêu hủy"), "da-thanh-ly"),
    ],
  },
  {
    key: "bao-cao-tieu-hao",
    nhom: "bao-cao",
    label: t("Báo cáo tiêu hao"),
    icon: PieChart,
    show: xemTongHop,
    children: [bc(t("Tiêu dùng văn phòng"), "tieu-dung"), bc(t("Tiêu hao cấp cho NV"), "tieu-hao-nv")],
  },
  // ---- cau hinh
  { key: "kho-cau-hinh", nhom: "cau-hinh", label: t("Kho & thủ kho"), icon: Warehouse, tab: "kho", params: { tab: "cau-hinh" }, show: laHcnsHoacAdmin },
  { key: "nhan-vien", nhom: "cau-hinh", label: t("Nhân viên & sơ đồ quản lý"), icon: Network, tab: "nhan-vien", show: laQuanTri },
  { key: "tai-khoan", nhom: "cau-hinh", label: t("Tài khoản & phân quyền"), icon: ShieldCheck, tab: "tai-khoan", show: (u) => u.vai_tro === "Admin" },
  { key: "cong-ty", nhom: "cau-hinh", label: t("Công ty (pháp nhân)"), icon: Building2, tab: "cong-ty", show: (u) => u.vai_tro === "Admin" },
  { key: "bao-cao-email", nhom: "cau-hinh", label: t("Báo cáo email định kỳ"), icon: Mail, tab: "bao-cao-email", show: laHcnsHoacAdmin },
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
