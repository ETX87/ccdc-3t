import { t } from "../lib/i18n";
import type { ReactNode } from "react";
import { RotateCw } from "lucide-react";
import { fmtNgayGio } from "../lib/format";

// Tang 1 cua moi man hinh (DESIGN_SYSTEM.md muc 4): tieu de + bo loc + nut tac vu + "Cap nhat luc".
export function PageHeader({
  title,
  filters,
  actions,
  capNhatLuc,
  onRefresh,
  dangTai,
}: {
  title: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  capNhatLuc?: string | null;
  onRefresh?: () => void;
  dangTai?: boolean;
}) {
  return (
    <div className="dashboard-header">
      <div className="dashboard-title-group">
        <h1 className="dashboard-title">{title}</h1>
        {filters}
      </div>
      <div className="header-actions">
        {actions}
        {onRefresh && (
          <button type="button" className="header-refresh-info" onClick={onRefresh} disabled={dangTai} title={t("Tải lại dữ liệu")}>
            <RotateCw size={13} className={`refresh-icon ${dangTai ? "spin" : ""}`} />
            <span>{capNhatLuc ? t("Cập nhật lúc {x}", { x: fmtNgayGio(capNhatLuc).split(" ").reverse().join(" ") }) : t("Tải lại")}</span>
          </button>
        )}
      </div>
    </div>
  );
}
