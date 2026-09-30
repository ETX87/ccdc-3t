// Dinh dang so / tien / ngay gio dung chung (hien thi kieu Viet Nam: 1.286 - 8,42 tỷ - 24/09/2026 10:24).

export function fmtSo(v: number | null | undefined, soLe = 0): string {
  if (v == null || Number.isNaN(v)) return "0";
  return v.toLocaleString("vi-VN", { maximumFractionDigits: soLe });
}

/** Gia tri tien rut gon: 8,42 tỷ / 126,5 triệu / 950.000đ. */
export function fmtGiaTri(v: number | null | undefined): string {
  const n = v ?? 0;
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${fmtSo(n / 1e9, 2)} tỷ`;
  if (abs >= 1e6) return `${fmtSo(n / 1e6, 1)} triệu`;
  return `${fmtSo(n)}đ`;
}

/** "Giá trị: 8,42 tỷ đồng" (the KPI). */
export function fmtGiaTriDong(v: number | null | undefined): string {
  const s = fmtGiaTri(v);
  return s.endsWith("đ") ? s : `${s} đồng`;
}

/** 'YYYY-MM-DD[ HH:MM[:SS]]' -> 'DD/MM/YYYY[ HH:MM]'. */
export function fmtNgayGio(s: string | null | undefined, coGio = true): string {
  if (!s) return "-";
  const [d, t] = s.split(" ");
  const [y, m, dd] = d.split("-");
  if (!dd) return s;
  const ngay = `${dd}/${m}/${y}`;
  return coGio && t && t !== "00:00:00" ? `${ngay} ${t.slice(0, 5)}` : ngay;
}

export const fmtNgay = (s: string | null | undefined) => fmtNgayGio(s, false);

/** 'YYYY-MM' -> 'MM/YYYY'. */
export function fmtThang(s: string): string {
  const [y, m] = s.split("-");
  return `${m}/${y}`;
}

/** Ngay hom nay gio VN dang 'YYYY-MM-DD'. */
export function homNayVN(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}
