import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Menu as MenuIcon } from "lucide-react";
import { useAuth, useRefreshUser } from "../auth/AuthContext";
import { api } from "../api/client";
import { useNav } from "../lib/navigation";
import { menuCua, type MenuItem } from "../lib/menu";
import { tenVaiTro } from "../lib/nhan";
import { Avatar } from "../components/Avatar";
import { useDuLieuChung } from "../lib/duLieuChung";
import { GlobalSearch } from "../components/GlobalSearch";
import { QrScanButton } from "../components/QrScanner";
import { NotificationBell } from "../components/NotificationBell";
import { BottomNav } from "./BottomNav";

function SidebarItem({
  item,
  badges,
  onPicked,
}: {
  item: MenuItem;
  badges: Record<string, number>;
  onPicked: () => void;
}) {
  const { tab, params, navigate } = useNav();
  const chuaTabHienTai = !!item.children?.some((c) => c.tab === tab);
  const [open, setOpen] = useState(chuaTabHienTai);
  useEffect(() => {
    if (chuaTabHienTai) setOpen(true);
  }, [chuaTabHienTai]);

  const Icon = item.icon;
  const badge = item.badgeKey ? badges[item.badgeKey] ?? 0 : 0;
  const active = item.tab ? tab === item.tab : chuaTabHienTai && !open;

  return (
    <>
      <button
        type="button"
        className={`sidebar-nav-item ${active ? "active" : ""}`}
        onClick={() => {
          if (item.children) setOpen(!open);
          else if (item.tab) {
            navigate(item.tab, item.params);
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
          {badge > 0 && <span className="nav-badge-red">{badge > 99 ? "99+" : badge}</span>}
          {item.children && (open ? <ChevronDown size={14} className="nav-arrow" /> : <ChevronRight size={14} className="nav-arrow" />)}
        </div>
      </button>
      {item.children && open && (
        <div className="sidebar-subnav">
          {item.children.map((c) => {
            const on = tab === c.tab && (!c.params?.tab || (params.tab ?? c.params.tab) === c.params.tab);
            return (
              <button
                key={c.label}
                type="button"
                className={`sidebar-subnav-item ${on ? "active" : ""}`}
                onClick={() => {
                  navigate(c.tab, c.params);
                  onPicked();
                }}
              >
                {c.label}
              </button>
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

  if (state.status !== "authenticated") return null;
  const user = state.user;
  const menu = menuCua(user);

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
          {menu.map((item) => (
            <SidebarItem key={item.key} item={item} badges={badges} onPicked={() => setDrawer(false)} />
          ))}
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
            <div className="slogan-line1">Quản lý tài sản hiệu quả</div>
            <div className="slogan-line2">Kiến tạo giá trị bền vững</div>
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button type="button" className="topbar-menu-btn" onClick={() => setDrawer(true)} aria-label="Mở menu">
            <MenuIcon size={20} />
          </button>
          <GlobalSearch />

          <div className="topbar-right">
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
                      Tài sản của tôi
                    </button>
                    <button className="dropdown-item text-danger" onClick={logout}>
                      Đăng xuất
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
