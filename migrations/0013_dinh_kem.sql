-- Migration 0013: dinh kem hoa don / chung tu / anh bang chung len Google Drive (user yeu cau 2026-10-02,
-- port co che Drive OAuth tu vi-pham-app - skill qlbh3t-cf-integrations phan 1).
--
-- google_drive_oauth: 1 dong duy nhat (id = 1) - tai khoan Google THAT do Admin uy quyen (khong dung
-- Service Account vi khong co dung luong Drive). refresh_token ma hoa AES-GCM (lib/secretBox.ts).
CREATE TABLE google_drive_oauth (
    id                  INTEGER PRIMARY KEY CHECK (id = 1),
    google_email        TEXT NOT NULL,
    refresh_token_enc   TEXT NOT NULL,
    folder_id           TEXT NOT NULL,
    authorized_by       TEXT REFERENCES users(email),
    authorized_at       TEXT NOT NULL
);

-- dinh_kem: tep gan voi 1 phieu hoac 1 tai san. doi_tuong_id = id phieu (khong phai ma_phieu) / id tai san.
-- KHONG xoa that (chung tu ke toan): da_xoa = 1 + nguoi/thoi diem xoa; tep tren Drive giu nguyen.
CREATE TABLE dinh_kem (
    id              TEXT PRIMARY KEY,
    doi_tuong       TEXT NOT NULL CHECK (doi_tuong IN ('chuyen_kho', 'giao_nhan', 'xu_ly', 'tai_san')),
    doi_tuong_id    TEXT NOT NULL,
    loai            TEXT NOT NULL CHECK (loai IN ('Hoa don', 'Chung tu', 'Bang chung', 'Khac')),
    drive_file_id   TEXT NOT NULL,
    ten_file        TEXT NOT NULL,
    mime            TEXT NOT NULL,
    kich_thuoc      INTEGER NOT NULL,
    ghi_chu         TEXT,
    nguoi_tai       TEXT NOT NULL REFERENCES users(email),
    created_at      TEXT NOT NULL,
    da_xoa          INTEGER NOT NULL DEFAULT 0,
    nguoi_xoa       TEXT REFERENCES users(email),
    xoa_luc         TEXT
);
CREATE INDEX idx_dinh_kem_doi_tuong ON dinh_kem (doi_tuong, doi_tuong_id);
