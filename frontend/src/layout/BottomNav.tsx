import { Bell, ClipboardCheck, Clock, Home, Laptop, Menu as MenuIcon } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useNav, type TabKey } from "../lib/navigation";
import { useDuLieuChung } from "../lib/duLieuChung";
import { xemTongHop } from "../lib/menu";
import { QrScanButton } from "../components/QrScanner";

// Thanh dieu huong duoi cho dien thoai (< 600px, CSS an tren man lon). 4 loi tat theo vai tro + nut
// Quet QR o giua + "Menu" mo menu truot day du (cung menu sidebar).

export function BottomNav({ onMenu }: { onMenu: () => void }) {
  const auth = useAuth();
  const { tab, navigate } = useNav();
  const { badges } = useDuLieuChung();
  if (auth.status !== "authenticated") return null;
  const tongHop = xemTongHop(auth.user);

  const muc: { tab: TabKey; label: string; icon: typeof Home; badge?: number }[] = tongHop
    ? [
        { tab: "tong-quan", label: "Tổng quan", icon: Home },
        { tab: "viec-can-lam", label: "Việc cần làm", icon: ClipboardCheck, badge: badges["viec-can-lam"] },
        { tab: "canh-bao", label: "Cảnh báo", icon: Bell, badge: badges["canh-bao"] },
      ]
    : [
        { tab: "viec-can-lam", label: "Việc cần làm", icon: ClipboardCheck, badge: badges["viec-can-lam"] },
        { tab: "ca-nhan", label: "Tài sản", icon: Laptop },
        { tab: "bao-hong", label: "Báo hỏng", icon: Clock },
      ];

  const nut = (m: (typeof muc)[number]) => {
    const Icon = m.icon;
    return (
      <button key={m.tab} type="button" className={`bottom-nav-item ${tab === m.tab ? "active" : ""}`} onClick={() => navigate(m.tab)}>
        <span className="bottom-nav-icon">
          <Icon size={20} />
          {!!m.badge && <span className="bottom-nav-badge">{m.badge > 99 ? "99+" : m.badge}</span>}
        </span>
        <span>{m.label}</span>
      </button>
    );
  };

  return (
    <nav className="bottom-nav" aria-label="Điều hướng nhanh">
      {nut(muc[0])}
      {nut(muc[1])}
      <QrScanButton compact />
      {nut(muc[2])}
      <button type="button" className="bottom-nav-item" onClick={onMenu}>
        <MenuIcon size={20} />
        <span>Menu</span>
      </button>
    </nav>
  );
}
