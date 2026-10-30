import { t, tS } from "../lib/i18n";
import { AlertTriangle, ArchiveRestore, Clock, ShieldAlert, Store, Tag, TrendingDown, PackageX } from "lucide-react";

// 1 dong canh bao (the Canh bao o Tong quan + danh sach ben trai man Canh bao). Du lieu tu
// /api/dashboard/canh-bao - so dem that, mo ta that.

export type LoaiCanhBao =
  | "cho-ban-giao"
  | "qua-han-duyet"
  | "ton-am"
  | "bao-hong-cho-duyet"
  | "chenh-lech-kiem-ke"
  | "sap-het-bao-hanh"
  | "don-gia-bat-thuong"
  | "duoi-ton-toi-thieu";

export interface CanhBao {
  loai: LoaiCanhBao;
  tieu_de: string;
  mo_ta: string;
  so_luong: number;
  muc_do: "cao" | "trung_binh" | "thap";
}

export interface CanhBaoChiTiet {
  ma: string | null;
  ten: string;
  chi_tiet: string | null;
  thoi_gian: string | null;
  /** dong_ts: dong hang TSCD duoi ton toi thieu (ref = ten tai san). */
  kind: "chuyen_kho" | "giao_nhan" | "xu_ly" | "tai_san" | "vat_tu" | "dong_ts";
  ref: string;
  /** Ma rieng cua muc - chi co o loai bo qua duoc (don gia bat thuong, sap het bao hanh). */
  khoa?: string;
  // Don gia bat thuong: so lieu + de xuat xu ly (backend deXuatDonGia).
  vt_id?: string;
  don_gia?: number;
  don_gia_tham_khao?: number;
  de_xuat?: { kieu: "sua_tham_khao" | "kiem_tra_phieu" | "khong_ro"; gia_de_xuat?: number; ly_do: string };
}

/** Loai canh bao "theo doi" duoc danh dau bo qua (loai can hanh dong that tu het khi duoc xu ly). */
export const LOAI_BO_QUA_DUOC: LoaiCanhBao[] = ["don-gia-bat-thuong", "sap-het-bao-hanh"];

const KIEU: Record<LoaiCanhBao, { icon: typeof Clock; nen: string; mau: string }> = {
  "cho-ban-giao": { icon: Clock, nen: "bg-orange-light", mau: "text-orange" },
  "qua-han-duyet": { icon: TrendingDown, nen: "bg-orange-light", mau: "text-orange" },
  "ton-am": { icon: PackageX, nen: "bg-red-light", mau: "text-red" },
  "bao-hong-cho-duyet": { icon: AlertTriangle, nen: "bg-red-light", mau: "text-red" },
  "chenh-lech-kiem-ke": { icon: Store, nen: "bg-amber-light", mau: "text-amber" },
  "sap-het-bao-hanh": { icon: ShieldAlert, nen: "bg-blue-light", mau: "text-blue" },
  "don-gia-bat-thuong": { icon: Tag, nen: "bg-amber-light", mau: "text-amber" },
  "duoi-ton-toi-thieu": { icon: ArchiveRestore, nen: "bg-red-light", mau: "text-red" },
};

const BADGE = { cao: "badge-red-count", trung_binh: "badge-amber-count", thap: "badge-blue-count" } as const;

export const MUC_DO_NHAN = { cao: t("Nghiêm trọng"), trung_binh: t("Cần chú ý"), thap: t("Theo dõi") } as const;

export function CanhBaoRow({ cb, onClick, active = false }: { cb: CanhBao; onClick?: () => void; active?: boolean }) {
  const k = KIEU[cb.loai];
  const Icon = k.icon;
  return (
    <div
      className={`alert-row ${onClick ? "alert-row-clickable" : ""} ${active ? "active" : ""} ${cb.so_luong === 0 ? "alert-row-ok" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
    >
      <div className={`alert-icon-circle ${k.nen}`}>
        <Icon size={17} className={k.mau} />
      </div>
      <div className="alert-text-block">
        <div className="alert-item-title">{tS(cb.tieu_de)}</div>
        <div className="alert-item-desc">{cb.so_luong === 0 ? t("Không có") : tS(cb.mo_ta)}</div>
      </div>
      <div className={`alert-badge ${cb.so_luong === 0 ? "badge-ok-count" : BADGE[cb.muc_do]}`}>{cb.so_luong}</div>
    </div>
  );
}
