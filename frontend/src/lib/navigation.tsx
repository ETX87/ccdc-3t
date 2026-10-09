import { createContext, useContext, type ReactNode } from "react";

// Moi man hinh cua app (1 muc menu = 1 TabKey). Tham so (params) de cac link "Xem tat ca", nut luong
// tai san, canh bao... mo dung man hinh kem bo loc san (vd tab "Bao hong" cua man xu ly tai san).
export type TabKey =
  | "tong-quan"
  | "viec-can-lam"
  | "canh-bao"
  | "tai-san"
  | "ca-nhan"
  | "nhom"
  | "kho"
  | "cap-phat"
  | "giao-nhan"
  | "bao-hong"
  | "thanh-ly"
  | "kiem-ke"
  | "bao-cao"
  | "tai-khoan"
  | "cong-ty"
  | "nhan-vien";

export type NavParams = Record<string, string>;

interface NavValue {
  tab: TabKey;
  params: NavParams;
  navigate: (tab: TabKey, params?: NavParams) => void;
  /** Co buoc truoc trong app (lich su trinh duyet) -> quay lai; undefined o man dau tien. */
  quayLai?: () => void;
}

const NavContext = createContext<NavValue | null>(null);

export function NavProvider({ value, children }: { value: NavValue; children: ReactNode }) {
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

/** Nhu useNav nhung khong bat buoc trong NavProvider (component dung chung, vd PageHeader). */
export function useNavTuyChon() {
  return useContext(NavContext);
}

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav phai dung trong NavProvider");
  return ctx;
}
