-- 0016 (2026-10-13) - Loai kho 'Trung chuyen': chuc nang GIONG HET kho 'Mien' (nhan tu HCNS / kho mien, cap phat cho
-- moi nhan vien cong ty), chi khac ten - vd 1 ban dai dien van phong HN nhan hang tu kho mien roi phat cho NV van phong.
-- Doi qua lai Mien <-> Trung chuyen <-> Quan ly bang POST /kho/:id/doi-loai.
-- Doi CHECK -> rebuild bang theo kieu _bak (CLAUDE.md: KHONG dung RENAME, FK tri hoan). v_ton_kho tham chieu kho -> tao lai.
PRAGMA defer_foreign_keys = true;

DROP VIEW IF EXISTS v_ton_kho;

CREATE TABLE kho_bak AS SELECT * FROM kho;
DROP TABLE kho;
CREATE TABLE kho (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_kho         TEXT NOT NULL,
    loai            TEXT NOT NULL CHECK (loai IN ('Mua hang', 'HCNS', 'Mien', 'Trung chuyen', 'Quan ly', 'Tieu hao')),
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
