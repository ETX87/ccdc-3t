# Bo sung du lieu dao tao cho tai lieu vai tro QUAN LY + NHAN VIEN (chay SAU nap_du_lieu.py va cac canh HCNS/KT,
# khi worker ccdc-huong-dan DANG TAT). Chi ghi vao ban sao local state_hd.
from db import db
db.execute("INSERT OR REPLACE INTO users (email,ten,vai_tro,trang_thai_duyet,created_at,updated_at) VALUES ('ql@test.local','Phạm Văn Quản Lý (đào tạo)','Quan ly','Da duyet',datetime('now','+7 hours'),datetime('now','+7 hours'))")
db.execute("INSERT OR IGNORE INTO nhan_vien (ma_nv,ten_nv,bo_phan,chuc_vu,email_dang_nhap,dang_lam_viec,created_at,updated_at) VALUES ('DT-QL','Phạm Văn Quản Lý (đào tạo)','Phòng Kỹ thuật','Trưởng nhóm kỹ thuật','ql@test.local',1,datetime('now','+7 hours'),datetime('now','+7 hours'))")
db.execute("INSERT OR IGNORE INTO nhan_vien (ma_nv,ten_nv,bo_phan,chuc_vu,dang_lam_viec,quan_ly_id,created_at,updated_at) VALUES ('DT-NV02','Hoàng Thị Kỹ Thuật (đào tạo)','Phòng Kỹ thuật','Kỹ thuật viên',1,'DT-QL',datetime('now','+7 hours'),datetime('now','+7 hours'))")
db.execute("UPDATE nhan_vien SET quan_ly_id='DT-QL' WHERE ma_nv='DT-NV01'")
db.execute("INSERT OR IGNORE INTO kho (ten_kho,loai,nhan_vien_id,created_at,updated_at) VALUES ('Kho QL - Phạm Văn Quản Lý (đào tạo)','Quan ly','DT-QL',datetime('now','+7 hours'),datetime('now','+7 hours'))")
# Gia lap "da ket noi Google Drive" de anh chup hien nut tai tep (anh thumbnail duoc Playwright thay bang anh mau).
db.execute("INSERT OR REPLACE INTO google_drive_oauth (id,google_email,refresh_token_enc,folder_id,authorized_by,authorized_at) VALUES (1,'luutru.3t@gmail.com','gia-lap','gia-lap','admin@test.local',datetime('now','+7 hours'))")
db.commit()
print(db.execute("SELECT id,ten_kho FROM kho WHERE nhan_vien_id='DT-QL'").fetchall())
