import { useCallback, useMemo, useState } from "react";
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
  "nhan-vien": NhanVienScreen,
};

function AuthenticatedApp({ user }: { user: AppUser }) {
  const [nav, setNav] = useState<{ tab: TabKey; params: NavParams }>(() => ({ tab: tabMacDinh(user), params: {} }));

  const navigate = useCallback(
    (tab: TabKey, params: NavParams = {}) => {
      // Link/tham so khong duoc mo man ngoai quyen (menu da an) - quay ve man mac dinh.
      setNav(duocMoTab(user, tab) ? { tab, params } : { tab: tabMacDinh(user), params: {} });
    },
    [user],
  );

  const value = useMemo(() => ({ ...nav, navigate }), [nav, navigate]);
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

  if (state.status === "loading") return <div className="app-shell">Đang tải…</div>;
  if (state.status === "authenticated") return <AuthenticatedApp user={state.user} />;
  if (state.status === "pending") return <LoginScreen variant="pending" />;
  if (state.status === "rejected") return <LoginScreen variant="rejected" />;
  if (state.status === "disabled") return <LoginScreen variant="disabled" />;
  return <LoginScreen variant="login" />;
}
