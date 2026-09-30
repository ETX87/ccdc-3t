// Ma phieu de doc: <TIEN_TO>-<YYMM>-<so 4 chu so> (vd NM-2609-0001), xem migration 0008.
// Tra ve 2 lenh de NOI VAO CUNG db.batch() voi lenh INSERT phieu (dat SAU lenh INSERT): tang bo dem
// theo (tien_to, thang) roi gan ma cho phieu. D1 chay batch tuan tu trong 1 transaction -> 2 phieu tao
// dong thoi khong the nhan trung so, va loi giua chung thi ca phieu lan bo dem deu rollback.

export type BangPhieu = "phieu_chuyen_kho" | "phieu_giao_nhan" | "phieu_xu_ly_ts" | "dot_kiem_ke";

export const TIEN_TO_CHUYEN_KHO: Record<string, string> = { "Nhap mua": "NM", "Chuyen kho": "CK", "Cap phat NV": "CP" };
export const TIEN_TO_XU_LY: Record<string, string> = { "Nhap mua": "NT", "Bao hong": "BH", "Thanh ly": "TL", "Tieu huy": "TH" };

/** `ngay` dang 'YYYY-MM-DD HH:MM:SS' (nowVN()). */
export function sinhMaPhieu(db: D1Database, bang: BangPhieu, id: string, tienTo: string, ngay: string): D1PreparedStatement[] {
  const thang = ngay.slice(2, 4) + ngay.slice(5, 7);
  return [
    db
      .prepare(
        `INSERT INTO ma_phieu_seq (tien_to, thang, so) VALUES (?, ?, 1)
         ON CONFLICT(tien_to, thang) DO UPDATE SET so = so + 1`,
      )
      .bind(tienTo, thang),
    db
      .prepare(
        `UPDATE ${bang} SET ma_phieu = ? || '-' || ? || '-' ||
           (SELECT printf('%04d', so) FROM ma_phieu_seq WHERE tien_to = ? AND thang = ?)
         WHERE id = ?`,
      )
      .bind(tienTo, thang, tienTo, thang, id),
  ];
}
