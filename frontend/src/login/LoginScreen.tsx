import { t } from "../lib/i18n";
import { ChonNgonNgu } from "../components/ChonNgonNgu";
// Port rut gon tu vi-pham-app frontend/src/login/LoginScreen.tsx - bo form "tu khai ma KTV" vi
// CCDC 3T khong co danh ba doi tac nao de tu dong khop, moi tai khoan moi deu cho Admin duyet tay.
export function LoginScreen({ variant = "login" }: { variant?: "login" | "pending" | "rejected" | "disabled" }) {
  const messages: Record<string, { title: string; sub: string }> = {
    login: { title: t("Đăng nhập hệ thống"), sub: t("Quản lý tài sản cố định, tài sản tiêu hao và kho - Dịch Vụ 3T") },
    pending: { title: t("Đang chờ duyệt"), sub: t("Tài khoản của bạn đã được ghi nhận, vui lòng chờ Admin phê duyệt.") },
    rejected: { title: t("Tài khoản bị từ chối"), sub: t("Liên hệ Admin nếu bạn cho rằng đây là nhầm lẫn.") },
    disabled: { title: t("Tài khoản đã bị khóa"), sub: t("Liên hệ Admin để được mở khóa lại.") },
  };
  const { title, sub } = messages[variant];

  async function dangXuat() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
    window.location.reload();
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <img src="/logo.png" alt="3T" className="login-logo" />
        <div className="login-brand">3T Asset Management</div>
        <div className="login-title">{title}</div>
        <div className="login-sub">{sub}</div>
        {variant === "login" && (
          <a href="/api/auth/login" className="btn btn-google">
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.1 5.1 29.3 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.3-.1-2.7-.4-4z" />
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.5 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34.1 5.1 29.3 3 24 3 16.3 3 9.7 7.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 45c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 36.6 26.7 37.5 24 37.5c-5.3 0-9.7-3.6-11.3-8.4l-6.5 5C9.5 40.6 16.2 45 24 45z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.9 2.6-2.5 4.8-4.7 6.3l6.2 5.2C40.5 36.2 44 30.6 44 24c0-1.3-.1-2.7-.4-3.5z" />
            </svg>
            {t("Đăng nhập bằng Google")}
          </a>
        )}
        {variant === "login" && <div className="login-note">{t("Chỉ tài khoản đã được Admin phê duyệt mới truy cập được.")}</div>}
        {variant !== "login" && (
          <button type="button" className="btn btn-outline btn-block" style={{ marginTop: 4 }} onClick={dangXuat}>
            {t("Đăng nhập bằng tài khoản khác")}
          </button>
        )}
        {variant === "login" && import.meta.env.DEV && (
          <a href="/api/auth/dev-login" className="btn btn-dev">
            {t("🔧 Đăng nhập DEV (bỏ qua Google, chỉ local)")}
          </a>
        )}
        <ChonNgonNgu className="login-ngon-ngu" />
      </div>
    </div>
  );
}
