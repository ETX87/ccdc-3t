import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { laQuanTri } from "../lib/menu";

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
    if (laQuanTri(user)) {
      api
        .get<{ rows: (KhoOpt & { bat_tat: number })[] }>("/kho")
        .then((r) => setKhos(r.rows.filter((k) => k.bat_tat && k.loai !== "Mua hang")))
        .catch(() => setKhos([]));
    } else {
      setKhos(user.kho_phu_trach.filter((k) => k.loai !== "Mua hang"));
    }
  }, [user]);

  return (
    <label className="header-dropdown unit-dropdown select-dropdown">
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Đơn vị">
        <option value="">Tất cả đơn vị</option>
        {khos.map((k) => (
          <option key={k.id} value={k.id}>
            {k.ten_kho}
          </option>
        ))}
      </select>
      <ChevronDown size={13} className="dropdown-arrow" />
    </label>
  );
}
