-- Migration 0011: doi ma / gop ho so nhan vien an toan (user chot 2026-10-01: "1 nhan su tren he thong chi
-- co 1 tai khoan, du phong sau nay doi ma tu ma sai sang ma chuan ma khong anh huong ton kho thuc te, cho
-- phep doi ma ETX chuan, doi ten"). Chi THEM bang moi - an toan voi du lieu that.

-- Danh ba ETX DAY DU (ca nguoi da nghi) - sync hang ngay ghi diff vao day (lib/etxNhanSuSync.ts). Truoc
-- day CCDC chi giu nguoi ETX dang lam + nguoi da co ho so -> khong tra duoc ma ETX cua nguoi da nghi.
-- Dung de tra cuu / kiem tra "Gan ma ETX chuan" tai cho, khong ton luot goi API ETX.
CREATE TABLE etx_nhan_su (
    ma_nhan_su          TEXT PRIMARY KEY,
    ho_ten              TEXT NOT NULL,
    chuc_danh           TEXT,
    gmail               TEXT,
    trang_thai_lam_viec TEXT NOT NULL,
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Nhat ky doi ma / gop / gan ma ETX (lib/gopNhanVien.ts): ma cu van tra ra duoc ho so moi, biet ai lam,
-- chuyen bao nhieu tai san / phieu / kho.
CREATE TABLE nhan_vien_lich_su_ma (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    thao_tac        TEXT NOT NULL CHECK (thao_tac IN ('Gop ho so', 'Doi ma', 'Gan ma ETX')),
    ma_nguon        TEXT NOT NULL,
    ten_nguon       TEXT,
    ma_dich         TEXT NOT NULL,
    ma_etx          TEXT,
    chi_tiet        TEXT,
    nguoi_thuc_hien TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_nv_lich_su_ma_nguon ON nhan_vien_lich_su_ma(ma_nguon);
CREATE INDEX idx_nv_lich_su_ma_dich ON nhan_vien_lich_su_ma(ma_dich);
