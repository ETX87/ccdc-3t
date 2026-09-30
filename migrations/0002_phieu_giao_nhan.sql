-- Migration 0002: phieu giao nhan (cap phat / thu hoi / dieu chuyen CCDC). Gop 3 loai giao dich
-- vao 1 bang header (phan biet qua loai_phieu) vi ca 3 deu la "1 lan giao/nhan CCDC giua 2 ben",
-- chi khac nhau ben giao/ben nhan la nhan vien hay kho - dung 1 bang giup lay lich su 1 CCDC don
-- gian (khong phai UNION nhieu bang).

CREATE TABLE phieu_giao_nhan (
    id                      TEXT PRIMARY KEY,
    loai_phieu              TEXT NOT NULL CHECK (loai_phieu IN ('Cap phat', 'Thu hoi', 'Dieu chuyen')),
    nhan_vien_id            TEXT NOT NULL REFERENCES nhan_vien(ma_nv),
    -- Chi dung khi loai_phieu = 'Dieu chuyen' (nguoi nhan moi) - null cho Cap phat/Thu hoi.
    nhan_vien_nhan_moi_id   TEXT REFERENCES nhan_vien(ma_nv),
    nguoi_lap               TEXT NOT NULL REFERENCES users(email),
    ngay_lap                TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu                 TEXT,
    -- Xac nhan dien tu cua nhan_vien_id (hoac nguoi nhan moi neu Dieu chuyen) - true = da bam xac
    -- nhan tren XacNhanNhanScreen. Phieu van co hieu luc cap nhat trang thai CCDC ngay khi tao,
    -- xac nhan chi la buoc ghi nhan bo sung (xem quyet dinh thiet ke, khong chan nghiep vu).
    da_xac_nhan             INTEGER NOT NULL DEFAULT 0,
    xac_nhan_luc            TEXT,
    created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pgn_nhan_vien ON phieu_giao_nhan(nhan_vien_id);

CREATE TABLE phieu_giao_nhan_ct (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    phieu_id                TEXT NOT NULL REFERENCES phieu_giao_nhan(id),
    ccdc_id                 TEXT NOT NULL REFERENCES ccdc(id),
    tinh_trang_ghi_nhan     TEXT,
    ghi_chu                 TEXT
);
-- Truy van chinh: lich su giao dich cua 1 CCDC (ChiTietCcdcScreen), danh sach CCDC trong 1 phieu.
CREATE INDEX idx_pgnct_phieu ON phieu_giao_nhan_ct(phieu_id);
CREATE INDEX idx_pgnct_ccdc ON phieu_giao_nhan_ct(ccdc_id);
