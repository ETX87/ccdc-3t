-- Migration 0009: dong bo ETX hang ngay + tu tao/duyet tai khoan (lib/etxTuDongTaiKhoan.ts, user chot
-- 2026-09-30). Chi THEM cot (an toan voi du lieu that): so tai khoan tu tao/duyet/lien ket o lan dong
-- bo gan nhat, de NhanVienScreen hien cung trang thai dong bo.
ALTER TABLE etx_sync_state ADD COLUMN tai_khoan_count INTEGER NOT NULL DEFAULT 0;
