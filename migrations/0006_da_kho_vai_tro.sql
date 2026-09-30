-- Migration 0006: da kho + vai tro Ke toan / HCNS / Quan ly + thu kho (xac nhan nghiep vu voi user
-- 2026-09-23, xem ke hoach "Giai doan 1.5"). Tom tat:
--   * users.vai_tro: 'Admin','Ke toan','HCNS','Quan ly' (NULL = Nhan vien); 'Quan ly CCDC' cu -> 'HCNS'.
--   * nhan_vien.quan_ly_id: so do quan ly truc tiep (QL chi thao tac trong nhom cap duoi cua minh).
--   * kho + kho_thu_kho: chuoi KHO MUA -> KHO HCNS -> KHO MIEN -> KHO QL -> NV. Thu kho gan rieng
--     theo tung kho, doc lap vai tro (1 nguoi co the vua QL vua thu kho mien).
--   * ccdc (tai san co dinh): them kho_id + trang thai Bao hong / Tieu huy / Cho duyet nhap.
--   * phieu_giao_nhan: them loai 'Chuyen kho' + tu_kho_id/den_kho_id.
--   * phieu_thanh_ly -> phieu_xu_ly_ts (Nhap mua / Bao hong / Thanh ly / Tieu huy, Ke toan duyet).
--   * phieu_tieu_hao (phang, 1 kho ngam dinh) -> phieu_chuyen_kho (+ct +log) theo kho nguon/dich.
--
-- SQLite khong ALTER duoc CHECK -> rebuild bang: copy sang <bang>_bak -> DROP <bang> -> CREATE lai
-- DUNG TEN CU -> INSERT tu _bak. defer_foreign_keys de FK chi kiem tra luc COMMIT. KHONG dung kieu
-- "tao <bang>_new roi RENAME": DROP bang cha lam tang bo dem vi pham FK deferred cua moi dong con,
-- RENAME khong lam giam bo dem -> COMMIT loi FOREIGN KEY (da gap that 2026-09-24); chi INSERT dong
-- vao bang cha dung ten moi lam giam bo dem ve 0.
PRAGMA defer_foreign_keys = true;

-- ---------------------------------------------------------------- users
CREATE TABLE users_bak AS SELECT * FROM users;
DROP TABLE users;
CREATE TABLE users (
    email               TEXT PRIMARY KEY,
    ten                 TEXT,
    vai_tro             TEXT CHECK (vai_tro IN ('Admin', 'Ke toan', 'HCNS', 'Quan ly')),
    trang_thai_duyet    TEXT NOT NULL DEFAULT 'Cho duyet' CHECK (trang_thai_duyet IN ('Cho duyet', 'Da duyet', 'Tu choi')),
    bi_khoa             INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO users (email, ten, vai_tro, trang_thai_duyet, bi_khoa, created_at, updated_at)
SELECT email, ten, CASE WHEN vai_tro = 'Quan ly CCDC' THEN 'HCNS' ELSE vai_tro END,
       trang_thai_duyet, bi_khoa, created_at, updated_at
FROM users_bak;
DROP TABLE users_bak;

-- ---------------------------------------------------------------- nhan_vien: quan ly truc tiep
ALTER TABLE nhan_vien ADD COLUMN quan_ly_id TEXT REFERENCES nhan_vien(ma_nv);
CREATE INDEX idx_nhan_vien_quan_ly ON nhan_vien(quan_ly_id);

-- ---------------------------------------------------------------- kho
-- loai 'Mua hang' la NGUON AO (hang tu nha cung cap di vao he thong qua day) - KHONG tinh ton.
-- loai 'Quan ly': kho rieng cua 1 quan ly (nhan_vien_id = QL chu kho, UNIQUE) - QL tu dong la thu
-- kho cua kho nay (khong can dong kho_thu_kho).
CREATE TABLE kho (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_kho         TEXT NOT NULL,
    loai            TEXT NOT NULL CHECK (loai IN ('Mua hang', 'HCNS', 'Mien', 'Quan ly')),
    nhan_vien_id    TEXT UNIQUE REFERENCES nhan_vien(ma_nv),
    bat_tat         INTEGER NOT NULL DEFAULT 1,
    ghi_chu         TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
-- 2 kho mac dinh he thong luon can (id co dinh 1, 2 de migration/du lieu cu tham chieu duoc).
INSERT INTO kho (id, ten_kho, loai) VALUES (1, 'Kho mua hàng', 'Mua hang');
INSERT INTO kho (id, ten_kho, loai) VALUES (2, 'Kho tổng HCNS', 'HCNS');

CREATE TABLE kho_thu_kho (
    kho_id      INTEGER NOT NULL REFERENCES kho(id),
    email       TEXT NOT NULL REFERENCES users(email),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (kho_id, email)
);
CREATE INDEX idx_kho_thu_kho_email ON kho_thu_kho(email);

-- ---------------------------------------------------------------- ccdc (tai san co dinh)
-- Bat bien (validate o route): TS con hieu luc thi DUNG 1 trong 2: nguoi_dang_giu (NV giu) hoac
-- kho_id (dang nam trong kho).
CREATE TABLE ccdc_bak AS SELECT * FROM ccdc;
DROP TABLE ccdc;
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
        'Cho duyet nhap', 'Trong kho', 'Dang cap phat', 'Dang bao tri',
        'Cho duyet bao hong', 'Hong', 'Cho thanh ly', 'Cho tieu huy', 'Da thanh ly', 'Da tieu huy'
    )),
    nguoi_dang_giu          TEXT REFERENCES nhan_vien(ma_nv),
    kho_id                  INTEGER REFERENCES kho(id),
    anh_url                 TEXT,
    ghi_chu                 TEXT,
    vo_hieu_hoa             INTEGER NOT NULL DEFAULT 0,
    nguoi_tao               TEXT REFERENCES users(email),
    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO ccdc (id, ten_ccdc, nhom_id, don_vi_tinh, so_seri, ngay_mua, nguyen_gia, nha_cung_cap,
                      han_bao_hanh, tinh_trang, trang_thai_hien_tai, nguoi_dang_giu, kho_id, anh_url,
                      ghi_chu, vo_hieu_hoa, nguoi_tao, created_at, updated_at)
SELECT id, ten_ccdc, nhom_id, don_vi_tinh, so_seri, ngay_mua, nguyen_gia, nha_cung_cap,
       han_bao_hanh, tinh_trang, trang_thai_hien_tai, nguoi_dang_giu,
       CASE WHEN nguoi_dang_giu IS NULL THEN 2 ELSE NULL END,
       anh_url, ghi_chu, vo_hieu_hoa, nguoi_tao, created_at, updated_at
FROM ccdc_bak;
DROP TABLE ccdc_bak;
CREATE INDEX idx_ccdc_trang_thai ON ccdc(trang_thai_hien_tai);
CREATE INDEX idx_ccdc_nguoi_dang_giu ON ccdc(nguoi_dang_giu);
CREATE INDEX idx_ccdc_nhom ON ccdc(nhom_id);
CREATE INDEX idx_ccdc_kho ON ccdc(kho_id);

-- ---------------------------------------------------------------- phieu_giao_nhan (TSCD)
-- Ngu nghia ben giao/ben nhan theo loai_phieu:
--   Cap phat:    tu_kho_id      -> nhan_vien_id
--   Thu hoi:     nhan_vien_id   -> den_kho_id
--   Dieu chuyen: nhan_vien_id   -> nhan_vien_nhan_moi_id
--   Chuyen kho:  tu_kho_id      -> den_kho_id
CREATE TABLE phieu_giao_nhan_bak AS SELECT * FROM phieu_giao_nhan;
DROP TABLE phieu_giao_nhan;
CREATE TABLE phieu_giao_nhan (
    id                      TEXT PRIMARY KEY,
    loai_phieu              TEXT NOT NULL CHECK (loai_phieu IN ('Cap phat', 'Thu hoi', 'Dieu chuyen', 'Chuyen kho')),
    nhan_vien_id            TEXT REFERENCES nhan_vien(ma_nv),
    nhan_vien_nhan_moi_id   TEXT REFERENCES nhan_vien(ma_nv),
    tu_kho_id               INTEGER REFERENCES kho(id),
    den_kho_id              INTEGER REFERENCES kho(id),
    nguoi_lap               TEXT NOT NULL REFERENCES users(email),
    ngay_lap                TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu                 TEXT,
    da_xac_nhan             INTEGER NOT NULL DEFAULT 0,
    xac_nhan_luc            TEXT,
    nguoi_xac_nhan          TEXT REFERENCES users(email),
    created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO phieu_giao_nhan (id, loai_phieu, nhan_vien_id, nhan_vien_nhan_moi_id, tu_kho_id, den_kho_id,
                                 nguoi_lap, ngay_lap, ghi_chu, da_xac_nhan, xac_nhan_luc, created_at)
SELECT id, loai_phieu, nhan_vien_id, nhan_vien_nhan_moi_id,
       CASE WHEN loai_phieu = 'Cap phat' THEN 2 END,
       CASE WHEN loai_phieu = 'Thu hoi' THEN 2 END,
       nguoi_lap, ngay_lap, ghi_chu, da_xac_nhan, xac_nhan_luc, created_at
FROM phieu_giao_nhan_bak;
DROP TABLE phieu_giao_nhan_bak;
CREATE INDEX idx_pgn_nhan_vien ON phieu_giao_nhan(nhan_vien_id);
CREATE INDEX idx_pgn_nhan_vien_moi ON phieu_giao_nhan(nhan_vien_nhan_moi_id);
CREATE INDEX idx_pgn_tu_kho ON phieu_giao_nhan(tu_kho_id);
CREATE INDEX idx_pgn_den_kho ON phieu_giao_nhan(den_kho_id);

-- ---------------------------------------------------------------- phieu_xu_ly_ts (thay phieu_thanh_ly)
-- Moi phieu Ke toan duyet: Nhap mua / Bao hong -> duyet la co hieu luc ngay ('Da hoan tat');
-- Thanh ly / Tieu huy -> duyet ('Da duyet') roi HCNS xu ly vat ly xong moi 'Da hoan tat'.
CREATE TABLE phieu_xu_ly_ts (
    id                  TEXT PRIMARY KEY,
    loai                TEXT NOT NULL CHECK (loai IN ('Nhap mua', 'Bao hong', 'Thanh ly', 'Tieu huy')),
    ly_do               TEXT,
    ngay_de_xuat        TEXT NOT NULL DEFAULT (datetime('now')),
    nguoi_de_xuat       TEXT NOT NULL REFERENCES users(email),
    trang_thai          TEXT NOT NULL DEFAULT 'Cho ke toan duyet' CHECK (trang_thai IN ('Cho ke toan duyet', 'Da duyet', 'Tu choi', 'Da hoan tat')),
    gia_tri_thu_hoi     REAL,
    ghi_chu             TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pxl_trang_thai ON phieu_xu_ly_ts(trang_thai);

CREATE TABLE phieu_xu_ly_ts_ct (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    phieu_id            TEXT NOT NULL REFERENCES phieu_xu_ly_ts(id),
    ccdc_id             TEXT NOT NULL REFERENCES ccdc(id),
    -- Trang thai/nguoi giu/kho TRUOC khi lap phieu - de hoan nguyen dung khi Ke toan tu choi.
    trang_thai_truoc    TEXT,
    nguoi_giu_truoc     TEXT,
    kho_truoc           INTEGER
);
CREATE INDEX idx_pxlct_phieu ON phieu_xu_ly_ts_ct(phieu_id);
CREATE INDEX idx_pxlct_ccdc ON phieu_xu_ly_ts_ct(ccdc_id);

CREATE TABLE phieu_xu_ly_ts_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    phieu_id        TEXT NOT NULL REFERENCES phieu_xu_ly_ts(id),
    trang_thai      TEXT NOT NULL,
    nguoi_xu_ly     TEXT NOT NULL REFERENCES users(email),
    ngay_xu_ly      TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu         TEXT
);
CREATE INDEX idx_pxll_phieu ON phieu_xu_ly_ts_log(phieu_id);

INSERT INTO phieu_xu_ly_ts (id, loai, ly_do, ngay_de_xuat, nguoi_de_xuat, trang_thai, gia_tri_thu_hoi, ghi_chu, created_at)
SELECT id, 'Thanh ly', ly_do, ngay_de_xuat, nguoi_de_xuat,
       CASE trang_thai WHEN 'Cho duyet' THEN 'Cho ke toan duyet' WHEN 'Da thanh ly' THEN 'Da hoan tat' ELSE trang_thai END,
       gia_tri_thu_hoi, ghi_chu, created_at
FROM phieu_thanh_ly;
INSERT INTO phieu_xu_ly_ts_ct (phieu_id, ccdc_id, trang_thai_truoc, kho_truoc)
SELECT phieu_id, ccdc_id, 'Trong kho', 2 FROM phieu_thanh_ly_ct;
INSERT INTO phieu_xu_ly_ts_log (phieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu)
SELECT phieu_id,
       CASE trang_thai WHEN 'Cho duyet' THEN 'Cho ke toan duyet' WHEN 'Da thanh ly' THEN 'Da hoan tat' ELSE trang_thai END,
       nguoi_xu_ly, ngay_xu_ly, ghi_chu
FROM phieu_thanh_ly_log;
DROP TABLE phieu_thanh_ly_log;
DROP TABLE phieu_thanh_ly_ct;
DROP TABLE phieu_thanh_ly;

-- ---------------------------------------------------------------- phieu_chuyen_kho (tai san tieu hao)
-- Luong (quyet dinh user 2026-09-23):
--   Nhap mua   : kho Mua hang -> kho HCNS. 'Cho ke toan duyet' -> KT duyet 'Da nhan' / 'Ke toan tu choi'.
--   Chuyen kho : kho -> kho. Lap phieu = 'Dang chuyen' (TRU ton nguon ngay) -> thu kho dich 'Da nhan'
--                (cong dich) / 'Bi tu choi' (hoan nguon).
--   Cap phat NV: kho -> nhan vien (tieu hao het). 'Da giao' ngay; NV bam xac nhan (da_xac_nhan) neu co
--                tai khoan - khong chan hoan tat vi da so KTV/CTV khong co tai khoan.
CREATE TABLE phieu_chuyen_kho (
    id                      TEXT PRIMARY KEY,
    loai                    TEXT NOT NULL CHECK (loai IN ('Nhap mua', 'Chuyen kho', 'Cap phat NV')),
    tu_kho_id               INTEGER NOT NULL REFERENCES kho(id),
    den_kho_id              INTEGER REFERENCES kho(id),
    den_nhan_vien_id        TEXT REFERENCES nhan_vien(ma_nv),
    -- Nguoi nhan KHONG co trong danh ba nhan_vien (KTV/CTV hien truong) - giu dang text tu do.
    nguoi_nhan_ten_tu_do    TEXT,
    nha_cung_cap            TEXT,
    nguoi_lap               TEXT NOT NULL REFERENCES users(email),
    trang_thai              TEXT NOT NULL CHECK (trang_thai IN (
        'Cho ke toan duyet', 'Ke toan tu choi', 'Dang chuyen', 'Da nhan', 'Bi tu choi', 'Da giao'
    )),
    da_xac_nhan             INTEGER NOT NULL DEFAULT 0,
    xac_nhan_luc            TEXT,
    anh_url                 TEXT,
    ghi_chu                 TEXT,
    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pck_tu_kho ON phieu_chuyen_kho(tu_kho_id);
CREATE INDEX idx_pck_den_kho ON phieu_chuyen_kho(den_kho_id);
CREATE INDEX idx_pck_den_nv ON phieu_chuyen_kho(den_nhan_vien_id);
CREATE INDEX idx_pck_trang_thai ON phieu_chuyen_kho(trang_thai);

CREATE TABLE phieu_chuyen_kho_ct (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    phieu_id        TEXT NOT NULL REFERENCES phieu_chuyen_kho(id),
    vt_id           TEXT NOT NULL REFERENCES vt_tieu_hao(id),
    so_luong        REAL NOT NULL CHECK (so_luong > 0),
    don_gia         REAL,
    thanh_tien      REAL
);
CREATE INDEX idx_pckct_phieu ON phieu_chuyen_kho_ct(phieu_id);
CREATE INDEX idx_pckct_vt ON phieu_chuyen_kho_ct(vt_id);

CREATE TABLE phieu_chuyen_kho_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    phieu_id        TEXT NOT NULL REFERENCES phieu_chuyen_kho(id),
    trang_thai      TEXT NOT NULL,
    nguoi_xu_ly     TEXT NOT NULL REFERENCES users(email),
    ngay_xu_ly      TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu         TEXT
);
CREATE INDEX idx_pckl_phieu ON phieu_chuyen_kho_log(phieu_id);

-- Du lieu phieu_tieu_hao cu (chi co o local, sinh tu script import) KHONG chuyen doi - script import
-- se sinh lai thang vao phieu_chuyen_kho theo kho. Production chua co du lieu nay.
DROP TABLE phieu_tieu_hao_log;
DROP TABLE phieu_tieu_hao;

-- Ton kho TINH DONG (khong denormalize - bai hoc cot "Tong ton hien tai" khong dang tin cua nguon cu):
--   vao = phieu co den_kho_id = kho, trang_thai 'Da nhan'
--   ra  = phieu co tu_kho_id  = kho, trang_thai 'Dang chuyen' / 'Da nhan' / 'Da giao' (tru ngay khi lap)
-- Kho 'Mua hang' la nguon ao -> loai khoi view.
CREATE VIEW v_ton_kho AS
SELECT m.kho_id, m.vt_id, SUM(m.delta) AS ton
FROM (
    SELECT p.den_kho_id AS kho_id, ct.vt_id, ct.so_luong AS delta
    FROM phieu_chuyen_kho p JOIN phieu_chuyen_kho_ct ct ON ct.phieu_id = p.id
    WHERE p.den_kho_id IS NOT NULL AND p.trang_thai = 'Da nhan'
    UNION ALL
    SELECT p.tu_kho_id AS kho_id, ct.vt_id, -ct.so_luong AS delta
    FROM phieu_chuyen_kho p JOIN phieu_chuyen_kho_ct ct ON ct.phieu_id = p.id
    WHERE p.trang_thai IN ('Dang chuyen', 'Da nhan', 'Da giao')
) m
JOIN kho k ON k.id = m.kho_id AND k.loai != 'Mua hang'
GROUP BY m.kho_id, m.vt_id;

-- Bang "chot chan" cho db.batch(): route chen 1 dong x = (1 neu ton khong am sau khi ghi, 0 neu am)
-- -> CHECK loi -> D1 rollback TOAN BO batch. Chong xuat vuot ton khi 2 phieu lap dong thoi (check
-- truoc roi ghi sau khong du an toan). Cuoi batch xoa dong vua chen.
CREATE TABLE batch_guard (
    x   INTEGER NOT NULL CHECK (x = 1)
);
