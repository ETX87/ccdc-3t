import type { Context } from "hono";

// Phan trang phia server cho cac danh sach lon (2026-09-30: "moi table phai phan trang, co dinh so dong
// moi trang de khong lag web, khong lang phi luot doc D1"). Client gui ?page=N (tu 1) -> tra
// { rows, total, page, page_size } va chi doc dung 1 trang (LIMIT/OFFSET). Khong gui ?page -> route giu
// hanh vi cu (xuat Excel, danh sach chon trong form...).
export const KICH_THUOC_TRANG = 50;

export interface Trang {
  page: number;
  size: number;
}

export function docTrang(c: Context): Trang | null {
  const p = Number(c.req.query("page"));
  if (!Number.isInteger(p) || p < 1) return null;
  return { page: p, size: KICH_THUOC_TRANG };
}

/**
 * Chay dem + lay 1 trang trong CUNG 1 round-trip (db.batch). `dem` phai la cau COUNT(*) AS n voi cung
 * dieu kien loc nhung KHONG join/subquery thua (de dem chi quet bang chinh); `ds` la SELECT day du, chua
 * co LIMIT. Trang vuot qua cuoi -> tra rows rong + total that de client lui ve trang cuoi.
 */
export async function layTrang(
  db: D1Database,
  trang: Trang,
  dem: { sql: string; binds: unknown[] },
  ds: { sql: string; binds: unknown[] },
) {
  const [d, r] = await db.batch([
    db.prepare(dem.sql).bind(...dem.binds),
    db.prepare(`${ds.sql} LIMIT ? OFFSET ?`).bind(...ds.binds, trang.size, (trang.page - 1) * trang.size),
  ]);
  return {
    rows: r.results,
    total: Number((d.results[0] as { n?: number } | undefined)?.n ?? 0),
    page: trang.page,
    page_size: trang.size,
  };
}
