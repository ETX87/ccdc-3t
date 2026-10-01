-- Migration 0012: dua thoi diem tao ve GIO VIET NAM (UTC+7) - user chot 2026-10-01: "luu y cac thoi gian xu ly
-- theo mui gio +7 cua Viet Nam". Truoc day 1 so INSERT de SQLite tu dien DEFAULT (datetime('now')) = UTC (lech 7
-- gio); code da sua de luon ghi nowVN(). O 5 bang duoi, MOI dong hien co deu tao qua DEFAULT do (import, dang
-- nhap, dong bo ETX, gan thu kho...) -> cong 7 gio. updated_at: chi dong CHUA TUNG SUA (= created_at, cung la
-- DEFAULT UTC); dong da sua thi code da ghi nowVN() (dung gio VN san). nhan_vien KHONG chinh: lan ca 2 loai gio.
-- Chay 1 lan (he thong migration) - KHONG chay lai tay.
UPDATE users SET updated_at = datetime(updated_at, '+7 hours') WHERE updated_at = created_at;
UPDATE users SET created_at = datetime(created_at, '+7 hours');
UPDATE kho SET updated_at = datetime(updated_at, '+7 hours') WHERE updated_at = created_at;
UPDATE kho SET created_at = datetime(created_at, '+7 hours');
UPDATE ccdc SET updated_at = datetime(updated_at, '+7 hours') WHERE updated_at = created_at;
UPDATE ccdc SET created_at = datetime(created_at, '+7 hours');
UPDATE vt_tieu_hao SET updated_at = datetime(updated_at, '+7 hours') WHERE updated_at = created_at;
UPDATE vt_tieu_hao SET created_at = datetime(created_at, '+7 hours');
UPDATE kho_thu_kho SET created_at = datetime(created_at, '+7 hours');
