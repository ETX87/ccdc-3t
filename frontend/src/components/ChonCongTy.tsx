import { Building2, ChevronDown } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { congTyDangChon, congTyXem, setCongTy } from "../lib/congTy";
import { t } from "../lib/i18n";
import { ChonLoc } from "./ChonLoc";

/** O chon cong ty dang xem (da phap nhan) - chi hien khi tai khoan duoc xem tu 2 cong ty. Doi = tai lai trang. */
export function ChonCongTy({ className = "" }: { className?: string }) {
  const auth = useAuth();
  const user = auth.status === "authenticated" ? auth.user : null;
  const ds = user?.cong_ty ?? [];
  if (ds.length < 2) return null;
  const dangChon = congTyXem(user).length === 1 ? congTyDangChon : "";
  return (
    <label className={`header-dropdown select-dropdown chon-ngon-ngu ${className}`} title={t("Công ty đang xem")}>
      <Building2 size={14} className="dropdown-icon" />
      <ChonLoc value={dangChon} onChange={(e) => setCongTy(e.target.value)} aria-label={t("Công ty đang xem")}>
        <option value="">{t("Tất cả công ty")}</option>
        {ds.map((c) => (
          <option key={c.id} value={String(c.id)} title={c.ten}>
            {c.ma}
          </option>
        ))}
      </ChonLoc>
      <ChevronDown size={13} className="dropdown-arrow" />
    </label>
  );
}

/** O chon cong ty trong form tao moi (chi hien khi dang xem nhieu cong ty - xem lib/congTy.ts congTyMacDinh). */
export function TruongCongTy({ value, onChange, ds }: { value: number | null; onChange: (id: number) => void; ds: { id: number; ma: string; ten: string }[] }) {
  return (
    <div className="field-group">
      <label className="field-label">{t("Công ty *")}</label>
      <ChonLoc value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))}>
        {ds.map((c) => (
          <option key={c.id} value={c.id}>
            {c.ma} - {c.ten}
          </option>
        ))}
      </ChonLoc>
    </div>
  );
}
