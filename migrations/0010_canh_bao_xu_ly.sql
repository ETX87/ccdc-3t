-- Migration 0010: xu ly canh bao ngay tren man Canh bao (user yeu cau 2026-09-30: "bo sung nut da doc /
-- bo qua, de xuat can sua gi, de xuat sua don gia -> an vao tu dong sua luon").
--   * canh_bao_bo_qua: muc canh bao da duoc danh dau "bo qua" (an cho MOI nguoi, khong dem nua). khoa =
--     ma rieng cua tung muc theo loai (don-gia-bat-thuong: id dong phieu_chuyen_kho_ct; sap-het-bao-hanh:
--     ccdc.id@han_bao_hanh -> doi han bao hanh thi canh bao hien lai). Chi THEM bang, an toan du lieu that.
--   * vt_gia_log: nhat ky moi lan sua don gia tham khao tu man Canh bao (truy vet ai sua, gia cu/moi).
CREATE TABLE canh_bao_bo_qua (
    loai        TEXT NOT NULL,
    khoa        TEXT NOT NULL,
    nguoi       TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (loai, khoa)
);

CREATE TABLE vt_gia_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    vt_id       TEXT NOT NULL REFERENCES vt_tieu_hao(id),
    gia_cu      REAL,
    gia_moi     REAL NOT NULL,
    nguoi       TEXT NOT NULL,
    ly_do       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_vt_gia_log_vt ON vt_gia_log(vt_id);
