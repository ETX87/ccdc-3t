-- Migration 0003: dot kiem ke (stocktake). Kiem ke CHI ghi nhan chenh lech thuc te so voi du lieu
-- he thong, KHONG tu dong sua ccdc.trang_thai_hien_tai/nguoi_dang_giu (xem quyet dinh thiet ke muc
-- 7.2) - muon sua phai tao phieu_giao_nhan dieu chinh rieng, giu nguyen tac "1 thay doi trang thai
-- = 1 phieu co nguoi chiu trach nhiem".

CREATE TABLE dot_kiem_ke (
    id              TEXT PRIMARY KEY,
    ten_dot         TEXT NOT NULL,
    ngay_bat_dau    TEXT NOT NULL,
    ngay_ket_thuc   TEXT,
    trang_thai      TEXT NOT NULL DEFAULT 'Dang thuc hien' CHECK (trang_thai IN ('Dang thuc hien', 'Da hoan tat')),
    nguoi_tao       TEXT NOT NULL REFERENCES users(email),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE kiem_ke_ct (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    dot_kiem_ke_id              TEXT NOT NULL REFERENCES dot_kiem_ke(id),
    ccdc_id                     TEXT NOT NULL REFERENCES ccdc(id),
    tinh_trang_thuc_te          TEXT NOT NULL CHECK (tinh_trang_thuc_te IN ('Dung vi tri', 'Thieu', 'Thua', 'Hong', 'Sai nguoi giu')),
    nguoi_dang_giu_thuc_te      TEXT REFERENCES nhan_vien(ma_nv),
    ghi_chu                     TEXT,
    nguoi_kiem_ke               TEXT NOT NULL REFERENCES users(email),
    kiem_ke_luc                 TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_kkct_dot ON kiem_ke_ct(dot_kiem_ke_id);
CREATE INDEX idx_kkct_ccdc ON kiem_ke_ct(ccdc_id);
