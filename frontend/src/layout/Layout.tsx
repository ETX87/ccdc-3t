import { t } from "../lib/i18n";
import { APP_VERSION } from "../version";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Menu as MenuIcon } from "lucide-react";
import { useAuth, useRefreshUser } from "../auth/AuthContext";
import { api } from "../api/client";
import { useNav } from "../lib/navigation";
import { khopMuc, menuCua, type MenuItem } from "../lib/menu";
import { tenVaiTro } from "../lib/nhan";
import { Avatar } from "../components/Avatar";
import { useDuLieuChung } from "../lib/duLieuChung";
import { GlobalSearch } from "../components/GlobalSearch";
import { QrScanButton } from "../components/QrScanner";
import { NotificationBell } from "../components/NotificationBell";
import { ChonNgonNgu } from "../components/ChonNgonNgu";
import { ChonCongTy } from "../components/ChonCongTy";
import { BottomNav } from "./BottomNav";
import { CaiDatAppButton } from "../components/CaiDatAppButton";

function SidebarItem({
  item,
  badges,
  open,
  onToggle,
  onPicked,
}: {
  item: MenuItem;
  badges: Record<string, number>;
  open: boolean;
  onToggle: () => void;
  onPicked: () => void;
}) {
  const { tab, params, navigate } = useNav();
  const chuaTabHienTai = !!item.children?.some((c) => khopMuc(c, tab, params));
  const Icon = item.icon;
  // Menu me: so do = tong so do cac menu con (chi hien khi dang thu gon).
  const badge = item.children
    ? item.children.reduce((s, c) => s + (c.badgeKey ? badges[c.badgeKey] ?? 0 : 0), 0)
    : item.badgeKey
      ? badges[item.badgeKey] ?? 0
      : 0;
  const active = item.tab ? khopMuc(item, tab, params) : chuaTabHienTai && !open;

  return (
    <>
      <button
        type="button"
        className={`sidebar-nav-item ${active ? "active" : ""} ${item.children ? "sidebar-me" : ""} ${chuaTabHienTai ? "chua-hien-tai" : ""}`}
        onClick={() => {
          if (item.children) onToggle();
          else if (item.tab) {
            navigate(item.tab, badge > 0 && item.badgeParams ? { ...item.params, ...item.badgeParams } : item.params);
            onPicked();
          }
        }}
        aria-expanded={item.children ? open : undefined}
      >
        <div className="nav-item-left">
          <Icon size={17} className="nav-icon" />
          <span className="nav-label">{item.label}</span>
        </div>
        <div className="nav-item-right">
          {badge > 0 && !(item.children && open) && <span className="nav-badge-red">{badge > 99 ? "99+" : badge}</span>}
          {item.children && (open ? <ChevronDown size={14} className="nav-arrow" /> : <ChevronRight size={14} className="nav-arrow" />)}
        </div>
      </button>
      {item.children && open && (
        <div className="sidebar-subnav">
          {item.children.map((c, i) => {
            const on = khopMuc(c, tab, params);
            const soCon = c.badgeKey ? badges[c.badgeKey] ?? 0 : 0;
            const IconCon = c.icon;
            return (
              <div key={`${c.tab}-${c.params?.tab ?? ""}`} style={{ display: "contents" }}>
                {c.phan && c.phan !== item.children![i - 1]?.phan && <div className="sidebar-subnav-phan">{c.phan}</div>}
                <button
                  type="button"
                  className={`sidebar-subnav-item ${on ? "active" : ""}`}
                  onClick={() => {
                    navigate(c.tab, soCon > 0 ? { ...c.params, ...c.badgeParams } : c.params);
                    onPicked();
                  }}
                >
                  <span className="sidebar-subnav-nhan">
                    {IconCon && <IconCon size={14} className="sidebar-subnav-icon" />}
                    {c.label}
                  </span>
                  {soCon > 0 && <span className="nav-badge-red">{soCon > 99 ? "99+" : soCon}</span>}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const state = useAuth();
  const refreshUser = useRefreshUser();
  const { navigate } = useNav();
  const { badges } = useDuLieuChung();
  const [userMenu, setUserMenu] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const { tab, params } = useNav();
  // Chi mo 1 menu me 1 luc; tu mo menu me chua man dang xem (doi man tu menu khac / link / Back).
  const [moMe, setMoMe] = useState<string | null>(null);
  const menu = state.status === "authenticated" ? menuCua(state.user) : [];
  const meHienTai = menu.find((m) => m.children?.some((c) => khopMuc(c, tab, params)))?.key ?? null;
  useEffect(() => {
    if (meHienTai) setMoMe(meHienTai);
  }, [meHienTai]);

  if (state.status !== "authenticated") return null;
  const user = state.user;

  async function logout() {
    try {
      await api.post("/auth/logout");
    } finally {
      await refreshUser();
    }
  }

  return (
    <div className="app-layout">
      {drawer && <div className="sidebar-backdrop" onClick={() => setDrawer(false)} />}
      <aside className={`sidebar ${drawer ? "open" : ""}`}>
        <div className="sidebar-brand">
          <img src="/logo.png" alt="3T" className="brand-logo" />
          <div className="brand-text">
            <span className="brand-title">3T Asset</span>
            <span className="brand-subtitle">Management</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {menu.map((item, i) => (
            <div key={item.key} className={`sidebar-nhom-${item.nhom}`}>
              {item.children && !menu[i - 1]?.children && <div className="sidebar-me-ngan" />}
              <SidebarItem
                item={item}
                badges={badges}
                open={moMe === item.key}
                onToggle={() => setMoMe(moMe === item.key ? null : item.key)}
                onPicked={() => setDrawer(false)}
              />
            </div>
          ))}
          <CaiDatAppButton onDone={() => setDrawer(false)} />
        </nav>

        <div className="sidebar-footer">
          <svg className="sidebar-wave-svg" viewBox="0 0 245 100" preserveAspectRatio="none" aria-hidden="true">
            <path d="M 0,40 Q 60,10 120,45 T 245,20 L 245,100 L 0,100 Z" fill="url(#waveGrad1)" opacity="0.35" />
            <path d="M 0,60 Q 80,30 160,65 T 245,50 L 245,100 L 0,100 Z" fill="url(#waveGrad2)" opacity="0.25" />
            <defs>
              <linearGradient id="waveGrad1" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#00E5FF" />
                <stop offset="100%" stopColor="#00838F" />
              </linearGradient>
              <linearGradient id="waveGrad2" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#00B4D8" />
                <stop offset="100%" stopColor="#005662" />
              </linearGradient>
            </defs>
          </svg>
          <div className="sidebar-slogan">
            <div className="slogan-line1">{t("Quản lý tài sản hiệu quả")}</div>
            <div className="slogan-line2">{t("Kiến tạo giá trị bền vững")}</div>
            <div className="slogan-version">{t("Phiên bản")} v{APP_VERSION}</div>
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button type="button" className="topbar-menu-btn" onClick={() => setDrawer(true)} aria-label={t("Mở menu")}>
            <MenuIcon size={20} />
          </button>
          <GlobalSearch />

          <div className="topbar-right">
            <ChonCongTy />
            <ChonNgonNgu />
            <QrScanButton />
            <NotificationBell />
            <div className="user-profile-menu" onClick={() => setUserMenu(!userMenu)}>
              <Avatar ten={user.ten || user.email} anh={user.anh_dai_dien} size={38} />
              <div className="user-info-text">
                <span className="user-name">{user.ten || user.email}</span>
                <span className="user-role">{tenVaiTro(user.vai_tro)}</span>
              </div>
              <ChevronDown size={13} className="user-caret" />
              {userMenu && (
                <>
                  <div className="dropdown-backdrop" onClick={(e) => { e.stopPropagation(); setUserMenu(false); }} />
                  <div className="user-dropdown-panel">
                    <div className="dropdown-email">{user.email}</div>
                    <button
                      className="dropdown-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        setUserMenu(false);
                        navigate("ca-nhan");
                      }}
                    >
                      {t("Tài sản của tôi")}
                    </button>
                    <button className="dropdown-item text-danger" onClick={logout}>
                      {t("Đăng xuất")}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="content">{children}</main>
        <BottomNav onMenu={() => setDrawer(true)} />
      </div>
    </div>
  );
}
