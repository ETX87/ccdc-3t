# Nap ban export production vao state local rieng (state_hd) de chup man hinh huong dan.
import sqlite3, re, glob
f=[x for x in glob.glob('F:/claude/QLBH 3T/.wrangler/state_hd/v3/d1/miniflare-D1DatabaseObject/*.sqlite') if 'metadata' not in x][0]
db=sqlite3.connect(f); db.execute('PRAGMA foreign_keys=OFF')
for (t,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('d1_migrations','sqlite_sequence') AND name NOT LIKE '_cf%'").fetchall(): db.execute(f'DELETE FROM "{t}"')
src=open('F:/claude/QLBH 3T/_backup_ccdc/prod-huong-dan-20261001.sql',encoding='utf-8').read()
n=0
for s in re.split(r';\n',src):
    st=s.strip()
    if st.startswith('INSERT INTO') and not st.startswith('INSERT INTO "d1_migrations"') and 'sqlite_sequence' not in st[:40]: db.execute(s); n+=1
U=[('hcns@test.local','Nguyễn Thị HCNS (đào tạo)','HCNS'),('kt@test.local','Trần Văn Kế Toán (đào tạo)','Ke toan'),('admin@test.local','Admin (đào tạo)','Admin')]
db.executemany("INSERT OR REPLACE INTO users (email,ten,vai_tro,trang_thai_duyet,created_at,updated_at) VALUES (?,?,?,'Da duyet',datetime('now','+7 hours'),datetime('now','+7 hours'))",U)
db.commit(); print(n,'stmts; users',db.execute("SELECT COUNT(*) FROM users").fetchone(),'nv',db.execute("SELECT COUNT(*) FROM nhan_vien").fetchone(),'FK',len(db.execute('PRAGMA foreign_key_check').fetchall()))
