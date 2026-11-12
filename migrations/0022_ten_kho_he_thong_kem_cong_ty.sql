-- Kho he thong (Mua hang / HCNS) cua cong ty mac dinh 3T duoc tao truoc khi co da cong ty nen ten chua kem ma cong ty
-- ("Kho tong HCNS", "Kho mua hang") -> de nham voi kho cung loai cua cong ty khac. Them hau to " - <ma cong ty>" giong
-- kho tao tu man Cong ty (routes/congTy.ts). Chi doi ten con dung nguyen ten goc (khong ghi de ten da sua tay).
UPDATE kho
SET ten_kho = ten_kho || ' - ' || (SELECT ma FROM cong_ty WHERE cong_ty.id = kho.cong_ty_id),
    updated_at = datetime('now', '+7 hours')
WHERE (loai = 'HCNS' AND ten_kho = 'Kho tổng HCNS')
   OR (loai = 'Mua hang' AND ten_kho = 'Kho mua hàng');
