import sqlite3,glob,sys
f=[x for x in glob.glob('F:/claude/QLBH 3T/.wrangler/state_hd/v3/d1/miniflare-D1DatabaseObject/*.sqlite') if 'metadata' not in x][0]
db=sqlite3.connect(f)
if __name__=='__main__':
    for q in sys.argv[1:]: print(db.execute(q).fetchall())
