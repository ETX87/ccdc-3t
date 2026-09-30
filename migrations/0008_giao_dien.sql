-- Migration 0008: ho tro giao dien 3T Asset Management chay du lieu that (2026-09-24).
-- 1) Ma phieu de doc (ma_phieu) cho moi loai phieu + bang dem so thu tu theo tien to/thang.
-- 2) Anh dai dien Google cua user.
-- 3) Bang chup so lieu hang ngay (cron) de tinh "% so voi ky truoc" cho chi so ton (khong co lich su).
-- 4) Sua don gia nhap sai trong du lieu cu (user xac nhan 2026-09-24).

-- ---------- 1. Ma phieu ----------
-- Dinh dang: <TIEN_TO>-<YYMM>-<so 4 chu so>, vd NM-2609-0001. Tien to: NM nhap mua tieu hao, CK chuyen
-- kho, CP cap phat NV, GN giao nhan TSCD, NT nhap TSCD, BH bao hong, TL thanh ly, TH tieu huy, KK kiem ke.
-- Phieu import tu du lieu cu (id 'ID-xxxxxxxx') giu nguyen id lam ma. Sinh ma moi: lib/maPhieu.ts (cung
-- db.batch() voi lenh tao phieu -> nguyen tu, khong trung).
CREATE TABLE ma_phieu_seq (
    tien_to     TEXT NOT NULL,
    thang       TEXT NOT NULL,
    so          INTEGER NOT NULL,
    PRIMARY KEY (tien_to, thang)
);

ALTER TABLE phieu_chuyen_kho ADD COLUMN ma_phieu TEXT;
ALTER TABLE phieu_giao_nhan ADD COLUMN ma_phieu TEXT;
ALTER TABLE phieu_xu_ly_ts ADD COLUMN ma_phieu TEXT;
ALTER TABLE dot_kiem_ke ADD COLUMN ma_phieu TEXT;

UPDATE phieu_chuyen_kho SET ma_phieu = id WHERE id LIKE 'ID%';

UPDATE phieu_chuyen_kho SET ma_phieu = (
    SELECT x.ma FROM (
        SELECT id,
               (CASE loai WHEN 'Nhap mua' THEN 'NM' WHEN 'Chuyen kho' THEN 'CK' ELSE 'CP' END)
               || '-' || (substr(created_at, 3, 2) || substr(created_at, 6, 2)) || '-'
               || printf('%04d', ROW_NUMBER() OVER (PARTITION BY loai, (substr(created_at, 3, 2) || substr(created_at, 6, 2)) ORDER BY created_at, id)) AS ma
        FROM phieu_chuyen_kho WHERE id NOT LIKE 'ID%'
    ) x WHERE x.id = phieu_chuyen_kho.id
) WHERE ma_phieu IS NULL;

UPDATE phieu_giao_nhan SET ma_phieu = (
    SELECT x.ma FROM (
        SELECT id, 'GN-' || (substr(created_at, 3, 2) || substr(created_at, 6, 2)) || '-'
               || printf('%04d', ROW_NUMBER() OVER (PARTITION BY (substr(created_at, 3, 2) || substr(created_at, 6, 2)) ORDER BY created_at, id)) AS ma
        FROM phieu_giao_nhan
    ) x WHERE x.id = phieu_giao_nhan.id
) WHERE ma_phieu IS NULL;

UPDATE phieu_xu_ly_ts SET ma_phieu = (
    SELECT x.ma FROM (
        SELECT id,
               (CASE loai WHEN 'Nhap mua' THEN 'NT' WHEN 'Bao hong' THEN 'BH' WHEN 'Thanh ly' THEN 'TL' ELSE 'TH' END)
               || '-' || (substr(created_at, 3, 2) || substr(created_at, 6, 2)) || '-'
               || printf('%04d', ROW_NUMBER() OVER (PARTITION BY loai, (substr(created_at, 3, 2) || substr(created_at, 6, 2)) ORDER BY created_at, id)) AS ma
        FROM phieu_xu_ly_ts
    ) x WHERE x.id = phieu_xu_ly_ts.id
) WHERE ma_phieu IS NULL;

UPDATE dot_kiem_ke SET ma_phieu = (
    SELECT x.ma FROM (
        SELECT id, 'KK-' || (substr(created_at, 3, 2) || substr(created_at, 6, 2)) || '-'
               || printf('%04d', ROW_NUMBER() OVER (PARTITION BY (substr(created_at, 3, 2) || substr(created_at, 6, 2)) ORDER BY created_at, id)) AS ma
        FROM dot_kiem_ke
    ) x WHERE x.id = dot_kiem_ke.id
) WHERE ma_phieu IS NULL;

-- Bo dem tiep tuc sau so lon nhat da cap o tren.
INSERT INTO ma_phieu_seq (tien_to, thang, so)
SELECT substr(ma_phieu, 1, 2), substr(ma_phieu, 4, 4), MAX(CAST(substr(ma_phieu, 9) AS INTEGER))
FROM (
    SELECT ma_phieu FROM phieu_chuyen_kho WHERE ma_phieu NOT LIKE 'ID%'
    UNION ALL SELECT ma_phieu FROM phieu_giao_nhan
    UNION ALL SELECT ma_phieu FROM phieu_xu_ly_ts
    UNION ALL SELECT ma_phieu FROM dot_kiem_ke
) WHERE ma_phieu IS NOT NULL
GROUP BY 1, 2;

CREATE UNIQUE INDEX idx_pck_ma_phieu ON phieu_chuyen_kho(ma_phieu);
CREATE UNIQUE INDEX idx_pgn_ma_phieu ON phieu_giao_nhan(ma_phieu);
CREATE UNIQUE INDEX idx_pxl_ma_phieu ON phieu_xu_ly_ts(ma_phieu);
CREATE UNIQUE INDEX idx_dkk_ma_phieu ON dot_kiem_ke(ma_phieu);

-- ---------- 2. Anh dai dien ----------
ALTER TABLE users ADD COLUMN anh_dai_dien TEXT;

-- ---------- 3. Chup so lieu hang ngay ----------
-- pham_vi: 'all' (toan he thong) hoac 'kho:<id>'. chi_so: tong_ts, trong_kho_hcns, dang_su_dung, hong...
-- UPSERT theo (ngay, pham_vi, chi_so) -> cron chay lai trong ngay khong nhan doi.
CREATE TABLE thong_ke_ngay (
    ngay        TEXT NOT NULL,
    pham_vi     TEXT NOT NULL,
    chi_so      TEXT NOT NULL,
    so_luong    REAL NOT NULL DEFAULT 0,
    gia_tri     REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (ngay, pham_vi, chi_so)
);

-- ---------- 4. Sua don gia nhap sai (du lieu cu) ----------
-- "Phieu thu - Phieu yeu cau phat trien dich vu" nhap 17.000.000d/cuon -> 17.000d.
UPDATE vt_tieu_hao SET don_gia_tham_khao = 17000, updated_at = datetime('now', '+7 hours')
WHERE id = 'TS3T-000045' AND don_gia_tham_khao = 17000000;
UPDATE phieu_chuyen_kho_ct SET don_gia = 17000, thanh_tien = so_luong * 17000
WHERE vt_id = 'TS3T-000045' AND don_gia = 17000000;
-- "Cuon bang keo trong" nhap 4.140.000d/cuon (thanh tien go nham vao don gia) -> 13.800d.
UPDATE phieu_chuyen_kho_ct SET don_gia = 13800, thanh_tien = so_luong * 13800
WHERE vt_id = 'TS3T-000089' AND don_gia = 4140000;
