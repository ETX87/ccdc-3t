/**
 * Gio VN hien tai dang "YYYY-MM-DD HH:MM:SS", dung cho moi cot timestamp he thong tu sinh - port
 * nguyen ban tu vi-pham-app/linh-kien-app backend/src/lib/vnTime.ts, giu dung quy uoc chung ca he
 * QLBH 3T.
 */
export function nowVN(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
}

export function todayVN(): string {
  return nowVN().slice(0, 10);
}

export function formatVNFromMs(ms: number): string {
  return new Date(ms + 7 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
}
