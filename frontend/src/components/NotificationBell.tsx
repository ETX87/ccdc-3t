import { useState } from "react";
import { Bell } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useDuLieuChung } from "../lib/duLieuChung";
import { useNav } from "../lib/navigation";
import { xemTongHop } from "../lib/menu";
import { fmtNgayGio } from "../lib/format";
import { useMoViec } from "./ChiTiet";

// Chuong thong bao: so = tong viec dang cho nguoi dung (cung nguon voi man Viec can lam, tu lam moi
// 60 giay). Bam -> 8 viec moi nhat (qua han len dau) + link sang Viec can lam / Canh bao.

export function NotificationBell() {
  const auth = useAuth();
  const { viec, badges, loi } = useDuLieuChung();
  const { navigate } = useNav();
  const moViec = useMoViec();
  const [open, setOpen] = useState(false);
  if (auth.status !== "authenticated") return null;

  const so = badges["thong-bao"] ?? 0;
  const canhBao = xemTongHop(auth.user) ? (badges["canh-bao"] ?? 0) : 0;
  const rows = [...(viec?.rows ?? [])].sort((a, b) => Number(b.qua_han) - Number(a.qua_han) || b.thoi_gian.localeCompare(a.thoi_gian)).slice(0, 8);

  return (
    <div className="bell-wrap">
      <button type="button" className="notification-bell-btn" aria-label={`Thông báo (${so})`} onClick={() => setOpen(!open)}>
        <Bell size={20} />
        {so > 0 && <span className="bell-badge">{so > 99 ? "99+" : so}</span>}
      </button>
      {open && (
        <>
          <div className="dropdown-backdrop" onClick={() => setOpen(false)} />
          <div className="bell-panel">
            <div className="bell-panel-head">
              <span className="strong">Thông báo</span>
              <span className="muted small">{so} việc đang chờ bạn</span>
            </div>
            {loi && <div className="search-empty">Không tải được thông báo.</div>}
            {!loi && rows.length === 0 && <div className="search-empty">Không có việc nào cần xử lý.</div>}
            {rows.map((r) => (
              <button
                key={r.key}
                type="button"
                className={`bell-item ${r.qua_han ? "overdue" : ""}`}
                onClick={() => {
                  setOpen(false);
                  moViec(r);
                }}
              >
                <div className="bell-item-top">
                  <span className="strong">{r.loai}</span>
                  {r.ma_phieu && <span className="code-link">{r.ma_phieu}</span>}
                </div>
                <div className="bell-item-text">{r.noi_dung}</div>
                <div className="muted small">
                  {fmtNgayGio(r.thoi_gian)}
                  {r.qua_han && <span className="text-red"> · Quá hạn 48 giờ</span>}
                </div>
              </button>
            ))}
            <div className="bell-panel-foot">
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setOpen(false);
                  navigate("viec-can-lam");
                }}
              >
                Xem tất cả việc cần làm
              </button>
              {canhBao > 0 && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setOpen(false);
                    navigate("canh-bao");
                  }}
                >
                  {canhBao} loại cảnh báo
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
