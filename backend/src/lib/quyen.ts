import type { AppUser } from "../types";

// Kiem tra quyen dung chung moi route (ke hoach Giai doan 1.5 muc 1). MOI POST thao tac kho/nhom
// PHAI kiem tra lai o server qua cac ham nay - KHONG tin kho_id/ma_nv client gui len (vd 1 QL gui
// tu_kho_id cua kho HCNS, hoac xuat cho nguoi ngoai nhom = IDOR).

export type LoaiKho = "Mua hang" | "HCNS" | "Mien" | "Quan ly";

export interface KhoRow {
  id: number;
  ten_kho: string;
  loai: LoaiKho;
  nhan_vien_id: string | null;
  bat_tat: number;
}

export async function getKho(db: D1Database, id: number): Promise<KhoRow | null> {
  return db.prepare("SELECT id, ten_kho, loai, nhan_vien_id, bat_tat FROM kho WHERE id = ?").bind(id).first<KhoRow>();
}

export function laKeToan(user: AppUser): boolean {
  return user.vai_tro === "Admin" || user.vai_tro === "Ke toan";
}

export function laHcns(user: AppUser): boolean {
  return user.vai_tro === "Admin" || user.vai_tro === "HCNS";
}

// Cac kho user duoc THAO TAC (xuat hang di / xac nhan nhan vao):
//   - Admin: moi kho dang hoat dong.
//   - HCNS: moi kho loai 'HCNS' + 'Mua hang' (lap phieu nhap mua) - khong can gan tay.
//   - Thu kho duoc gan (kho_thu_kho) - doc lap vai tro.
//   - QL: kho loai 'Quan ly' co nhan_vien_id = ho so nhan vien cua chinh ho.
export async function khoPhuTrach(db: D1Database, user: AppUser): Promise<KhoRow[]> {
  if (user.vai_tro === "Admin") {
    const { results } = await db.prepare("SELECT id, ten_kho, loai, nhan_vien_id, bat_tat FROM kho WHERE bat_tat = 1 ORDER BY id").all<KhoRow>();
    return results;
  }
  const { results } = await db
    .prepare(
      `SELECT id, ten_kho, loai, nhan_vien_id, bat_tat FROM kho
       WHERE bat_tat = 1 AND (
         id IN (SELECT kho_id FROM kho_thu_kho WHERE email = ?)
         OR (loai = 'Quan ly' AND nhan_vien_id IS NOT NULL AND nhan_vien_id = ?)
         OR (? = 1 AND loai IN ('HCNS', 'Mua hang'))
       )
       ORDER BY id`,
    )
    .bind(user.email, user.ma_nv ?? "", user.vai_tro === "HCNS" ? 1 : 0)
    .all<KhoRow>();
  return results;
}

export async function laThuKho(db: D1Database, user: AppUser, khoId: number): Promise<boolean> {
  const ds = await khoPhuTrach(db, user);
  return ds.some((k) => k.id === khoId);
}

// maNv co phai cap duoi TRUC TIEP cua qlMaNv khong (khong de quy nhieu cap - dung pham vi user
// mo ta "nhan vien cap duoi do minh phu trach").
export async function laCapDuoi(db: D1Database, qlMaNv: string, maNv: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS ok FROM nhan_vien WHERE ma_nv = ? AND quan_ly_id = ? AND dang_lam_viec = 1")
    .bind(maNv, qlMaNv)
    .first();
  return !!row;
}

// Nhom cua QL = chinh QL + cap duoi truc tiep. Dung cho dieu chuyen TSCD noi bo nhom.
export async function trongNhom(db: D1Database, qlMaNv: string, maNv: string): Promise<boolean> {
  return maNv === qlMaNv || laCapDuoi(db, qlMaNv, maNv);
}

export async function tonKho(db: D1Database, khoId: number, vtId: string): Promise<number> {
  const row = await db.prepare("SELECT ton FROM v_ton_kho WHERE kho_id = ? AND vt_id = ?").bind(khoId, vtId).first<{ ton: number }>();
  return row?.ton ?? 0;
}

// 2 lenh "chot chan" gan cuoi db.batch(): neu sau khi ghi, ton cua bat ky vat tu nao trong phieu
// tai kho nguon bi am -> CHECK (x = 1) cua batch_guard loi -> D1 rollback TOAN BO batch. Chong xuat
// vuot ton khi 2 phieu lap dong thoi (kiem tra truoc roi ghi sau khong du an toan).
export function guardTonKhongAm(db: D1Database, khoId: number, vtIds: string[]): D1PreparedStatement[] {
  const ph = vtIds.map(() => "?").join(",");
  return [
    db
      .prepare(
        `INSERT INTO batch_guard (x)
         SELECT CASE WHEN EXISTS (SELECT 1 FROM v_ton_kho WHERE kho_id = ? AND vt_id IN (${ph}) AND ton < 0) THEN 0 ELSE 1 END`,
      )
      .bind(khoId, ...vtIds),
    db.prepare("DELETE FROM batch_guard"),
  ];
}
