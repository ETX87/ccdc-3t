import { t } from "../lib/i18n";
import type { ReactNode } from "react";
import { ArrowLeft, RotateCw } from "lucide-react";
import { fmtNgayGio } from "../lib/format";
import { useNavTuyChon } from "../lib/navigation";

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
  const quayLai = useNavTuyChon()?.quayLai;
  return (
    <div className="dashboard-header">
      <div className="dashboard-title-group">
        {quayLai && (
          <button type="button" className="btn btn-outline btn-sm" onClick={quayLai} title={t("Quay lại màn trước")}>
            <ArrowLeft size={14} /> {t("Quay lại")}
          </button>
        )}
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
