-- Migration 0007: danh ba nhan su dong bo tu he "ETX nhan su" (PULL 1 chieu, giong linh-kien-app
-- migration 0029 - user chot 2026-09-24: "danh sach nhan su se ket noi ETX giong nhu ben linh kien
-- app"). Khac linh-kien-app (bang etx_nhan_su rieng chi de tham khao), o day ETX la NGUON cua chinh
-- bang nhan_vien - vi CCDC can so do quan ly truc tiep (quyen QL) + trang thai lam viec that.
--   * ma_etx: ma nhan su ben ETX (maNhanSu). KHONG dung lam PK vi nhan_vien cu (du lieu Excel) co
--     ma_nv rieng dang duoc tham chieu boi ccdc/phieu_* - sync "nhan" dong cu qua ma_nv trung hoac
--     gmail trung thay vi tao ban sao.
--   * gmail: email tu ETX / du lieu cu, KHONG FK users (khac email_dang_nhap) - dung de tu lien ket
--     tai khoan khi nguoi do dang nhap lan dau (middleware/loadUser.ts).
-- Sync KHONG tu tao tai khoan users (giong linh-kien-app) - van phai dang nhap + Admin duyet.
ALTER TABLE nhan_vien ADD COLUMN ma_etx TEXT;
ALTER TABLE nhan_vien ADD COLUMN gmail TEXT;
CREATE UNIQUE INDEX idx_nhan_vien_ma_etx ON nhan_vien(ma_etx);
CREATE INDEX idx_nhan_vien_gmail ON nhan_vien(gmail);

-- Trang thai lan dong bo gan nhat (cung khuon etx_nhan_su_sync_state cua linh-kien-app) - seed san
-- dong id=1.
CREATE TABLE etx_sync_state (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    last_run_at     TEXT,
    last_status     TEXT,
    changed_count   INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT
);
INSERT INTO etx_sync_state (id) VALUES (1);
