-- Migration 0014: DA PHAP NHAN (da cong ty) - user chot 2026-10-07.
--   * cong_ty: moi cong ty quan ly ton kho DOC LAP (kho, danh muc vat tu / nhom tai san, TSCD, nhan vien,
--     dot kiem ke rieng). Phieu KHONG co cot cong ty - thuoc cong ty cua kho tren phieu.
--   * user_cong_ty: tai khoan duoc XEM / thao tac cong ty nao (nhieu-nhieu). Khong co dong nao -> mac dinh
--     cong ty cua ho so nhan vien lien ket (hoac cong ty mac dinh). Admin: moi cong ty.
--   * Chuyen giua 2 cong ty (dot 3): phieu_chuyen_kho 'Chuyen kho' khac cong ty di qua 'Cho ke toan duyet'
--     (KT cong ty nguon); dong hang ben nhan = vt_id_den (danh muc rieng tung cong ty, ghep theo ten + DVT).
--     TSCD: phieu_giao_nhan.trang_thai_duyet.
-- Du lieu hien co -> cong ty 1 '3T'. Tao san cong ty 2 'NSKX' + Kho mua hang / Kho tong HCNS rieng.
-- ADD COLUMN khong kem REFERENCES (SQLite bat FK: cot REFERENCES them moi phai co DEFAULT NULL) - app tu kiem.

CREATE TABLE cong_ty (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ma          TEXT NOT NULL UNIQUE,
    ten         TEXT NOT NULL,
    mst         TEXT,
    dia_chi     TEXT,
    -- Cong ty nhan nhan su ETX moi (ETX khong co thong tin cong ty) - dung 1 cong ty mac dinh.
    mac_dinh    INTEGER NOT NULL DEFAULT 0,
    bat_tat     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
INSERT INTO cong_ty (id, ma, ten, mac_dinh, created_at, updated_at)
VALUES (1, '3T', '3T', 1, datetime('now', '+7 hours'), datetime('now', '+7 hours')),
       (2, 'NSKX', 'NSKX', 0, datetime('now', '+7 hours'), datetime('now', '+7 hours'));

CREATE TABLE user_cong_ty (
    email       TEXT NOT NULL REFERENCES users(email),
    cong_ty_id  INTEGER NOT NULL REFERENCES cong_ty(id),
    created_at  TEXT NOT NULL,
    PRIMARY KEY (email, cong_ty_id)
);

ALTER TABLE kho ADD COLUMN cong_ty_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE vt_tieu_hao ADD COLUMN cong_ty_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE nhom_ccdc ADD COLUMN cong_ty_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE ccdc ADD COLUMN cong_ty_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE nhan_vien ADD COLUMN cong_ty_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE dot_kiem_ke ADD COLUMN cong_ty_id INTEGER NOT NULL DEFAULT 1;
CREATE INDEX idx_kho_cong_ty ON kho(cong_ty_id);
CREATE INDEX idx_vt_cong_ty ON vt_tieu_hao(cong_ty_id);
CREATE INDEX idx_nhom_cong_ty ON nhom_ccdc(cong_ty_id);
CREATE INDEX idx_ccdc_cong_ty ON ccdc(cong_ty_id);
CREATE INDEX idx_nv_cong_ty ON nhan_vien(cong_ty_id);

-- Kho he thong cua NSKX (moi cong ty co Kho mua hang ao + Kho tong HCNS rieng).
INSERT INTO kho (ten_kho, loai, cong_ty_id, created_at, updated_at)
VALUES ('Kho mua hàng - NSKX', 'Mua hang', 2, datetime('now', '+7 hours'), datetime('now', '+7 hours')),
       ('Kho tổng HCNS - NSKX', 'HCNS', 2, datetime('now', '+7 hours'), datetime('now', '+7 hours'));

-- Dot 3 (chuyen cong ty) - them san cot de khong phai dung lai view lan nua.
ALTER TABLE phieu_chuyen_kho_ct ADD COLUMN vt_id_den TEXT REFERENCES vt_tieu_hao(id);
-- NULL = phieu khong can duyet (cung cong ty); 'Cho ke toan duyet' / 'Da duyet' / 'Ke toan tu choi'.
ALTER TABLE phieu_giao_nhan ADD COLUMN trang_thai_duyet TEXT;

-- Ton kho: ben NHAN dung vt_id_den neu co (chuyen cong ty), ben XUAT dung vt_id.
DROP VIEW v_ton_kho;
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
) m
JOIN kho k ON k.id = m.kho_id AND k.loai != 'Mua hang'
GROUP BY m.kho_id, m.vt_id;
