import { t } from "../lib/i18n";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { laQuanTri } from "../lib/menu";
import { laKhoTon } from "../lib/nhan";
import { ChonLoc } from "./ChonLoc";

interface KhoOpt {
  id: number;
  ten_kho: string;
  loai: string;
}

// Bo loc "Tat ca don vi" = kho trong pham vi quyen (quan tri: moi kho; thu kho/QL: kho minh phu trach).
// Server van kiem lai (/dashboard/* tra 403 neu kho ngoai quyen).
export function KhoFilter({ value, onChange }: { value: string; onChange: (khoId: string) => void }) {
  const auth = useAuth();
  const user = auth.status === "authenticated" ? auth.user : null;
  const [khos, setKhos] = useState<KhoOpt[]>([]);

  useEffect(() => {
    if (!user) return;
    if (laQuanTri(user) || user.xem_ton) {
      api
        .get<{ rows: (KhoOpt & { bat_tat: number })[] }>("/kho")
        .then((r) => setKhos(r.rows.filter((k) => k.bat_tat && laKhoTon(k))))
        .catch(() => setKhos([]));
    } else {
      setKhos(user.kho_phu_trach.filter(laKhoTon));
    }
  }, [user]);

  return (
    <label className="header-dropdown unit-dropdown select-dropdown">
      <ChonLoc value={value} onChange={(e) => onChange(e.target.value)} aria-label={t("Đơn vị")}>
        <option value="">{t("Tất cả đơn vị")}</option>
        {khos.map((k) => (
          <option key={k.id} value={k.id}>
            {k.ten_kho}
          </option>
        ))}
      </ChonLoc>
      <ChevronDown size={13} className="dropdown-arrow" />
    </label>
  );
}
