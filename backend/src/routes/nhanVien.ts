import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { nowVN } from "../lib/vnTime";
import { docTrang, layTrang } from "../lib/phanTrang";
import { LoiGop, lapKeHoach, lenhThucHien, type GiuEmail, type YeuCau } from "../lib/gopNhanVien";

// Bo dau + viet thuong de so khop ten tieng Viet (khong phan biet hoa/thuong, dau).
function boDau(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u0111/gi, "d").toLowerCase().trim();
}

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

  const sql = `SELECT n.ma_nv, n.ten_nv, n.bo_phan, n.chuc_vu, n.sdt, n.email_dang_nhap, n.dang_lam_viec, n.ma_etx,
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

// (Dang ky TRUOC "/:ma_nv" - Hono khop theo thu tu, "/:ma_nv" se nuot "/etx".)
// GET /etx?search= - tra danh ba ETX day du (ca nguoi da nghi) + ho so CCDC dang giu ma do.
nhanVien.get("/etx", requireRole("Admin", "HCNS"), async (c) => {
  const q = boDau(c.req.query("search") ?? "");
  if (q.length < 2) return c.json({ rows: [] });
  // Loc o JS (khong dung LIKE): LIKE cua SQLite phan biet hoa/thuong voi chu co dau ("Bình An" != "BÌNH AN").
  // Danh ba ~3.600 dong - doc het moi lan tra van nhe.
  const { results } = await c.env.DB.prepare(
    `SELECT e.ma_nhan_su, e.ho_ten, e.chuc_danh, e.gmail, e.trang_thai_lam_viec, n.ma_nv AS ho_so_ma_nv, n.ten_nv AS ho_so_ten
     FROM etx_nhan_su e LEFT JOIN nhan_vien n ON n.ma_etx = e.ma_nhan_su`,
  ).all<{ ma_nhan_su: string; ho_ten: string; gmail: string | null; trang_thai_lam_viec: string }>();
  const rows = results
    .filter((e) => boDau(e.ma_nhan_su) === q || boDau(e.ho_ten).includes(q) || boDau(e.gmail ?? "").includes(q))
    .sort((a, b) => (a.trang_thai_lam_viec === b.trang_thai_lam_viec ? a.ho_ten.localeCompare(b.ho_ten, "vi") : a.trang_thai_lam_viec === "on" ? -1 : 1))
    .slice(0, 20);
  return c.json({ rows });
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

// email_dang_nhap co FK users(email) - bao loi ro rang thay vi de FK loi 500. 1 tai khoan chi gan 1 ho so
// dang lam viec (user chot 2026-10-01: "1 nhan su chi co 1 tai khoan").
async function kiemTraEmail(db: D1Database, email: string | null | undefined, maNv?: string): Promise<string | null> {
  if (!email) return null;
  const u = await db.prepare("SELECT email FROM users WHERE email = ?").bind(email).first();
  if (!u) return "USER_CHUA_DANG_NHAP";
  const khac = await db
    .prepare("SELECT 1 FROM nhan_vien WHERE LOWER(email_dang_nhap) = LOWER(?) AND ma_nv != ? AND dang_lam_viec = 1 LIMIT 1")
    .bind(email, maNv ?? "")
    .first();
  return khac ? "EMAIL_DA_LIEN_KET" : null;
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
  const loiEmail = await kiemTraEmail(c.env.DB, body.email_dang_nhap, body.ma_nv.trim());
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
  const loiEmail = await kiemTraEmail(c.env.DB, body.email_dang_nhap, maNv);
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

// POST /:ma_nv/lien-ket-tai-khoan { email } - CHI gan email_dang_nhap (khong dung PUT ghi de ca ho so).
// Dung o "Tai san cua toi" khi Admin/HCNS chua lien ket ho so cua chinh minh. Khong ghi de lien ket san
// co: ho so da gan email khac / email da gan ho so dang lam viec khac -> 409.
nhanVien.post("/:ma_nv/lien-ket-tai-khoan", requireRole("Admin", "HCNS"), async (c) => {
  const maNv = c.req.param("ma_nv");
  const body = await c.req.json<{ email?: string }>().catch(() => null);
  const email = body?.email?.trim().toLowerCase();
  if (!email) return c.json({ error: "MISSING_FIELDS" }, 400);
  const loiEmail = await kiemTraEmail(c.env.DB, email);
  if (loiEmail) return c.json({ error: loiEmail }, 400);

  const [nv, khac] = await Promise.all([
    c.env.DB.prepare("SELECT email_dang_nhap, dang_lam_viec FROM nhan_vien WHERE ma_nv = ?")
      .bind(maNv)
      .first<{ email_dang_nhap: string | null; dang_lam_viec: number }>(),
    c.env.DB.prepare("SELECT ma_nv FROM nhan_vien WHERE LOWER(email_dang_nhap) = ? AND ma_nv != ? AND dang_lam_viec = 1 LIMIT 1")
      .bind(email, maNv)
      .first<{ ma_nv: string }>(),
  ]);
  if (!nv) return c.json({ error: "NOT_FOUND" }, 404);
  if (!nv.dang_lam_viec) return c.json({ error: "HO_SO_DA_NGHI" }, 400);
  if (nv.email_dang_nhap && nv.email_dang_nhap.toLowerCase() !== email) return c.json({ error: "HO_SO_DA_LIEN_KET" }, 409);
  if (khac) return c.json({ error: "EMAIL_DA_LIEN_KET", ma_nv: khac.ma_nv }, 409);

  await c.env.DB.prepare("UPDATE nhan_vien SET email_dang_nhap = ?, updated_at = ? WHERE ma_nv = ?").bind(email, nowVN(), maNv).run();
  return c.json({ ok: true });
});

// ---- Doi ma / gop ho so / gan ma ETX chuan (lib/gopNhanVien.ts) ------------------------------------------
function docYeuCau(body: { loai?: string; dich?: string; ma_moi?: string; ma_etx?: string } | null): YeuCau | null {
  if (body?.loai === "gop" && body.dich) return { loai: "gop", dich: body.dich };
  if (body?.loai === "doi-ma" && body.ma_moi) return { loai: "doi-ma", maMoi: body.ma_moi };
  if (body?.loai === "gan-etx" && body.ma_etx) return { loai: "gan-etx", maEtx: body.ma_etx };
  return null;
}

// POST /:ma_nv/doi-ma { loai: gop|doi-ma|gan-etx, dich|ma_moi|ma_etx, giu_email?: dich|nguon, xem_truoc?: true }
// xem_truoc -> tra ke hoach (so tai san / phieu / kho se chuyen, canh bao), khong ghi gi.
nhanVien.post("/:ma_nv/doi-ma", requireRole("Admin", "HCNS"), async (c) => {
  const body = await c.req.json<{ loai?: string; dich?: string; ma_moi?: string; ma_etx?: string; giu_email?: GiuEmail; xem_truoc?: boolean }>().catch(() => null);
  const yc = docYeuCau(body);
  if (!yc) return c.json({ error: "MISSING_FIELDS" }, 400);
  try {
    const k = await lapKeHoach(c.env.DB, c.req.param("ma_nv") ?? "", yc, body?.giu_email === "nguon" ? "nguon" : "dich");
    if (body?.xem_truoc) return c.json({ ke_hoach: k });
    try {
      await c.env.DB.batch(lenhThucHien(c.env.DB, k, c.get("user").email));
    } catch (e) {
      if (String(e).includes("CHECK constraint failed")) return c.json({ error: "DU_LIEU_DA_DOI" }, 409);
      throw e;
    }
    return c.json({ ok: true, ma_dich: k.maDich });
  } catch (e) {
    if (e instanceof LoiGop) return c.json({ error: e.code, ...e.extra }, e.code === "NOT_FOUND" ? 404 : 400);
    throw e;
  }
});

// GET /:ma_nv/lich-su-ma - nhat ky doi ma / gop lien quan ho so nay (ca ma cu da gop vao).
nhanVien.get("/:ma_nv/lich-su-ma", async (c) => {
  const ma = c.req.param("ma_nv");
  const { results } = await c.env.DB.prepare(
    `SELECT id, thao_tac, ma_nguon, ten_nguon, ma_dich, ma_etx, chi_tiet, nguoi_thuc_hien, created_at
     FROM nhan_vien_lich_su_ma WHERE ma_nguon = ?1 OR ma_dich = ?1 ORDER BY id DESC LIMIT 50`,
  )
    .bind(ma)
    .all();
  return c.json({ rows: results });
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
