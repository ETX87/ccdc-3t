import { t } from "../lib/i18n";
import type { ReactNode } from "react";
import { fmtSo } from "../lib/format";

export type KpiTone = "cyan" | "blue-light" | "blue" | "purple" | "yellow" | "red";

const ICON_BG: Record<KpiTone, string> = {
  cyan: "bg-teal",
  "blue-light": "bg-cyan",
  blue: "bg-blue",
  purple: "bg-purple",
  yellow: "bg-amber",
  red: "bg-red",
};

export interface XuHuong {
  /** % thay doi so voi ky truoc; null = khong tinh duoc. */
  pct: number | null;
  /** Gia tri ky truoc; null = chua co so lieu ky truoc (khong bia so). */
  truoc: number | null;
}

/**
 * The KPI chuan DESIGN_SYSTEM.md 6.1: icon tron, watermark mo, nhan, so lon, xu huong, dong phu.
 * `tangLaXau`: chi so tang la dieu xau (vd phieu cho duyet) -> mau cam thay vi xanh.
 */
export function KpiCard({
  tone,
  icon,
  watermark,
  label,
  value,
  xuHuong,
  moTaXuHuong = t("so với kỳ trước"),
  trend,
  subtext,
  tangLaXau = false,
  onClick,
}: {
  tone: KpiTone;
  icon: ReactNode;
  watermark?: ReactNode;
  label: string;
  value: ReactNode;
  xuHuong?: XuHuong;
  moTaXuHuong?: string;
  /** Dong xu huong tu do (thay cho xuHuong) - vd "3 phiếu quá 48 giờ". */
  trend?: ReactNode;
  subtext?: ReactNode;
  tangLaXau?: boolean;
  onClick?: () => void;
}) {
  let dongXuHuong: ReactNode = trend ?? null;
  if (!dongXuHuong && xuHuong) {
    if (xuHuong.pct == null) {
      dongXuHuong = (
        <div className="kpi-trend">
          <span className="trend-sub">{xuHuong.truoc == null ? t("Chưa có số liệu kỳ trước") : t("Kỳ trước: {x}", { x: fmtSo(xuHuong.truoc) })}</span>
        </div>
      );
    } else {
      const tang = xuHuong.pct > 0;
      const bang = xuHuong.pct === 0;
      const xau = !bang && tang === tangLaXau;
      dongXuHuong = (
        <div className={`kpi-trend ${bang ? "" : xau ? "trend-warning" : "trend-up"}`}>
          <span className="trend-arrow">{bang ? "→" : tang ? "↑" : "↓"}</span>
          <span className="trend-bold">{fmtSo(Math.abs(xuHuong.pct), 1)}%</span>
          <span className="trend-sub">{moTaXuHuong}</span>
        </div>
      );
    }
  }
  return (
    <div
      className={`kpi-card card-${tone} ${onClick ? "kpi-clickable" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
    >
      {watermark && <div className="kpi-watermark">{watermark}</div>}
      <div className={`kpi-icon-wrap ${ICON_BG[tone]}`}>{icon}</div>
      <div className="kpi-body">
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{value}</div>
        {dongXuHuong}
        {subtext && <div className="kpi-subtext">{subtext}</div>}
      </div>
    </div>
  );
}
