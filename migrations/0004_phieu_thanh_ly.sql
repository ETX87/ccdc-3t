-- Migration 0004: phieu thanh ly (de xuat -> duyet -> hoan tat). Log append-only rieng
-- (phieu_thanh_ly_log) giong pattern dat_don_hang_log cua linh-kien-app - moi lan doi trang_thai la
-- 1 dong log co nguoi chiu trach nhiem, khong sua de len trang_thai cu.

CREATE TABLE phieu_thanh_ly (
    id                  TEXT PRIMARY KEY,
    ly_do               TEXT NOT NULL,
    ngay_de_xuat        TEXT NOT NULL DEFAULT (datetime('now')),
    nguoi_de_xuat       TEXT NOT NULL REFERENCES users(email),
    trang_thai          TEXT NOT NULL DEFAULT 'Cho duyet' CHECK (trang_thai IN ('Cho duyet', 'Da duyet', 'Tu choi', 'Da thanh ly')),
    gia_tri_thu_hoi     REAL,
    ghi_chu             TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE phieu_thanh_ly_ct (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    phieu_id    TEXT NOT NULL REFERENCES phieu_thanh_ly(id),
    ccdc_id     TEXT NOT NULL REFERENCES ccdc(id)
);
CREATE INDEX idx_ptlct_phieu ON phieu_thanh_ly_ct(phieu_id);
CREATE INDEX idx_ptlct_ccdc ON phieu_thanh_ly_ct(ccdc_id);

CREATE TABLE phieu_thanh_ly_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    phieu_id        TEXT NOT NULL REFERENCES phieu_thanh_ly(id),
    trang_thai      TEXT NOT NULL CHECK (trang_thai IN ('Cho duyet', 'Da duyet', 'Tu choi', 'Da thanh ly')),
    nguoi_xu_ly     TEXT NOT NULL REFERENCES users(email),
    ngay_xu_ly      TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu         TEXT
);
CREATE INDEX idx_ptll_phieu ON phieu_thanh_ly_log(phieu_id);
