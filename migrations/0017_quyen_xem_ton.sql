-- 0017 (2026-10-13) - Quyen "Xem ton kho toan cong ty" (users.xem_ton = 1, Admin bat o Tai khoan & phan quyen): ngoai
-- chuc nang vai tro goc, tai khoan duoc XEM (chi doc) ton tieu hao moi kho, the kho, Kho & ton va danh muc TSCD cua cac
-- cong ty minh duoc phep (lib/phamVi.ts layPhamViXemTon). Khong them quyen lap / duyet / nhan phieu.
ALTER TABLE users ADD COLUMN xem_ton INTEGER NOT NULL DEFAULT 0;
