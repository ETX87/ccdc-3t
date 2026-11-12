// Nhan cong ty gan truoc ten kho / nhan vien KHI HIEN THI (user yeu cau 2026-11-12: nhieu nhan su lam o nhieu cong ty,
// de nham kho / nguoi cung ten giua cac cong ty). Chi dung trong SELECT tra ve de hien thi (bang, o chon, Excel, email) -
// KHONG dung cho WHERE / so khop ten / gia tri ghi nguoc vao DB (ten goc van la cot ten_kho / ten_nv).
//   Kho:       "[3T] Kho tong HCNS"
//   Nhan vien: "[3T·NSKX] Nguyen Van A" - cong ty chinh truoc, sau do cac cong ty kiem nhiem.
// Bang alias NULL (LEFT JOIN khong khop) -> ca bieu thuc NULL, nen dung duoc trong COALESCE(...) nhu ten goc.

/** SQL: ten kho kem ma cong ty. `a` = alias bang kho (co cot ten_kho, cong_ty_id). */
export const TEN_KHO = (a: string) =>
  `('[' || (SELECT ma FROM cong_ty WHERE id = ${a}.cong_ty_id) || '] ' || ${a}.ten_kho)`;

/** SQL: chuoi ma cong ty cua nhan vien ("3T", "3T·NSKX"). `a` = alias bang nhan_vien. */
export const MA_CT_NV = (a: string) =>
  `((SELECT ma FROM cong_ty WHERE id = ${a}.cong_ty_id) || COALESCE((SELECT '·' || group_concat(ct.ma, '·') FROM nhan_vien_cong_ty x
     JOIN cong_ty ct ON ct.id = x.cong_ty_id WHERE x.ma_nv = ${a}.ma_nv AND x.cong_ty_id != ${a}.cong_ty_id), ''))`;

/** SQL: ten nhan vien kem ma cong ty. `a` = alias bang nhan_vien. */
export const TEN_NV = (a: string) => `('[' || ${MA_CT_NV(a)} || '] ' || ${a}.ten_nv)`;

/** Bo nhan "[..] " dau chuoi (vd ten kho dan tu file Excel xuat ra) de so khop voi ten goc. */
export const boNhanCongTy = (s: string) => s.replace(/^\s*\[[^\]]*\]\s*/, "");
