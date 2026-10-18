-- 0019 (2026-10-18) - Nhan vien thuoc NHIEU cong ty (user: "1 so nhan vien dong thoi thuoc nhieu cong ty, moi cong ty
-- tinh 1 kho CCDC rieng va co kho tong tat ca cong ty").
--   - nhan_vien.cong_ty_id giu nguyen = cong ty CHINH; nhan_vien_cong_ty = cac cong ty KIEM NHIEM them.
--   - v_nv_cong_ty = moi cap (nhan vien, cong ty) - dung de kiem "nhan vien thuoc cong ty X" (cap phat, danh sach NV...).
--   - Kho QL: 1 kho / nguoi / CONG TY (truoc: 1 kho / nguoi) -> bo UNIQUE(nhan_vien_id), thay bang UNIQUE(nhan_vien_id,
--     cong_ty_id). Doi rang buoc cot -> rebuild bang theo kieu _bak (CLAUDE.md), v_ton_kho tham chieu kho -> tao lai.
PRAGMA defer_foreign_keys = true;

CREATE TABLE nhan_vien_cong_ty (
    ma_nv       TEXT NOT NULL REFERENCES nhan_vien(ma_nv),
    cong_ty_id  INTEGER NOT NULL REFERENCES cong_ty(id),
    created_at  TEXT NOT NULL,
    PRIMARY KEY (ma_nv, cong_ty_id)
);
CREATE INDEX idx_nvct_cong_ty ON nhan_vien_cong_ty(cong_ty_id);

CREATE VIEW v_nv_cong_ty AS
SELECT ma_nv, cong_ty_id FROM nhan_vien
UNION
SELECT ma_nv, cong_ty_id FROM nhan_vien_cong_ty;

DROP VIEW IF EXISTS v_ton_kho;

CREATE TABLE kho_bak AS SELECT * FROM kho;
DROP TABLE kho;
CREATE TABLE kho (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_kho         TEXT NOT NULL,
    loai            TEXT NOT NULL CHECK (loai IN ('Mua hang', 'HCNS', 'Mien', 'Trung chuyen', 'Quan ly', 'Tieu hao')),
    nhan_vien_id    TEXT REFERENCES nhan_vien(ma_nv),
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
CREATE UNIQUE INDEX idx_kho_nv_cong_ty ON kho(nhan_vien_id, cong_ty_id);

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
