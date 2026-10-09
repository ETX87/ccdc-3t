import { t } from "./lib/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./auth/AuthContext";
import { LoginScreen } from "./login/LoginScreen";
import { Layout } from "./layout/Layout";
import { NavProvider, type NavParams, type TabKey } from "./lib/navigation";
import { duocMoTab, tabMacDinh } from "./lib/menu";
import { DuLieuChungProvider } from "./lib/duLieuChung";
import { ChiTietProvider } from "./components/ChiTiet";
import type { AppUser } from "./types";
import { TongQuanScreen } from "./modules/TongQuanScreen";
import { ViecCanLamScreen } from "./modules/ViecCanLamScreen";
import { CanhBaoScreen } from "./modules/CanhBaoScreen";
import { AdminUsersScreen } from "./modules/AdminUsersScreen";
import { CongTyScreen } from "./modules/CongTyScreen";
import { DanhMucCcdcScreen } from "./modules/DanhMucCcdcScreen";
import { NhanVienScreen } from "./modules/NhanVienScreen";
import { GiaoNhanScreen } from "./modules/GiaoNhanScreen";
import { XacNhanNhanScreen } from "./modules/XacNhanNhanScreen";
import { KiemKeScreen } from "./modules/KiemKeScreen";
import { XuLyTaiSanScreen } from "./modules/XuLyTaiSanScreen";
import { TieuHaoScreen } from "./modules/TieuHaoScreen";
import { BaoCaoScreen } from "./modules/BaoCaoScreen";
import { KhoScreen } from "./modules/KhoScreen";
import { NhomCuaToiScreen } from "./modules/NhomCuaToiScreen";

const SCREENS: Record<TabKey, () => JSX.Element | null> = {
  "tong-quan": TongQuanScreen,
  "viec-can-lam": ViecCanLamScreen,
  "canh-bao": CanhBaoScreen,
  "tai-san": DanhMucCcdcScreen,
  "ca-nhan": XacNhanNhanScreen,
  nhom: NhomCuaToiScreen,
  kho: KhoScreen,
  "cap-phat": TieuHaoScreen,
  "giao-nhan": GiaoNhanScreen,
  "bao-hong": XuLyTaiSanScreen,
  "thanh-ly": XuLyTaiSanScreen,
  "kiem-ke": KiemKeScreen,
  "bao-cao": BaoCaoScreen,
  "tai-khoan": AdminUsersScreen,
  "cong-ty": CongTyScreen,
  "nhan-vien": NhanVienScreen,
};

// Moi lan chuyen man ghi 1 buoc vao lich su trinh duyet (history.pushState, URL giu nguyen) -> nut Back cua
// trinh duyet / dien thoai quay ve man truoc thay vi thoat app; `i` = so buoc da di (0 = man dau, an nut Quay lai).
type NavState = { tab: TabKey; params: NavParams; i: number };

function AuthenticatedApp({ user }: { user: AppUser }) {
  const [nav, setNav] = useState<NavState>(() => {
    const s = (window.history.state as { ccdc?: NavState } | null)?.ccdc;
    return s && duocMoTab(user, s.tab) ? s : { tab: tabMacDinh(user), params: {}, i: 0 };
  });
  const navRef = useRef(nav);
  navRef.current = nav;

  useEffect(() => {
    window.history.replaceState({ ...(window.history.state ?? {}), ccdc: navRef.current }, "");
    const onPop = (e: PopStateEvent) => {
      const s = (e.state as { ccdc?: NavState } | null)?.ccdc;
      if (s) setNav(s);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback(
    (tab: TabKey, params: NavParams = {}) => {
      // Link/tham so khong duoc mo man ngoai quyen (menu da an) - quay ve man mac dinh.
      const dich = duocMoTab(user, tab) ? { tab, params } : { tab: tabMacDinh(user), params: {} };
      const cur = navRef.current;
      if (cur.tab === dich.tab && JSON.stringify(cur.params) === JSON.stringify(dich.params)) return;
      const next: NavState = { ...dich, i: cur.i + 1 };
      window.history.pushState({ ccdc: next }, "");
      setNav(next);
    },
    [user],
  );
  const quayLai = useCallback(() => window.history.back(), []);

  const value = useMemo(() => ({ tab: nav.tab, params: nav.params, navigate, quayLai: nav.i > 0 ? quayLai : undefined }), [nav, navigate, quayLai]);
  const Screen = SCREENS[nav.tab];

  return (
    <NavProvider value={value}>
      <DuLieuChungProvider>
        <ChiTietProvider>
          <Layout>
            <Screen key={`${nav.tab}:${JSON.stringify(nav.params)}`} />
          </Layout>
        </ChiTietProvider>
      </DuLieuChungProvider>
    </NavProvider>
  );
}

export function App() {
  const state = useAuth();

  if (state.status === "loading") return <div className="app-shell">{t("Đang tải…")}</div>;
  if (state.status === "authenticated") return <AuthenticatedApp user={state.user} />;
  if (state.status === "pending") return <LoginScreen variant="pending" />;
  if (state.status === "rejected") return <LoginScreen variant="rejected" />;
  if (state.status === "disabled") return <LoginScreen variant="disabled" />;
  return <LoginScreen variant="login" />;
}
