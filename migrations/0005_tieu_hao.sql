-- Migration 0005: CCDC tieu hao (vat tu tieu hao theo so luong nhap/xuat/ton, KHAC hoan toan mo
-- hinh per-unit cua "ccdc" - xem phan tich du lieu cu muc 0/4.8 trong ke hoach trien khai). Ton kho
-- KHONG denormalize - tinh dong bang SUM(nhap) - SUM(xuat) da duyet tai thoi diem truy van bao cao
-- (bai hoc tu nguon cu: cot "Tong ton hien tai" denormalized khong dang tin).

CREATE TABLE vt_tieu_hao (
    id                  TEXT PRIMARY KEY,
    ten_vt              TEXT NOT NULL,
    nhom_id             INTEGER REFERENCES nhom_ccdc(id),
    don_vi_tinh         TEXT,
    don_gia_tham_khao   REAL,
    vo_hieu_hoa         INTEGER NOT NULL DEFAULT 0,
    nguoi_tao           TEXT NOT NULL REFERENCES users(email),
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Moi dong = 1 giao dich Nhap/Xuat, workflow duyet 2 cap (Quan ly -> Ke toan) dung nguyen theo
-- nghiep vu that dang van hanh (khong don gian hoa - xem quyet dinh thiet ke #10).
CREATE TABLE phieu_tieu_hao (
    id                      TEXT PRIMARY KEY,
    loai                    TEXT NOT NULL CHECK (loai IN ('Nhap', 'Xuat')),
    vt_id                   TEXT NOT NULL REFERENCES vt_tieu_hao(id),
    so_luong                REAL NOT NULL,
    don_gia                 REAL,
    thanh_tien              REAL,
    -- Nguon nhap/noi xuat, text tu do - KHONG ep FK nhan_vien vi nguon co the la nha cung cap.
    tu_dau                  TEXT,
    -- Nguoi nhan (chi dung khi loai='Xuat') - uu tien FK nhan_vien, fallback text tu do cho nguoi
    -- nhan KHONG co trong danh ba noi bo (vd mang luoi KTV/CTV hien truong - quyet dinh giu nguyen
    -- text, khong ep gan FK, xem phan tich du lieu cu).
    nhan_vien_nhan_id       TEXT REFERENCES nhan_vien(ma_nv),
    nguoi_nhan_ten_tu_do    TEXT,
    nguoi_de_xuat           TEXT NOT NULL REFERENCES users(email),
    trang_thai              TEXT NOT NULL DEFAULT 'Cho quan ly xac nhan' CHECK (trang_thai IN (
        'Cho quan ly xac nhan', 'Quan ly da xac nhan', 'Quan ly da tu choi',
        'Cho ke toan xac nhan', 'Ke toan da xac nhan', 'Ke toan da tu choi'
    )),
    anh_url                 TEXT,
    ghi_chu                 TEXT,
    created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pth_trang_thai ON phieu_tieu_hao(trang_thai);
CREATE INDEX idx_pth_vt ON phieu_tieu_hao(vt_id);

CREATE TABLE phieu_tieu_hao_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    phieu_id        TEXT NOT NULL REFERENCES phieu_tieu_hao(id),
    trang_thai      TEXT NOT NULL,
    nguoi_xu_ly     TEXT NOT NULL REFERENCES users(email),
    ngay_xu_ly      TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu         TEXT
);
CREATE INDEX idx_pthl_phieu ON phieu_tieu_hao_log(phieu_id);
