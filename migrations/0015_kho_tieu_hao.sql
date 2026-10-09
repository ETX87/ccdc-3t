-- 0015 (2026-10-09) - De xuat nhan vien (HC):
--  * Loai kho moi 'Tieu hao' = diem TIEU DUNG cua van phong (VPP, ve sinh, dong hang...): xuat vao la tieu hao het,
--    KHONG tinh ton (giong kho Mua hang khong tinh ton). Phieu xuat = 'Cap phat NV' co den_kho_id = kho tieu hao.
--  * Phieu 'Dieu chinh' ton tieu hao (thu kho/HCNS lap, KT duyet -> 'Da dieu chinh'): ct.dau = +1 / -1 (so_luong > 0).
--  * Trang thai 'Da huy' (huy phieu chua KT duyet), cot gui_lai_tu (phieu gui lai tu phieu bi tu choi nhan) va
--    da_xu_ly_tu_choi (nguoi lap / thu kho nguon da xu ly phieu bi tu choi nhan -> het nhac).
-- Doi CHECK -> rebuild bang theo kieu _bak (CLAUDE.md: KHONG dung RENAME, FK tri hoan).
PRAGMA defer_foreign_keys = true;

DROP VIEW IF EXISTS v_ton_kho;

-- ---- kho ----
CREATE TABLE kho_bak AS SELECT * FROM kho;
DROP TABLE kho;
CREATE TABLE kho (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_kho         TEXT NOT NULL,
    loai            TEXT NOT NULL CHECK (loai IN ('Mua hang', 'HCNS', 'Mien', 'Quan ly', 'Tieu hao')),
    nhan_vien_id    TEXT UNIQUE REFERENCES nhan_vien(ma_nv),
    bat_tat         INTEGER NOT NULL DEFAULT 1,
    ghi_chu         TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    cong_ty_id      INTEGER NOT NULL DEFAULT 1
);
INSERT INTO kho (id, ten_kho, loai, nhan_vien_id, bat_tat, ghi_chu, created_at, updated_at, cong_ty_id)
SELECT id, ten_kho, loai, nhan_vien_id, bat_tat, ghi_chu, created_at, updated_at, cong_ty_id FROM kho_bak;
DROP TABLE kho_bak;
CREATE INDEX idx_kho_cong_ty ON kho(cong_ty_id);

-- 5 "Kho tieu hao VP ..." HC da tao (2026-10-07) bang loai HCNS (luc do chua co loai tieu hao) -> chuyen loai.
UPDATE kho SET loai = 'Tieu hao', updated_at = datetime('now', '+7 hours')
WHERE loai = 'HCNS' AND ten_kho LIKE 'Kho tiêu hao%'
  AND NOT EXISTS (SELECT 1 FROM phieu_chuyen_kho p WHERE p.tu_kho_id = kho.id OR p.den_kho_id = kho.id)
  AND NOT EXISTS (SELECT 1 FROM ccdc c WHERE c.kho_id = kho.id);

-- ---- phieu_chuyen_kho ----
CREATE TABLE phieu_chuyen_kho_bak AS SELECT * FROM phieu_chuyen_kho;
DROP TABLE phieu_chuyen_kho;
CREATE TABLE phieu_chuyen_kho (
    id                      TEXT PRIMARY KEY,
    loai                    TEXT NOT NULL CHECK (loai IN ('Nhap mua', 'Chuyen kho', 'Cap phat NV', 'Dieu chinh')),
    tu_kho_id               INTEGER NOT NULL REFERENCES kho(id),
    den_kho_id              INTEGER REFERENCES kho(id),
    den_nhan_vien_id        TEXT REFERENCES nhan_vien(ma_nv),
    nguoi_nhan_ten_tu_do    TEXT,
    nha_cung_cap            TEXT,
    nguoi_lap               TEXT NOT NULL REFERENCES users(email),
    trang_thai              TEXT NOT NULL CHECK (trang_thai IN (
        'Cho ke toan duyet', 'Ke toan tu choi', 'Dang chuyen', 'Da nhan', 'Bi tu choi', 'Da giao', 'Da huy', 'Da dieu chinh'
    )),
    da_xac_nhan             INTEGER NOT NULL DEFAULT 0,
    xac_nhan_luc            TEXT,
    anh_url                 TEXT,
    ghi_chu                 TEXT,
    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
    ma_phieu                TEXT,
    gui_lai_tu              TEXT,
    da_xu_ly_tu_choi        INTEGER NOT NULL DEFAULT 0
);
INSERT INTO phieu_chuyen_kho (id, loai, tu_kho_id, den_kho_id, den_nhan_vien_id, nguoi_nhan_ten_tu_do, nha_cung_cap, nguoi_lap,
                              trang_thai, da_xac_nhan, xac_nhan_luc, anh_url, ghi_chu, created_at, updated_at, ma_phieu)
SELECT id, loai, tu_kho_id, den_kho_id, den_nhan_vien_id, nguoi_nhan_ten_tu_do, nha_cung_cap, nguoi_lap,
       trang_thai, da_xac_nhan, xac_nhan_luc, anh_url, ghi_chu, created_at, updated_at, ma_phieu
FROM phieu_chuyen_kho_bak;
DROP TABLE phieu_chuyen_kho_bak;
CREATE INDEX idx_pck_tu_kho ON phieu_chuyen_kho(tu_kho_id);
CREATE INDEX idx_pck_den_kho ON phieu_chuyen_kho(den_kho_id);
CREATE INDEX idx_pck_den_nv ON phieu_chuyen_kho(den_nhan_vien_id);
CREATE INDEX idx_pck_trang_thai ON phieu_chuyen_kho(trang_thai);
CREATE UNIQUE INDEX idx_pck_ma_phieu ON phieu_chuyen_kho(ma_phieu);

-- Dau dong phieu Dieu chinh: +1 tang ton, -1 giam ton (NULL voi cac loai khac).
ALTER TABLE phieu_chuyen_kho_ct ADD COLUMN dau INTEGER;

-- ---- v_ton_kho: bo kho Tieu hao (diem tieu dung) + them phieu Dieu chinh da duyet ----
CREATE VIEW v_ton_kho AS
SELECT m.kho_id, m.vt_id, SUM(m.delta) AS ton
FROM (
    SELECT p.den_kho_id AS kho_id, COALESCE(ct.vt_id_den, ct.vt_id) AS vt_id, ct.so_luong AS delta
    FROM phieu_chuyen_kho p JOIN phieu_chuyen_kho_ct ct ON ct.phieu_id = p.id
    WHERE p.den_kho_id IS NOT NULL AND p.trang_thai = 'Da nhan'
    UNION ALL
    SELECT p.tu_kho_id AS kho_id, ct.vt_id, -ct.so_luong AS delta
    FROM phieu_chuyen_kho p JOIN phieu_chuyen_kho_ct ct ON ct.phieu_id = p.id
    WHERE p.trang_thai IN ('Dang chuyen', 'Da nhan', 'Da giao')
    UNION ALL
    SELECT p.tu_kho_id AS kho_id, ct.vt_id, ct.so_luong * ct.dau AS delta
    FROM phieu_chuyen_kho p JOIN phieu_chuyen_kho_ct ct ON ct.phieu_id = p.id
    WHERE p.loai = 'Dieu chinh' AND p.trang_thai = 'Da dieu chinh'
) m
JOIN kho k ON k.id = m.kho_id AND k.loai NOT IN ('Mua hang', 'Tieu hao')
GROUP BY m.kho_id, m.vt_id;
