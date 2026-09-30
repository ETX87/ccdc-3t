-- Migration 0001: khoi tao schema nen (auth + danh muc) cho ccdc-app ("CCDC 3T" - quan ly cong cu,
-- dung cu). Nhan ban kien truc vi-pham-app/linh-kien-app nhung app nay doc lap hoan toan, khong
-- Service Binding, khong bang partner. Cac bang nghiep vu giao nhan/kiem ke/thanh ly se them o
-- migration sau (0002+), theo dung trinh tu ke hoach trien khai Phase 1.

-- users: tai khoan dang nhap (Google OAuth). vai_tro rieng chi can phan biet Admin va "Quan ly
-- CCDC" - NULL = Nhan vien (mac dinh sau khi duoc duyet), dung convention y het vi-pham-app.
CREATE TABLE users (
    email               TEXT PRIMARY KEY,
    ten                 TEXT,
    vai_tro             TEXT CHECK (vai_tro IN ('Admin', 'Quan ly CCDC')),
    trang_thai_duyet    TEXT NOT NULL DEFAULT 'Cho duyet' CHECK (trang_thai_duyet IN ('Cho duyet', 'Da duyet', 'Tu choi')),
    bi_khoa             INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- nhan_vien: danh ba nguoi NHAN CCDC, tach khoi "users" vi khong phai ai nhan CCDC cung can tai
-- khoan dang nhap he thong (vd cong nhan hien truong). email_dang_nhap chi dien khi nguoi nay
-- CUNG LA 1 user co tai khoan (de tu xem CCDC minh dang giu qua XacNhanNhanScreen).
CREATE TABLE nhan_vien (
    ma_nv               TEXT PRIMARY KEY,
    ten_nv               TEXT NOT NULL,
    bo_phan             TEXT,
    chuc_vu             TEXT,
    sdt                 TEXT,
    email_dang_nhap     TEXT REFERENCES users(email),
    dang_lam_viec       INTEGER NOT NULL DEFAULT 1,
    ghi_chu             TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Truy van chinh: khop 1 user dang dang nhap voi ma_nv cua chinh ho (XacNhanNhanScreen).
CREATE INDEX idx_nhan_vien_email_dang_nhap ON nhan_vien(email_dang_nhap);

-- nhom_ccdc: phan nhom CCDC de loc/bao cao (vd "May moc cam tay", "Thiet bi do luong"...).
CREATE TABLE nhom_ccdc (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_nhom            TEXT NOT NULL,
    bat_tat             INTEGER NOT NULL DEFAULT 1,
    stt                 INTEGER NOT NULL DEFAULT 0
);

-- ccdc: bang tai san chinh. id la ma CCDC (nguoi dung tu dat hoac he thong goi y, KHONG dung UUID
-- de con de doc tren tem/khi doi chieu kiem ke giay). trang_thai_hien_tai + nguoi_dang_giu duoc
-- denormalize len day (nguon that la bang phieu_giao_nhan se them o migration 0002) de truy van
-- danh sach nhanh, khong phai JOIN lai lich su moi lan.
CREATE TABLE ccdc (
    id                      TEXT PRIMARY KEY,
    ten_ccdc                TEXT NOT NULL,
    nhom_id                 INTEGER REFERENCES nhom_ccdc(id),
    don_vi_tinh             TEXT,
    so_seri                 TEXT,
    ngay_mua                TEXT,
    nguyen_gia              REAL,
    nha_cung_cap            TEXT,
    han_bao_hanh            TEXT,
    tinh_trang              TEXT NOT NULL DEFAULT 'Tot' CHECK (tinh_trang IN ('Tot', 'Can bao tri', 'Hong')),
    trang_thai_hien_tai     TEXT NOT NULL DEFAULT 'Trong kho' CHECK (trang_thai_hien_tai IN (
        'Trong kho', 'Dang cap phat', 'Dang bao tri', 'Cho thanh ly', 'Da thanh ly'
    )),
    nguoi_dang_giu          TEXT REFERENCES nhan_vien(ma_nv),
    anh_url                 TEXT,
    ghi_chu                 TEXT,
    vo_hieu_hoa             INTEGER NOT NULL DEFAULT 0,
    nguoi_tao               TEXT REFERENCES users(email),
    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Truy van chinh: DanhMucCcdcScreen loc theo trang thai/nhom, BaoCaoScreen tong quan theo trang thai.
CREATE INDEX idx_ccdc_trang_thai ON ccdc(trang_thai_hien_tai);
CREATE INDEX idx_ccdc_nguoi_dang_giu ON ccdc(nguoi_dang_giu);
CREATE INDEX idx_ccdc_nhom ON ccdc(nhom_id);
