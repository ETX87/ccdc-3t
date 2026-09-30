import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { nowVN } from "../lib/vnTime";
import { docTrang, layTrang } from "../lib/phanTrang";

const nhanVien = new Hono<{ Bindings: Env }>();
nhanVien.use("*", verifySessionMiddleware, loadUser);

const TS_DANG_GIU = `SELECT 1 FROM ccdc c WHERE c.nguoi_dang_giu = n.ma_nv AND c.vo_hieu_hoa = 0
               AND c.trang_thai_hien_tai NOT IN ('Da thanh ly', 'Da tieu huy')`;
const CAP_DUOI = "SELECT 1 FROM nhan_vien x WHERE x.quan_ly_id = n.ma_nv AND x.dang_lam_viec = 1";

function dkTrangThai(tt: string | undefined) {
  return tt === "tat-ca" ? "1=1" : tt === "nghi" ? "n.dang_lam_viec = 0" : "n.dang_lam_viec = 1";
}

// GET /?trang_thai=nghi|tat-ca&search=&bo_phan=&loc=quan-ly|chua-co-ql|giu-ts&quan_ly_id=&page=&gon=1
// Mac dinh chi NV dang lam viec. ?page=N -> 1 trang { rows, total } (bang man Nhan vien - truoc day tai
// ca ~1.800 ho so, moi dong 2 truy van con dem). ?gon=1 -> chi ma + ten (o chon nhan vien trong form).
nhanVien.get("/", async (c) => {
  const q = (k: string) => c.req.query(k)?.trim() || undefined;
  const conditions = [dkTrangThai(q("trang_thai"))];
  const binds: unknown[] = [];
  const search = q("search");
  if (search) {
    const cot = ["n.ma_nv", "n.ten_nv", "COALESCE(n.bo_phan,'')", "COALESCE(n.chuc_vu,'')", "COALESCE(n.email_dang_nhap,'')"];
    conditions.push(`(${cot.map((x) => `LOWER(${x}) LIKE LOWER(?)`).join(" OR ")})`);
    binds.push(...cot.map(() => `%${search}%`));
  }
  if (q("bo_phan")) {
    conditions.push("n.bo_phan = ?");
    binds.push(q("bo_phan"));
  }
  if (q("quan_ly_id")) {
    conditions.push("n.quan_ly_id = ?");
    binds.push(q("quan_ly_id"));
  }
  const loc = q("loc");
  if (loc === "quan-ly") conditions.push(`EXISTS (${CAP_DUOI})`);
  else if (loc === "chua-co-ql") conditions.push("n.quan_ly_id IS NULL");
  else if (loc === "giu-ts") conditions.push(`EXISTS (${TS_DANG_GIU})`);
  const where = conditions.join(" AND ");

  if (q("gon") === "1") {
    const { results } = await c.env.DB.prepare(`SELECT n.ma_nv, n.ten_nv FROM nhan_vien n WHERE ${where} ORDER BY n.ten_nv`)
      .bind(...binds)
      .all();
    return c.json({ rows: results });
  }

  const sql = `SELECT n.ma_nv, n.ten_nv, n.bo_phan, n.chuc_vu, n.sdt, n.email_dang_nhap, n.dang_lam_viec,
            n.quan_ly_id, ql.ten_nv AS quan_ly_ten,
            (SELECT COUNT(*) FROM nhan_vien x WHERE x.quan_ly_id = n.ma_nv AND x.dang_lam_viec = 1) AS so_cap_duoi,
            (SELECT COUNT(*) FROM ccdc c WHERE c.nguoi_dang_giu = n.ma_nv AND c.vo_hieu_hoa = 0
               AND c.trang_thai_hien_tai NOT IN ('Da thanh ly', 'Da tieu huy')) AS so_ts_dang_giu,
            n.updated_at
     FROM nhan_vien n LEFT JOIN nhan_vien ql ON ql.ma_nv = n.quan_ly_id
     WHERE ${where} ORDER BY n.ten_nv`;
  const trang = docTrang(c);
  if (trang) return c.json(await layTrang(c.env.DB, trang, { sql: `SELECT COUNT(*) AS n FROM nhan_vien n WHERE ${where}`, binds }, { sql, binds }));
  const { results } = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all();
  return c.json({ rows: results });
});

// GET /thong-ke?trang_thai= - KPI + so dem tab + danh sach bo phan cho man Nhan vien (thay cho viec
// tai ca danh sach ve trinh duyet de dem).
nhanVien.get("/thong-ke", async (c) => {
  const dk = dkTrangThai(c.req.query("trang_thai"));
  const [tk, bp] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT COUNT(*) AS tong,
              SUM(CASE WHEN EXISTS (${CAP_DUOI}) THEN 1 ELSE 0 END) AS quan_ly,
              SUM(CASE WHEN n.quan_ly_id IS NULL THEN 1 ELSE 0 END) AS chua_co_ql,
              SUM(CASE WHEN EXISTS (${TS_DANG_GIU}) THEN 1 ELSE 0 END) AS giu_ts,
              SUM(CASE WHEN n.email_dang_nhap IS NOT NULL THEN 1 ELSE 0 END) AS co_tk,
              (SELECT COUNT(*) FROM ccdc c JOIN nhan_vien n ON n.ma_nv = c.nguoi_dang_giu WHERE ${dk} AND c.vo_hieu_hoa = 0
                 AND c.trang_thai_hien_tai NOT IN ('Da thanh ly', 'Da tieu huy')) AS so_ts_giu
       FROM nhan_vien n WHERE ${dk}`,
    ),
    c.env.DB.prepare(`SELECT DISTINCT n.bo_phan FROM nhan_vien n WHERE ${dk} AND n.bo_phan IS NOT NULL AND n.bo_phan != '' ORDER BY n.bo_phan`),
  ]);
  const r = (tk.results[0] ?? {}) as Record<string, number | null>;
  return c.json({
    tong: r.tong ?? 0,
    quan_ly: r.quan_ly ?? 0,
    chua_co_ql: r.chua_co_ql ?? 0,
    giu_ts: r.giu_ts ?? 0,
    co_tk: r.co_tk ?? 0,
    so_ts_giu: r.so_ts_giu ?? 0,
    bo_phan: (bp.results as { bo_phan: string }[]).map((x) => x.bo_phan),
  });
});

// GET /cap-duoi?ql=<ma_nv> - nhom cap duoi truc tiep. Mac dinh la nhom cua CHINH user dang dang
// nhap; chi Admin/HCNS moi xem duoc nhom cua QL khac qua ?ql=.
nhanVien.get("/cap-duoi", async (c) => {
  const user = c.get("user");
  const qlParam = c.req.query("ql");
  const ql = qlParam && (user.vai_tro === "Admin" || user.vai_tro === "HCNS") ? qlParam : user.ma_nv;
  if (!ql) return c.json({ rows: [] });
  const { results } = await c.env.DB.prepare(
    `SELECT n.ma_nv, n.ten_nv, n.bo_phan, n.chuc_vu, n.email_dang_nhap,
            (SELECT COUNT(*) FROM ccdc c WHERE c.nguoi_dang_giu = n.ma_nv AND c.vo_hieu_hoa = 0) AS so_ts_dang_giu
     FROM nhan_vien n WHERE n.quan_ly_id = ? AND n.dang_lam_viec = 1 ORDER BY n.ten_nv`,
  )
    .bind(ql)
    .all();
  return c.json({ rows: results });
});

nhanVien.get("/:ma_nv", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM nhan_vien WHERE ma_nv = ?").bind(c.req.param("ma_nv")).first();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json({ row });
});

interface Body {
  ma_nv?: string;
  ten_nv?: string;
  bo_phan?: string | null;
  chuc_vu?: string | null;
  sdt?: string | null;
  email_dang_nhap?: string | null;
  ghi_chu?: string | null;
  quan_ly_id?: string | null;
}

// Gan quan ly truc tiep -> dam bao QL do co kho QL rieng (chuoi kho ... -> KHO QL -> NV). Idempotent.
function taoKhoQl(db: D1Database, qlMaNv: string) {
  return db
    .prepare(
      `INSERT INTO kho (ten_kho, loai, nhan_vien_id)
       SELECT 'Kho QL - ' || ten_nv, 'Quan ly', ma_nv FROM nhan_vien WHERE ma_nv = ?
       ON CONFLICT(nhan_vien_id) DO NOTHING`,
    )
    .bind(qlMaNv);
}

// email_dang_nhap co FK users(email) - bao loi ro rang thay vi de FK loi 500.
async function kiemTraEmail(db: D1Database, email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  const u = await db.prepare("SELECT email FROM users WHERE email = ?").bind(email).first();
  return u ? null : "USER_CHUA_DANG_NHAP";
}

async function kiemTraQuanLy(db: D1Database, maNv: string, qlId: string | null | undefined): Promise<string | null> {
  if (!qlId) return null;
  if (qlId === maNv) return "QUAN_LY_LA_CHINH_MINH";
  const ql = await db.prepare("SELECT ma_nv FROM nhan_vien WHERE ma_nv = ? AND dang_lam_viec = 1").bind(qlId).first();
  return ql ? null : "QUAN_LY_NOT_FOUND";
}

nhanVien.post("/", requireRole("Admin", "HCNS"), async (c) => {
  const body = await c.req.json<Body>().catch(() => null);
  if (!body?.ma_nv?.trim() || !body?.ten_nv?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);

  const existing = await c.env.DB.prepare("SELECT ma_nv FROM nhan_vien WHERE ma_nv = ?").bind(body.ma_nv.trim()).first();
  if (existing) return c.json({ error: "MA_NV_EXISTS" }, 409);
  const loiQl = await kiemTraQuanLy(c.env.DB, body.ma_nv.trim(), body.quan_ly_id);
  if (loiQl) return c.json({ error: loiQl }, 400);
  const loiEmail = await kiemTraEmail(c.env.DB, body.email_dang_nhap);
  if (loiEmail) return c.json({ error: loiEmail }, 400);

  const stmts = [
    c.env.DB.prepare(
      `INSERT INTO nhan_vien (ma_nv, ten_nv, bo_phan, chuc_vu, sdt, email_dang_nhap, ghi_chu, quan_ly_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      body.ma_nv.trim(),
      body.ten_nv.trim(),
      body.bo_phan ?? null,
      body.chuc_vu ?? null,
      body.sdt ?? null,
      body.email_dang_nhap || null,
      body.ghi_chu ?? null,
      body.quan_ly_id || null,
    ),
  ];
  if (body.quan_ly_id) stmts.push(taoKhoQl(c.env.DB, body.quan_ly_id));
  await c.env.DB.batch(stmts);

  return c.json({ ok: true, ma_nv: body.ma_nv.trim() });
});

nhanVien.put("/:ma_nv", requireRole("Admin", "HCNS"), async (c) => {
  const maNv = c.req.param("ma_nv");
  const body = await c.req.json<Body>().catch(() => null);
  if (!body?.ten_nv?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);
  const loiQl = await kiemTraQuanLy(c.env.DB, maNv ?? "", body.quan_ly_id);
  if (loiQl) return c.json({ error: loiQl }, 400);
  const loiEmail = await kiemTraEmail(c.env.DB, body.email_dang_nhap);
  if (loiEmail) return c.json({ error: loiEmail }, 400);

  const stmts = [
    c.env.DB.prepare(
      `UPDATE nhan_vien SET ten_nv = ?, bo_phan = ?, chuc_vu = ?, sdt = ?, email_dang_nhap = ?, ghi_chu = ?,
           quan_ly_id = CASE WHEN ? = 1 THEN ? ELSE quan_ly_id END, updated_at = ?
       WHERE ma_nv = ?`,
    ).bind(
      body.ten_nv.trim(),
      body.bo_phan ?? null,
      body.chuc_vu ?? null,
      body.sdt ?? null,
      body.email_dang_nhap || null,
      body.ghi_chu ?? null,
      // quan_ly_id vang mat trong body = giu nguyen (client cu khong gui truong nay).
      body.quan_ly_id === undefined ? 0 : 1,
      body.quan_ly_id || null,
      nowVN(),
      maNv,
    ),
  ];
  if (body.quan_ly_id) stmts.push(taoKhoQl(c.env.DB, body.quan_ly_id));
  const [result] = await c.env.DB.batch(stmts);
  if ((result.meta.changes ?? 0) === 0) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json({ ok: true });
});

// DELETE /:ma_nv - danh dau nghi viec (dang_lam_viec=0). Chan neu con dang giu CCDC nao.
nhanVien.delete("/:ma_nv", requireRole("Admin", "HCNS"), async (c) => {
  const maNv = c.req.param("ma_nv");
  const holding = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM ccdc WHERE nguoi_dang_giu = ?").bind(maNv).first<{ n: number }>();
  if (holding && holding.n > 0) return c.json({ error: "DANG_GIU_CCDC" }, 400);

  await c.env.DB.prepare("UPDATE nhan_vien SET dang_lam_viec = 0, updated_at = ? WHERE ma_nv = ?").bind(nowVN(), maNv).run();
  return c.json({ ok: true });
});

export default nhanVien;
