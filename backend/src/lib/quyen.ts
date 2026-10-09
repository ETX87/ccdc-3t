import type { AppUser } from "../types";

// Kiem tra quyen dung chung moi route (ke hoach Giai doan 1.5 muc 1). MOI POST thao tac kho/nhom
// PHAI kiem tra lai o server qua cac ham nay - KHONG tin kho_id/ma_nv client gui len (vd 1 QL gui
// tu_kho_id cua kho HCNS, hoac xuat cho nguoi ngoai nhom = IDOR).

export type LoaiKho = "Mua hang" | "HCNS" | "Mien" | "Quan ly" | "Tieu hao";
/** Kho TINH TON (khong phai kho mua hang - nguon ao, hay kho tieu hao - diem tieu dung cua van phong). */
export const KHO_TON_SQL = "NOT IN ('Mua hang', 'Tieu hao')";
export const laKhoTon = (loai: LoaiKho) => loai !== "Mua hang" && loai !== "Tieu hao";

export interface KhoRow {
  id: number;
  ten_kho: string;
  loai: LoaiKho;
  nhan_vien_id: string | null;
  bat_tat: number;
  cong_ty_id: number;
}

export async function getKho(db: D1Database, id: number): Promise<KhoRow | null> {
  return db.prepare("SELECT id, ten_kho, loai, nhan_vien_id, bat_tat, cong_ty_id FROM kho WHERE id = ?").bind(id).first<KhoRow>();
}

/** Tai khoan duoc thao tac cong ty nay (da phap nhan - migration 0014). */
export function coCongTy(user: AppUser, congTyId: number | null | undefined): boolean {
  return congTyId != null && user.cong_ty_ids.includes(congTyId);
}

/** Cong ty cho ban ghi MOI: gui len (cong_ty_id) hoac cong ty duy nhat dang xem. null = chua chon / ngoai quyen. */
export function congTyTao(user: AppUser, guiLen?: number | string | null): number | null {
  const id = Number(guiLen || (user.cong_ty_xem.length === 1 ? user.cong_ty_xem[0] : 0));
  return id && coCongTy(user, id) ? id : null;
}

/** Cong ty de LOC danh muc (?cong_ty_id= cua form dang chon cong ty, neu duoc phep) - mac dinh cac cong ty dang xem. */
export function congTyLoc(user: AppUser, query?: string | null): number[] {
  const id = Number(query || 0);
  return id && coCongTy(user, id) ? [id] : user.cong_ty_xem;
}

// Vai tro toan quyen (KT / HCNS) chi co hieu luc TRONG cac cong ty duoc gan: truyen congTyId cua ban ghi
// dang thao tac de kiem them cong ty (bo trong = chi kiem vai tro).
export function laKeToan(user: AppUser, congTyId?: number | null): boolean {
  return (user.vai_tro === "Admin" || user.vai_tro === "Ke toan") && (congTyId === undefined || coCongTy(user, congTyId));
}

export function laHcns(user: AppUser, congTyId?: number | null): boolean {
  return (user.vai_tro === "Admin" || user.vai_tro === "HCNS") && (congTyId === undefined || coCongTy(user, congTyId));
}

// Cac kho user duoc THAO TAC (xuat hang di / xac nhan nhan vao):
//   CHI trong cac cong ty tai khoan duoc phep (user.cong_ty_ids).
//   - Admin: moi kho dang hoat dong.
//   - HCNS: moi kho loai 'HCNS' + 'Mua hang' (lap phieu nhap mua) - khong can gan tay.
//   - Thu kho duoc gan (kho_thu_kho) - doc lap vai tro.
//   - Nguoi phu trach kho: kho co nhan_vien_id = ho so nhan vien cua chinh ho (kho QL, hoac kho QL da
//     doi thanh kho Mien - POST /kho/:id/doi-loai - van giu nguoi phu trach).
export async function khoPhuTrach(db: D1Database, user: AppUser): Promise<KhoRow[]> {
  const congTy = JSON.stringify(user.cong_ty_ids);
  const cot = "id, ten_kho, loai, nhan_vien_id, bat_tat, cong_ty_id";
  if (user.vai_tro === "Admin") {
    const { results } = await db
      .prepare(`SELECT ${cot} FROM kho WHERE bat_tat = 1 AND cong_ty_id IN (SELECT value FROM json_each(?)) ORDER BY id`)
      .bind(congTy)
      .all<KhoRow>();
    return results;
  }
  const { results } = await db
    .prepare(
      `SELECT ${cot} FROM kho
       WHERE bat_tat = 1 AND cong_ty_id IN (SELECT value FROM json_each(?)) AND (
         id IN (SELECT kho_id FROM kho_thu_kho WHERE email = ?)
         OR (nhan_vien_id IS NOT NULL AND nhan_vien_id = ?)
         OR (? = 1 AND loai IN ('HCNS', 'Mua hang'))
       )
       ORDER BY id`,
    )
    .bind(congTy, user.email, user.ma_nv ?? "", user.vai_tro === "HCNS" ? 1 : 0)
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
