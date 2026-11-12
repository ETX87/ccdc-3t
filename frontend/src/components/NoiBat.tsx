import { t } from "../lib/i18n";
import { useContext, type ReactNode } from "react";
import { ChiTietCtx } from "./LienKet";
import {
  AlarmClock,
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  Building2,
  Flame,
  PackagePlus,
  SlidersHorizontal,
  Store,
  Truck,
  Undo2,
  UserCheck,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { fmtNgayGio, fmtSo } from "../lib/format";

// Bo "lam noi bat du lieu" trong bang (2026-10-13, user: bang nhat nhoa, can nhin 1-2s thay van de):
// mau theo Y NGHIA (do = can xu ly, vang = sap toi han, xanh = binh thuong), icon cho loai, tuoi cho cho phieu dang cho.

export type MauNoiBat = "teal" | "blue" | "purple" | "amber" | "red" | "slate" | "cyan";

const LOAI: Record<string, { icon: LucideIcon; mau: MauNoiBat }> = {
  // phieu tieu hao
  "Nhap mua": { icon: PackagePlus, mau: "teal" },
  "Chuyen kho": { icon: Truck, mau: "blue" },
  "Cap phat NV": { icon: UserCheck, mau: "purple" },
  "Dieu chinh": { icon: SlidersHorizontal, mau: "amber" },
  // phieu giao nhan TSCD
  "Cap phat": { icon: UserCheck, mau: "purple" },
  "Thu hoi": { icon: Undo2, mau: "amber" },
  "Dieu chuyen": { icon: ArrowLeftRight, mau: "cyan" },
  "Chuyen cong ty": { icon: Building2, mau: "slate" },
  // xu ly tai san
  "Bao hong": { icon: Wrench, mau: "red" },
  "Thanh ly": { icon: Banknote, mau: "amber" },
  "Tieu huy": { icon: Flame, mau: "red" },
};

/** Chip loai phieu: icon + mau rieng tung loai - quet mat la phan biet nhap / chuyen / cap / xu ly. */
export function LoaiChip({ loai, nhan }: { loai: string; nhan: ReactNode }) {
  const k = LOAI[loai] ?? { icon: PackagePlus, mau: "slate" as MauNoiBat };
  const Icon = k.icon;
  return (
    <span className={`nb-chip nb-${k.mau}`}>
      <Icon size={12} strokeWidth={2.4} />
      {nhan}
    </span>
  );
}

const KHO: Record<string, MauNoiBat> = { HCNS: "teal", Mien: "blue", "Trung chuyen": "cyan", "Quan ly": "purple", "Tieu hao": "amber", "Mua hang": "slate" };

/** Ten kho kem icon mau theo loai kho (khong co loai -> xam). */
export function KhoTag({ ten, loai }: { ten: ReactNode; loai?: string | null }) {
  if (ten == null || ten === "") return <span className="muted">-</span>;
  const mau = (loai && KHO[loai]) || "slate";
  const Icon = loai === "Tieu hao" ? Store : Warehouse;
  return (
    <span className="nb-tag">
      <span className={`nb-tag-icon nb-${mau}`}>
        <Icon size={11} strokeWidth={2.4} />
      </span>
      <span className="nb-tag-ten">{ten}</span>
    </span>
  );
}

/** Ten nguoi kem vong chu cai dau. Co `ma` (ma NV) -> bam mo ho so nhan vien (popup chi tiet). */
export function NguoiTag({ ten, ma }: { ten?: string | null; ma?: string | null }) {
  const ctx = useContext(ChiTietCtx);
  if (!ten) return <span className="muted">-</span>;
  const tu = ten.replace(/^\s*\[[^\]]*\]\s*/, "").trim().split(/\s+/);
  const chu = (tu.length > 1 ? tu[tu.length - 1][0] : tu[0][0])?.toUpperCase() ?? "?";
  const noiDung = (
    <>
      <span className="nb-avatar">{chu}</span>
      <span className="nb-tag-ten">{ten}</span>
    </>
  );
  if (ma && ctx)
    return (
      <button
        type="button"
        className="nb-tag nb-tag-link"
        title={t("Mở hồ sơ nhân viên")}
        onClick={(e) => {
          e.stopPropagation();
          ctx.moNhanVien(ma);
        }}
      >
        {noiDung}
      </button>
    );
  return <span className="nb-tag">{noiDung}</span>;
}

const GIO = 3600 * 1000;
/** So gio tu thoi diem `ngay` (gio VN "YYYY-MM-DD HH:MM:SS") toi hien tai. */
export function soGioTu(ngay: string | null | undefined): number | null {
  if (!ngay) return null;
  const ms = Date.parse(`${ngay.replace(" ", "T")}+07:00`);
  return Number.isNaN(ms) ? null : (Date.now() - ms) / GIO;
}

/**
 * Ngay lap + TUOI CHO khi phieu con dang cho xu ly: <24h xanh, 24-48h vang, >48h do + "qua han"
 * (nguong 48 gio dung chung toan he thong). Khong con cho -> chi hien ngay.
 */
export function NgayCho({ ngay, dangCho }: { ngay: string | null | undefined; dangCho: boolean }) {
  const h = soGioTu(ngay);
  return (
    <div className="nb-ngay">
      <div className="text-secondary">{ngay ? fmtNgayGio(ngay) : "-"}</div>
      {dangCho && h != null && (
        <span className={`nb-tuoi ${h > 48 ? "nb-red" : h > 24 ? "nb-amber" : "nb-teal"}`}>
          <AlarmClock size={11} strokeWidth={2.4} />
          {h > 48 ? t("Quá hạn {x}", { x: tuoi(h) }) : t("Chờ {x}", { x: tuoi(h) })}
        </span>
      )}
    </div>
  );
}

function tuoi(h: number): string {
  if (h < 1) return t("{x} phút", { x: Math.max(1, Math.round(h * 60)) });
  if (h < 48) return t("{x} giờ", { x: Math.floor(h) });
  return t("{x} ngày", { x: Math.floor(h / 24) });
}

/** So luong ton: am = do + canh bao, 0 = xam, <= nguongThap = vang, con lai dam. */
export function SoTon({ so, dvt, nguongThap, chuSo = 2 }: { so: number; dvt?: string | null; nguongThap?: number; chuSo?: number }) {
  const cls = so < 0 ? "nb-so nb-so-am" : so === 0 ? "nb-so nb-so-0" : nguongThap != null && so <= nguongThap ? "nb-so nb-so-thap" : "nb-so";
  return (
    <span className={cls}>
      {so < 0 && <AlertTriangle size={12} strokeWidth={2.6} />}
      {fmtSo(so, chuSo)}
      {dvt && <span className="nb-dvt">{dvt}</span>}
    </span>
  );
}

/** Gia tri tien: dam, so lon (>= 10 trieu) to dam hon; null -> "-". */
export function TienTe({ so }: { so: number | null | undefined }) {
  if (so == null) return <span className="muted">-</span>;
  return <span className={`nb-tien${Math.abs(so) >= 10_000_000 ? " nb-tien-lon" : ""}`}>{fmtSo(so)}</span>;
}
