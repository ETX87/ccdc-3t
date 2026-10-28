-- Ai them nhan vien vao cong ty kiem nhiem (2026-10-28): ngoai HCNS/Admin, thu kho kho HCNS / Mien / Trung chuyen / QL
-- duoc chon nhan vien cong ty khac de chuyen giao tai san -> he thong tu them kiem nhiem cong ty cua kho, can dau vet.
ALTER TABLE nhan_vien_cong_ty ADD COLUMN nguoi_them TEXT;
