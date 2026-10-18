// Nhan vien thuoc NHIEU cong ty (migration 0019): nhan_vien.cong_ty_id = cong ty chinh, nhan_vien_cong_ty = kiem nhiem.
// Moi kiem "nhan vien thuoc cong ty X" di qua day / view v_nv_cong_ty - KHONG so nhan_vien.cong_ty_id truc tiep.

/** Dieu kien SQL "ma_nv (cot `cot`) thuoc 1 trong cac cong ty (json mang id, 1 bind)". */
export const NV_THUOC_CT = (cot: string) => `${cot} IN (SELECT ma_nv FROM v_nv_cong_ty WHERE cong_ty_id IN (SELECT value FROM json_each(?)))`;

/** Cac cong ty cua nhan vien (chinh truoc). Rong = khong co ho so. */
export async function congTyCuaNv(db: D1Database, maNv: string): Promise<number[]> {
  const { results } = await db
    .prepare(
      `SELECT cong_ty_id FROM nhan_vien WHERE ma_nv = ?1
       UNION ALL SELECT cong_ty_id FROM nhan_vien_cong_ty WHERE ma_nv = ?1 AND cong_ty_id <> (SELECT cong_ty_id FROM nhan_vien WHERE ma_nv = ?1)`,
    )
    .bind(maNv)
    .all<{ cong_ty_id: number }>();
  return results.map((r) => r.cong_ty_id);
}

export async function nvThuocCongTy(db: D1Database, maNv: string, congTyId: number): Promise<boolean> {
  return !!(await db.prepare("SELECT 1 FROM v_nv_cong_ty WHERE ma_nv = ? AND cong_ty_id = ?").bind(maNv, congTyId).first());
}

/**
 * Dam bao QL co kho QL o MOI cong ty (chinh / kiem nhiem) ma QL co it nhat 1 cap duoi dang lam viec thuoc cong ty do.
 * Kho o cong ty kiem nhiem dat ten "Kho QL - <ten> (<ma cong ty>)". Idempotent; khong co cap duoi -> khong tao gi
 * (goi an toan sau moi lan sua nhan vien - cap duoi ghi TRUOC trong cung batch duoc tinh).
 */
export function lenhTaoKhoQl(db: D1Database, qlMaNv: string, now: string): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO kho (ten_kho, loai, nhan_vien_id, cong_ty_id, created_at, updated_at)
       SELECT 'Kho QL - ' || nv.ten_nv || CASE WHEN m.cong_ty_id = nv.cong_ty_id THEN '' ELSE ' (' || ct.ma || ')' END,
              'Quan ly', nv.ma_nv, m.cong_ty_id, ?2, ?2
       FROM nhan_vien nv JOIN v_nv_cong_ty m ON m.ma_nv = nv.ma_nv JOIN cong_ty ct ON ct.id = m.cong_ty_id
       WHERE nv.ma_nv = ?1 AND EXISTS (
         SELECT 1 FROM nhan_vien d JOIN v_nv_cong_ty dm ON dm.ma_nv = d.ma_nv
         WHERE d.quan_ly_id = nv.ma_nv AND d.dang_lam_viec = 1 AND dm.cong_ty_id = m.cong_ty_id)
       ON CONFLICT(nhan_vien_id, cong_ty_id) DO NOTHING`,
    )
    .bind(qlMaNv, now);
}
