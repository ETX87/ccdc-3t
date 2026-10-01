import { Hono, type Context } from "hono";
import type { AppUser, Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { nowVN } from "../lib/vnTime";
import { getKho, guardTonKhongAm, khoPhuTrach, laCapDuoi, laHcns, laKeToan, laThuKho, tonKho } from "../lib/quyen";
import { sinhMaPhieu, TIEN_TO_CHUYEN_KHO } from "../lib/maPhieu";
import { dkPhieuKho, layPhamVi, type PhamVi } from "../lib/phamVi";
import { docTrang, layTrang } from "../lib/phanTrang";

/** Phieu nguoi dung duoc xem: kho trong pham vi + phieu minh lap + phieu cap cho nhom minh (ban than/cap duoi). */
function dkXemPhieu(pv: PhamVi, email: string) {
  const k = dkPhieuKho(pv);
  if (pv.toanBo) return k;
  const nhom = pv.nhomMaNv.length ? " OR p.den_nhan_vien_id IN (SELECT value FROM json_each(?))" : "";
  return { sql: `(${k.sql} OR p.nguoi_lap = ?${nhom})`, binds: [...k.binds, email, ...(pv.nhomMaNv.length ? [JSON.stringify(pv.nhomMaNv)] : [])] };
}

// Phieu chuyen kho TAI SAN TIEU HAO (thay phieu_tieu_hao phang cu). Luong da chot voi user 2026-09-23:
//   Nhap mua   : kho Mua hang -> kho HCNS, HCNS lap, CHI buoc nay can Ke toan duyet.
//   Chuyen kho : kho -> kho, thu kho nguon lap -> 'Dang chuyen' (TRU nguon ngay) -> thu kho dich nhan
//                ('Da nhan', cong dich) hoac tu choi ('Bi tu choi', hoan nguon).
//   Cap phat NV: kho -> nhan vien (tieu hao het) -> 'Da giao' ngay; NV co tai khoan bam xac nhan.
// Quyen nguon/dich (IDOR): kho HCNS/Mien -> moi kho/moi NV; kho QL -> chi cap duoi truc tiep cua chu
// kho, hoac tra ve kho HCNS/Mien. Moi ghi nhieu bang qua db.batch() + chot chan ton khong am.
const phieuChuyenKho = new Hono<{ Bindings: Env }>();
phieuChuyenKho.use("*", verifySessionMiddleware, loadUser);

const LOAI = ["Nhap mua", "Chuyen kho", "Cap phat NV"] as const;
type Loai = (typeof LOAI)[number];

phieuChuyenKho.get("/", async (c) => {
  const user = c.get("user");
  const q = (k: string) => c.req.query(k);
  const pham = dkXemPhieu(await layPhamVi(c.env.DB, user), user.email);
  const conditions: string[] = [pham.sql];
  const binds: unknown[] = [...pham.binds];

  if (q("kho_id")) {
    conditions.push("(p.tu_kho_id = ? OR p.den_kho_id = ?)");
    binds.push(Number(q("kho_id")), Number(q("kho_id")));
  }
  if (q("loai")) {
    conditions.push("p.loai = ?");
    binds.push(q("loai"));
  }
  if (q("trang_thai")) {
    conditions.push("p.trang_thai = ?");
    binds.push(q("trang_thai"));
  }
  if (q("thang")) {
    conditions.push("substr(p.created_at, 1, 7) = ?");
    binds.push(q("thang"));
  }
  if (q("nhan_vien_id")) {
    conditions.push("p.den_nhan_vien_id = ?");
    binds.push(q("nhan_vien_id"));
  }
  if (q("vt_id")) {
    conditions.push("EXISTS (SELECT 1 FROM phieu_chuyen_kho_ct x WHERE x.phieu_id = p.id AND x.vt_id = ?)");
    binds.push(q("vt_id"));
  }
  // cho_toi_nhan=1: phieu Chuyen kho dang tren duong toi kho minh phu trach.
  if (q("cho_toi_nhan") === "1") {
    const ids = (await khoPhuTrach(c.env.DB, user)).map((k) => k.id);
    if (ids.length === 0) return c.json({ rows: [] });
    conditions.push(`p.trang_thai = 'Dang chuyen' AND p.den_kho_id IN (${ids.map(() => "?").join(",")})`);
    binds.push(...ids);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT p.id, p.ma_phieu, p.loai, p.tu_kho_id, kt.ten_kho AS tu_kho_ten, p.den_kho_id, kd.ten_kho AS den_kho_ten,
            p.den_nhan_vien_id, nv.ten_nv AS den_nhan_vien_ten, p.nguoi_nhan_ten_tu_do, p.nha_cung_cap,
            p.nguoi_lap, p.trang_thai, p.da_xac_nhan, p.ghi_chu, p.created_at,
            (SELECT COUNT(*) FROM phieu_chuyen_kho_ct ct WHERE ct.phieu_id = p.id) AS so_dong,
            (SELECT group_concat(v.ten_vt || ' x' || printf('%g', ct.so_luong), '; ') FROM phieu_chuyen_kho_ct ct
               JOIN vt_tieu_hao v ON v.id = ct.vt_id WHERE ct.phieu_id = p.id) AS tom_tat,
            (SELECT SUM(ct.thanh_tien) FROM phieu_chuyen_kho_ct ct WHERE ct.phieu_id = p.id) AS tong_tien
     FROM phieu_chuyen_kho p
     JOIN kho kt ON kt.id = p.tu_kho_id
     LEFT JOIN kho kd ON kd.id = p.den_kho_id
     LEFT JOIN nhan_vien nv ON nv.ma_nv = p.den_nhan_vien_id
     ${where}
     ORDER BY p.created_at DESC`;
  // ?page=N: 1 trang KICH_THUOC_TRANG dong (bang tren man hinh); khong co page: toi da `limit` dong
  // (xuat Excel / cac cho can ca danh sach).
  const trang = docTrang(c);
  if (trang) return c.json(await layTrang(c.env.DB, trang, { sql: `SELECT COUNT(*) AS n FROM phieu_chuyen_kho p ${where}`, binds }, { sql, binds }));
  const limit = Math.min(Number(q("limit") ?? 300) || 300, 5000);
  const { results } = await c.env.DB.prepare(`${sql} LIMIT ${limit}`)
    .bind(...binds)
    .all();
  return c.json({ rows: results });
});

// GET /thong-ke?thang=YYYY-MM&kho_id= - KPI man phieu tieu hao (cung pham vi voi danh sach): so phieu +
// gia tri theo loai trong thang (va thang truoc de so sanh), cho KT duyet, dang chuyen (qua han 48h).
phieuChuyenKho.get("/thong-ke", async (c) => {
  const user = c.get("user");
  const db = c.env.DB;
  const thang = /^\d{4}-\d{2}$/.test(c.req.query("thang") ?? "") ? c.req.query("thang")! : nowVN().slice(0, 7);
  const [y, m] = thang.split("-").map(Number);
  const thangTruoc = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const pham = dkXemPhieu(await layPhamVi(db, user), user.email);
  const khoId = Number(c.req.query("kho_id")) || null;
  const dk = `${pham.sql}${khoId ? " AND (p.tu_kho_id = ? OR p.den_kho_id = ?)" : ""}`;
  const b = [...pham.binds, ...(khoId ? [khoId, khoId] : [])];
  const moc = new Date(Date.now() + 7 * 3600e3 - 48 * 3600e3).toISOString().slice(0, 19).replace("T", " ");
  const [theoLoai, cho] = await db.batch<Record<string, number | string>>([
    db
      .prepare(
        `SELECT substr(p.created_at, 1, 7) AS thang, p.loai, COUNT(DISTINCT p.id) AS so_phieu,
                COALESCE(SUM(ct.so_luong), 0) AS so_luong, COALESCE(SUM(ct.thanh_tien), 0) AS gia_tri
         FROM phieu_chuyen_kho p JOIN phieu_chuyen_kho_ct ct ON ct.phieu_id = p.id
         WHERE substr(p.created_at, 1, 7) IN (?, ?) AND p.trang_thai NOT IN ('Ke toan tu choi', 'Bi tu choi') AND ${dk}
         GROUP BY 1, 2`,
      )
      .bind(thang, thangTruoc, ...b),
    db
      .prepare(
        `SELECT
           SUM(CASE WHEN p.trang_thai = 'Cho ke toan duyet' THEN 1 ELSE 0 END) AS cho_kt,
           COALESCE(SUM(CASE WHEN p.trang_thai = 'Cho ke toan duyet' THEN (SELECT SUM(ct.thanh_tien) FROM phieu_chuyen_kho_ct ct WHERE ct.phieu_id = p.id) END), 0) AS cho_kt_gt,
           SUM(CASE WHEN p.trang_thai = 'Dang chuyen' THEN 1 ELSE 0 END) AS dang_chuyen,
           SUM(CASE WHEN p.trang_thai = 'Dang chuyen' AND p.created_at < ? THEN 1 ELSE 0 END) AS dang_chuyen_qua_han,
           SUM(CASE WHEN p.loai = 'Cap phat NV' AND p.trang_thai = 'Da giao' AND p.da_xac_nhan = 0 AND p.den_nhan_vien_id IS NOT NULL THEN 1 ELSE 0 END) AS cho_nv_xac_nhan
         FROM phieu_chuyen_kho p WHERE ${dk}`,
      )
      .bind(moc, ...b),
  ]);
  return c.json({ thang, thang_truoc: thangTruoc, theo_loai: theoLoai.results, ...(cho.results[0] ?? {}) });
});

phieuChuyenKho.get("/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    `SELECT p.*, kt.ten_kho AS tu_kho_ten, kt.loai AS tu_kho_loai, kd.ten_kho AS den_kho_ten, nv.ten_nv AS den_nhan_vien_ten
     FROM phieu_chuyen_kho p
     JOIN kho kt ON kt.id = p.tu_kho_id
     LEFT JOIN kho kd ON kd.id = p.den_kho_id
     LEFT JOIN nhan_vien nv ON nv.ma_nv = p.den_nhan_vien_id
     WHERE p.id = ?`,
  )
    .bind(id)
    .first();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  const [{ results: items }, { results: log }] = await Promise.all([
    c.env.DB.prepare(
      `SELECT ct.id, ct.vt_id, v.ten_vt, v.don_vi_tinh, ct.so_luong, ct.don_gia, ct.thanh_tien
       FROM phieu_chuyen_kho_ct ct JOIN vt_tieu_hao v ON v.id = ct.vt_id WHERE ct.phieu_id = ?`,
    )
      .bind(id)
      .all(),
    c.env.DB.prepare(`SELECT trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu FROM phieu_chuyen_kho_log WHERE phieu_id = ? ORDER BY id ASC`)
      .bind(id)
      .all(),
  ]);
  return c.json({ row, items, log });
});

interface CreateItem {
  vt_id: string;
  so_luong: number;
  don_gia?: number | null;
}
interface CreateBody {
  loai?: Loai;
  tu_kho_id?: number;
  den_kho_id?: number | null;
  den_nhan_vien_id?: string | null;
  nguoi_nhan_ten_tu_do?: string | null;
  nha_cung_cap?: string | null;
  ghi_chu?: string | null;
  items?: CreateItem[];
}

type Loi = { error: string; [k: string]: unknown };

// Kiem tra nguon/dich + quyen theo loai phieu. Tra ve trang thai khoi tao, hoac loi.
async function kiemTraTao(db: D1Database, user: AppUser, body: CreateBody): Promise<{ trangThai: string } | Loi> {
  const tu = await getKho(db, Number(body.tu_kho_id));
  if (!tu || !tu.bat_tat) return { error: "TU_KHO_NOT_FOUND" };
  if (!(await laThuKho(db, user, tu.id))) return { error: "KHONG_PHU_TRACH_KHO_NGUON" };

  if (body.loai === "Nhap mua") {
    if (!laHcns(user)) return { error: "CHI_HCNS_NHAP_MUA" };
    if (tu.loai !== "Mua hang") return { error: "NHAP_MUA_PHAI_TU_KHO_MUA" };
    const den = await getKho(db, Number(body.den_kho_id));
    if (!den || !den.bat_tat || den.loai !== "HCNS") return { error: "NHAP_MUA_PHAI_VAO_KHO_HCNS" };
    return { trangThai: "Cho ke toan duyet" };
  }

  if (tu.loai === "Mua hang") return { error: "KHO_MUA_CHI_NHAP_MUA" };

  if (body.loai === "Chuyen kho") {
    const den = await getKho(db, Number(body.den_kho_id));
    if (!den || !den.bat_tat) return { error: "DEN_KHO_NOT_FOUND" };
    if (den.id === tu.id) return { error: "TRUNG_KHO" };
    if (den.loai === "Mua hang") return { error: "KHONG_CHUYEN_VE_KHO_MUA" };
    // Kho QL chi tra nguoc ve HCNS/Mien, khong chuyen ngang sang kho QL khac.
    if (tu.loai === "Quan ly" && den.loai === "Quan ly") return { error: "QL_KHONG_CHUYEN_SANG_KHO_QL_KHAC" };
    return { trangThai: "Dang chuyen" };
  }

  // Cap phat NV
  const coNv = !!body.den_nhan_vien_id;
  const coTuDo = !!body.nguoi_nhan_ten_tu_do?.trim();
  if (coNv === coTuDo) return { error: "CHON_1_NGUOI_NHAN" };
  if (coNv) {
    const nv = await db.prepare("SELECT ma_nv FROM nhan_vien WHERE ma_nv = ? AND dang_lam_viec = 1").bind(body.den_nhan_vien_id).first();
    if (!nv) return { error: "NHAN_VIEN_NOT_FOUND" };
  }
  if (tu.loai === "Quan ly") {
    // QL chi phat cho cap duoi truc tiep cua chu kho (hoac chinh QL) - ten tu do khong kiem chung
    // duoc thuoc nhom nen khong cho.
    if (!coNv) return { error: "QL_KHONG_DUNG_TEN_TU_DO" };
    const chuKho = tu.nhan_vien_id!;
    if (body.den_nhan_vien_id !== chuKho && !(await laCapDuoi(db, chuKho, body.den_nhan_vien_id!))) {
      return { error: "NGOAI_NHOM_QUAN_LY" };
    }
  }
  return { trangThai: "Da giao" };
}

phieuChuyenKho.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<CreateBody>().catch(() => null);
  if (!body?.loai || !LOAI.includes(body.loai) || !body.tu_kho_id || !body.items?.length) return c.json({ error: "MISSING_FIELDS" }, 400);
  for (const it of body.items) {
    if (!it.vt_id || !(Number(it.so_luong) > 0)) return c.json({ error: "SO_LUONG_KHONG_HOP_LE", vt_id: it.vt_id }, 400);
  }

  const kt = await kiemTraTao(c.env.DB, user, body);
  if ("error" in kt) return c.json(kt, kt.error.startsWith("KHONG_PHU_TRACH") || kt.error.startsWith("CHI_") || kt.error === "NGOAI_NHOM_QUAN_LY" ? 403 : 400);

  const vtIds = [...new Set(body.items.map((i) => i.vt_id))];
  const { results: vts } = await c.env.DB.prepare(
    `SELECT id FROM vt_tieu_hao WHERE vo_hieu_hoa = 0 AND id IN (${vtIds.map(() => "?").join(",")})`,
  )
    .bind(...vtIds)
    .all<{ id: string }>();
  if (vts.length !== vtIds.length) return c.json({ error: "VT_NOT_FOUND" }, 400);

  const truTon = kt.trangThai !== "Cho ke toan duyet";
  // Kiem tra truoc de tra loi ro rang (vat tu nao thieu, ton bao nhieu); chot chan trong batch lo
  // truong hop 2 phieu lap cung luc.
  if (truTon) {
    const canXuat = new Map<string, number>();
    for (const it of body.items) canXuat.set(it.vt_id, (canXuat.get(it.vt_id) ?? 0) + Number(it.so_luong));
    for (const [vtId, sl] of canXuat) {
      const ton = await tonKho(c.env.DB, body.tu_kho_id, vtId);
      if (ton < sl) return c.json({ error: "VUOT_TON", vt_id: vtId, ton, can_xuat: sl }, 400);
    }
  }

  const id = crypto.randomUUID();
  const ngay = nowVN();
  const db = c.env.DB;
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO phieu_chuyen_kho (id, loai, tu_kho_id, den_kho_id, den_nhan_vien_id, nguoi_nhan_ten_tu_do, nha_cung_cap,
                                       nguoi_lap, trang_thai, ghi_chu, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        body.loai,
        body.tu_kho_id,
        body.loai === "Cap phat NV" ? null : body.den_kho_id,
        body.loai === "Cap phat NV" ? (body.den_nhan_vien_id ?? null) : null,
        body.loai === "Cap phat NV" ? body.nguoi_nhan_ten_tu_do?.trim() || null : null,
        body.loai === "Nhap mua" ? body.nha_cung_cap?.trim() || null : null,
        user.email,
        kt.trangThai,
        body.ghi_chu ?? null,
        ngay,
        ngay,
      ),
    ...body.items.map((it) => {
      const donGia = it.don_gia ?? null;
      return db
        .prepare(`INSERT INTO phieu_chuyen_kho_ct (phieu_id, vt_id, so_luong, don_gia, thanh_tien) VALUES (?, ?, ?, ?, ?)`)
        .bind(id, it.vt_id, Number(it.so_luong), donGia, donGia != null ? donGia * Number(it.so_luong) : null);
    }),
    db
      .prepare(`INSERT INTO phieu_chuyen_kho_log (phieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)`)
      .bind(id, kt.trangThai, user.email, ngay, body.ghi_chu ?? null),
    ...sinhMaPhieu(db, "phieu_chuyen_kho", id, TIEN_TO_CHUYEN_KHO[body.loai], ngay),
  ];
  if (truTon) stmts.push(...guardTonKhongAm(db, body.tu_kho_id, vtIds));

  try {
    await db.batch(stmts);
  } catch (e) {
    if (String(e).includes("CHECK constraint failed")) return c.json({ error: "VUOT_TON" }, 409);
    throw e;
  }
  return c.json({ ok: true, id, trang_thai: kt.trangThai });
});

interface PhieuRow {
  id: string;
  loai: Loai;
  tu_kho_id: number;
  den_kho_id: number | null;
  den_nhan_vien_id: string | null;
  trang_thai: string;
}

async function doiTrangThai(c: Context<{ Bindings: Env }>, phieu: PhieuRow, from: string, to: string, ghiChu: string | null) {
  const user = c.get("user");
  const ngay = nowVN();
  const [upd] = await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE phieu_chuyen_kho SET trang_thai = ?, updated_at = ? WHERE id = ? AND trang_thai = ?`).bind(to, ngay, phieu.id, from),
    c.env.DB.prepare(
      `INSERT INTO phieu_chuyen_kho_log (phieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu)
       SELECT ?, ?, ?, ?, ? WHERE changes() = 1`,
    ).bind(phieu.id, to, user.email, ngay, ghiChu),
  ]);
  if ((upd.meta.changes ?? 0) === 0) return c.json({ error: "SAI_TRANG_THAI" }, 409);
  return c.json({ ok: true });
}

async function layPhieu(c: Context<{ Bindings: Env }>) {
  return c.env.DB.prepare("SELECT id, loai, tu_kho_id, den_kho_id, den_nhan_vien_id, trang_thai FROM phieu_chuyen_kho WHERE id = ?")
    .bind(c.req.param("id"))
    .first<PhieuRow>();
}

async function docGhiChu(c: Context<{ Bindings: Env }>): Promise<string | null> {
  const b = await c.req.json<{ ghi_chu?: string }>().catch(() => ({}) as { ghi_chu?: string });
  return b.ghi_chu?.trim() || null;
}

// Ke toan duyet / tu choi phieu Nhap mua.
phieuChuyenKho.post("/:id/ke-toan-duyet", async (c) => {
  if (!laKeToan(c.get("user"))) return c.json({ error: "CHI_KE_TOAN" }, 403);
  const p = await layPhieu(c);
  if (!p) return c.json({ error: "NOT_FOUND" }, 404);
  if (p.loai !== "Nhap mua" || p.trang_thai !== "Cho ke toan duyet") return c.json({ error: "SAI_TRANG_THAI" }, 409);
  return doiTrangThai(c, p, "Cho ke toan duyet", "Da nhan", await docGhiChu(c));
});

phieuChuyenKho.post("/:id/ke-toan-tu-choi", async (c) => {
  if (!laKeToan(c.get("user"))) return c.json({ error: "CHI_KE_TOAN" }, 403);
  const ghiChu = await docGhiChu(c);
  if (!ghiChu) return c.json({ error: "CAN_LY_DO" }, 400);
  const p = await layPhieu(c);
  if (!p) return c.json({ error: "NOT_FOUND" }, 404);
  if (p.loai !== "Nhap mua" || p.trang_thai !== "Cho ke toan duyet") return c.json({ error: "SAI_TRANG_THAI" }, 409);
  return doiTrangThai(c, p, "Cho ke toan duyet", "Ke toan tu choi", ghiChu);
});

// Thu kho dich xac nhan da nhan du hang. Thu kho NGUON duoc "xac nhan ho" (vd kho QL chua co tai
// khoan) nhung BAT BUOC ghi chu - log luu dung nguoi bam.
phieuChuyenKho.post("/:id/nhan", async (c) => {
  const user = c.get("user");
  const ghiChu = await docGhiChu(c);
  const p = await layPhieu(c);
  if (!p) return c.json({ error: "NOT_FOUND" }, 404);
  if (p.loai !== "Chuyen kho" || p.trang_thai !== "Dang chuyen") return c.json({ error: "SAI_TRANG_THAI" }, 409);
  const laDich = await laThuKho(c.env.DB, user, p.den_kho_id!);
  if (!laDich) {
    if (!(await laThuKho(c.env.DB, user, p.tu_kho_id))) return c.json({ error: "KHONG_PHU_TRACH_KHO_DICH" }, 403);
    if (!ghiChu) return c.json({ error: "XAC_NHAN_HO_CAN_GHI_CHU" }, 400);
  }
  return doiTrangThai(c, p, "Dang chuyen", "Da nhan", laDich ? ghiChu : `[Xác nhận hộ] ${ghiChu}`);
});

phieuChuyenKho.post("/:id/tu-choi-nhan", async (c) => {
  const user = c.get("user");
  const ghiChu = await docGhiChu(c);
  if (!ghiChu) return c.json({ error: "CAN_LY_DO" }, 400);
  const p = await layPhieu(c);
  if (!p) return c.json({ error: "NOT_FOUND" }, 404);
  if (p.loai !== "Chuyen kho" || p.trang_thai !== "Dang chuyen") return c.json({ error: "SAI_TRANG_THAI" }, 409);
  if (!(await laThuKho(c.env.DB, user, p.den_kho_id!))) return c.json({ error: "KHONG_PHU_TRACH_KHO_DICH" }, 403);
  return doiTrangThai(c, p, "Dang chuyen", "Bi tu choi", ghiChu);
});

// NV nhan hang tieu hao bam xac nhan (chi dung chu phieu - chong IDOR).
phieuChuyenKho.post("/:id/xac-nhan", async (c) => {
  const user = c.get("user");
  const p = await layPhieu(c);
  if (!p) return c.json({ error: "NOT_FOUND" }, 404);
  if (p.loai !== "Cap phat NV" || !user.ma_nv || p.den_nhan_vien_id !== user.ma_nv) return c.json({ error: "FORBIDDEN" }, 403);
  const ngay = nowVN();
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE phieu_chuyen_kho SET da_xac_nhan = 1, xac_nhan_luc = ?, updated_at = ? WHERE id = ?`).bind(ngay, ngay, p.id),
    c.env.DB.prepare(
      `INSERT INTO phieu_chuyen_kho_log (phieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Da giao', ?, ?, 'Nhân viên xác nhận đã nhận')`,
    ).bind(p.id, user.email, ngay),
  ]);
  return c.json({ ok: true });
});

export default phieuChuyenKho;
