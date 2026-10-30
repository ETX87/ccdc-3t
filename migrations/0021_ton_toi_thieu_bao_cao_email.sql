-- 0021: Ton kho toi thieu (vat tu tieu hao + TSCD theo dong hang) + bao cao email dinh ky (2026-10-30).
--
-- Ton toi thieu so voi TONG ton cua cong ty (moi kho tinh ton + hang dang chuyen toi kho tinh ton), KHONG theo tung kho
-- (file "TON KHO TOI THIEU.xlsx" cua user: 1 muc / mat hang / cong ty). NULL / 0 = khong quy dinh, chi theo doi nhu cau.

ALTER TABLE vt_tieu_hao ADD COLUMN ton_toi_thieu REAL;
-- Thoi gian / ghi chu dat hang (vd "Thoi gian dat hang 1-2 tuan") - hien canh muc can dat de nguoi doc bao cao biet
-- phai dat truoc bao lau.
ALTER TABLE vt_tieu_hao ADD COLUMN thoi_gian_dat_hang TEXT;

-- TSCD khong co bang "dong hang": dong hang = cac TS cung TEN trong 1 cong ty (cung quy tac sinh ma TS - trim, gop
-- khoang trang, khong phan biet hoa/thuong, GIU dau). khoa = ten da chuan hoa (so khop o JS - LOWER() cua SQLite chi
-- xu ly ASCII). Ton = so TS "Trong kho", tinh trang khac Hong, trong kho tinh ton cua cong ty.
CREATE TABLE ts_ton_toi_thieu (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    cong_ty_id          INTEGER NOT NULL REFERENCES cong_ty(id),
    ten_ts              TEXT NOT NULL,
    khoa                TEXT NOT NULL,
    ton_toi_thieu       INTEGER NOT NULL CHECK (ton_toi_thieu >= 0),
    thoi_gian_dat_hang  TEXT,
    nguoi_cap_nhat      TEXT,
    updated_at          TEXT NOT NULL,
    UNIQUE (cong_ty_id, khoa)
);

-- Tai khoan Gmail GUI bao cao (Admin ket noi OAuth, scope gmail.send) - rieng voi tai khoan Drive luu tep de co the
-- dung 1 hop thu khac. refresh_token ma hoa bang lib/secretBox.ts nhu google_drive_oauth.
CREATE TABLE gmail_oauth (
    id                  INTEGER PRIMARY KEY CHECK (id = 1),
    google_email        TEXT NOT NULL,
    refresh_token_enc   TEXT NOT NULL,
    authorized_by       TEXT,
    authorized_at       TEXT NOT NULL
);

-- Cau hinh bao cao email (1 dong). nguoi_nhan: JSON ["a@x.com", ...]; cong_ty_ids: JSON [1, 2] hoac NULL = moi cong ty.
-- tu_dong = 1: cron toi thu 5 (20h VN) tu gui.
CREATE TABLE bao_cao_email_cau_hinh (
    id                  INTEGER PRIMARY KEY CHECK (id = 1),
    nguoi_nhan          TEXT NOT NULL DEFAULT '[]',
    cong_ty_ids         TEXT,
    tu_dong             INTEGER NOT NULL DEFAULT 1,
    dinh_kem_excel      INTEGER NOT NULL DEFAULT 1,
    nguoi_cap_nhat      TEXT,
    updated_at          TEXT
);

CREATE TABLE bao_cao_email_log (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    thoi_gian           TEXT NOT NULL,
    kieu                TEXT NOT NULL CHECK (kieu IN ('Tu dong', 'Thu cong')),
    nguoi_gui           TEXT,
    nguoi_nhan          TEXT NOT NULL,
    tieu_de             TEXT,
    ket_qua             TEXT NOT NULL CHECK (ket_qua IN ('Thanh cong', 'Loi', 'Bo qua')),
    loi                 TEXT
);
CREATE INDEX idx_bao_cao_email_log_tg ON bao_cao_email_log(thoi_gian);
