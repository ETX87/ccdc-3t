import { t } from "../lib/i18n";
import { createContext, useContext, type ReactNode } from "react";

// Lien ket dung chung toan app (2026-11-12, user: moi thong tin lien quan - ma phieu, tai san, vat tu, nhan vien - bam
// duoc de mo UI chi tiet tuong ung, popup chong). Context dat o ChiTietProvider (ChiTiet.tsx); tach file rieng de cac
// popup chi tiet (ChiTietNhanVien, ChiTietVatTu...) va NoiBat dung chung khong bi vong import.

export type LoaiPhieu = "chuyen_kho" | "giao_nhan" | "xu_ly";

export interface ChiTietApi {
  moPhieu: (loai: LoaiPhieu, id: string) => void;
  moTaiSan: (id: string) => void;
  /** Ho so 1 vat tu tieu hao: ton tung kho, lich su phieu, nguoi nhan (components/ChiTietVatTu.tsx). */
  moVatTu: (id: string) => void;
  /** Ho so 1 nhan vien (popup 95%): tai san dang giu, tieu hao duoc cap, lich su (components/ChiTietNhanVien.tsx). */
  moNhanVien: (maNv: string) => void;
}

export const ChiTietCtx = createContext<ChiTietApi | null>(null);

export function useChiTiet() {
  const ctx = useContext(ChiTietCtx);
  if (!ctx) throw new Error("useChiTiet phai dung trong ChiTietProvider");
  return ctx;
}

/** Bam khong lan len dong bang (dong bang co onClick rieng). */
const chan = (fn: () => void) => (e: React.MouseEvent) => {
  e.stopPropagation();
  fn();
};

/** Ten nhan vien bam mo ho so. Khong co ma (ten tu do / tai khoan chua lien ket ho so) -> chu thuong. */
export function NvLink({ ma, ten, phu }: { ma?: string | null; ten?: string | null; phu?: ReactNode }) {
  const ctx = useContext(ChiTietCtx);
  const nhan = ten || ma;
  if (!nhan) return <span className="muted">-</span>;
  if (!ma || !ctx) return <span>{nhan}</span>;
  return (
    <button type="button" className="so-link lien-ket-nv" title={t("Mở hồ sơ nhân viên")} onClick={chan(() => ctx.moNhanVien(ma))}>
      {nhan}
      {phu}
    </button>
  );
}

/** Ma phieu bam mo phieu. */
export function PhieuLink({ loai, id, ma }: { loai: LoaiPhieu; id?: string | null; ma?: string | null }) {
  const ctx = useContext(ChiTietCtx);
  if (!id) return <span className="muted">-</span>;
  const nhan = ma || id.slice(0, 8);
  if (!ctx) return <span className="code-link">{nhan}</span>;
  return (
    <span className="code-link" role="button" title={t("Mở phiếu")} onClick={chan(() => ctx.moPhieu(loai, id))}>
      {nhan}
    </span>
  );
}

/** Ma tai san bam mo ho so tai san. */
export function TsLink({ id, ten }: { id?: string | null; ten?: string | null }) {
  const ctx = useContext(ChiTietCtx);
  if (!id) return <span className="muted">-</span>;
  return (
    <span className="code-link" role="button" title={ten ?? t("Mở tài sản")} onClick={ctx ? chan(() => ctx.moTaiSan(id)) : undefined}>
      {ten ? `${ten} (${id})` : id}
    </span>
  );
}

/** Ten vat tu bam mo ho so vat tu. */
export function VtLink({ id, ten }: { id?: string | null; ten?: string | null }) {
  const ctx = useContext(ChiTietCtx);
  if (!id) return <span className="muted">-</span>;
  if (!ctx) return <span>{ten ?? id}</span>;
  return (
    <button type="button" className="so-link" title={t("Mở hồ sơ vật tư")} onClick={chan(() => ctx.moVatTu(id))}>
      {ten ?? id}
    </button>
  );
}
