import { Hono, type Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { nowVN } from "../lib/vnTime";
import { khoPhuTrach, laHcns } from "../lib/quyen";
import { dkTaiSan, layPhamVi } from "../lib/phamVi";
import { sinhMaPhieu } from "../lib/maPhieu";

const ccdc = new Hono<{ Bindings: Env }>();
ccdc.use("*", verifySessionMiddleware, loadUser);

// Dieu kien loc dung chung cho danh sach + thong ke. Pham vi: quan tri + thu kho kho HCNS/mien (dieu
// chuyen TS cua moi nhan vien) xem moi tai san; thu kho/QL khac chi kho + nhom minh; nhan vien chi TS
// minh giu (truoc day route nay khong loc -> nhan vien liet ke duoc toan bo tai san cong ty).
async function dieuKienLoc(c: Context<{ Bindings: Env }>, boTrangThai = false) {
  const q = (k: string) => c.req.query(k)?.trim() || undefined;
  const conditions = ["c.vo_hieu_hoa = 0"];
  const binds: unknown[] = [];
  const user = c.get("user");
  const pv = await layPhamVi(c.env.DB, user);
  const moiTaiSan = pv.toanBo || (await khoPhuTrach(c.env.DB, user)).some((k) => k.loai === "HCNS" || k.loai === "Mien");
  if (!moiTaiSan) {
    const dk = dkTaiSan(pv);
    conditions.push(dk.sql);
    binds.push(...dk.binds);
  }
  if (q("nhom_id")) {
    conditions.push("c.nhom_id = ?");
    binds.push(Number(q("nhom_id")));
  }
  if (q("trang_thai") && !boTrangThai) {
    conditions.push("c.trang_thai_hien_tai = ?");
    binds.push(q("trang_thai"));
  }
  if (q("kho_id")) {
    conditions.push("c.kho_id = ?");
    binds.push(Number(q("kho_id")));
  }
  if (q("nguoi_dang_giu")) {
    conditions.push("c.nguoi_dang_giu = ?");
    binds.push(q("nguoi_dang_giu"));
  }
  // Nhan ca "q" (giao dien moi) lan "search" (ten tham so cu).
  const search = q("q") ?? q("search");
  if (search) {
    conditions.push("(LOWER(c.id) LIKE LOWER(?) OR LOWER(c.ten_ccdc) LIKE LOWER(?) OR LOWER(COALESCE(c.so_seri,'')) LIKE LOWER(?))");
    binds.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  return { where: conditions.join(" AND "), binds };
}

// GET /?nhom_id=&trang_thai=&kho_id=&nguoi_dang_giu=&q= - danh sach tai san co dinh (chua vo hieu hoa).
ccdc.get("/", async (c) => {
  const { where, binds } = await dieuKienLoc(c);
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.ten_ccdc, c.nhom_id, n.ten_nhom, c.don_vi_tinh, c.so_seri, c.ngay_mua,
            c.nguyen_gia, c.nha_cung_cap, c.han_bao_hanh, c.tinh_trang, c.trang_thai_hien_tai,
            c.nguoi_dang_giu, nv.ten_nv AS nguoi_dang_giu_ten, c.kho_id, k.ten_kho, c.anh_url, c.ghi_chu
     FROM ccdc c
     LEFT JOIN nhom_ccdc n ON n.id = c.nhom_id
     LEFT JOIN nhan_vien nv ON nv.ma_nv = c.nguoi_dang_giu
     LEFT JOIN kho k ON k.id = c.kho_id
     WHERE ${where}
     ORDER BY c.created_at DESC`,
  )
    .bind(...binds)
    .all();
  return c.json({ rows: results });
});

// GET /thong-ke - so luong + nguyen gia theo trang thai voi CUNG bo loc danh sach (bo qua trang_thai de
// the KPI / tab dem dung tren toan bo ket qua loc).
ccdc.get("/thong-ke", async (c) => {
  const { where, binds } = await dieuKienLoc(c, true);
  const { results } = await c.env.DB.prepare(
    `SELECT c.trang_thai_hien_tai AS trang_thai, COUNT(*) AS so_luong, COALESCE(SUM(c.nguyen_gia), 0) AS gia_tri
     FROM ccdc c WHERE ${where} GROUP BY c.trang_thai_hien_tai`,
  )
    .bind(...binds)
    .all<{ trang_thai: string; so_luong: number; gia_tri: number }>();
  const cho = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT x.id) AS n FROM phieu_xu_ly_ts x JOIN phieu_xu_ly_ts_ct ct ON ct.phieu_id = x.id JOIN ccdc c ON c.id = ct.ccdc_id
     WHERE x.trang_thai = 'Cho ke toan duyet' AND x.loai = 'Bao hong' AND ${where}`,
  )
    .bind(...binds)
    .first<{ n: number }>();
  return c.json({ theo_trang_thai: results, bao_hong_cho_duyet: cho?.n ?? 0 });
});

ccdc.get("/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    `SELECT c.*, n.ten_nhom, nv.ten_nv AS nguoi_dang_giu_ten, k.ten_kho
     FROM ccdc c
     LEFT JOIN nhom_ccdc n ON n.id = c.nhom_id
     LEFT JOIN nhan_vien nv ON nv.ma_nv = c.nguoi_dang_giu
     LEFT JOIN kho k ON k.id = c.kho_id
     WHERE c.id = ?`,
  )
    .bind(id)
    .first();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);

  const { results: lichSu } = await c.env.DB.prepare(
    `SELECT p.id AS phieu_id, p.ma_phieu, p.loai_phieu, p.ngay_lap, p.nguoi_lap, p.nhan_vien_id,
            nv.ten_nv AS nhan_vien_ten, p.nhan_vien_nhan_moi_id, nv2.ten_nv AS nhan_vien_nhan_moi_ten,
            kt.ten_kho AS tu_kho_ten, kd.ten_kho AS den_kho_ten,
            ct.tinh_trang_ghi_nhan, ct.ghi_chu
     FROM phieu_giao_nhan_ct ct
     JOIN phieu_giao_nhan p ON p.id = ct.phieu_id
     LEFT JOIN nhan_vien nv ON nv.ma_nv = p.nhan_vien_id
     LEFT JOIN nhan_vien nv2 ON nv2.ma_nv = p.nhan_vien_nhan_moi_id
     LEFT JOIN kho kt ON kt.id = p.tu_kho_id
     LEFT JOIN kho kd ON kd.id = p.den_kho_id
     WHERE ct.ccdc_id = ?
     ORDER BY p.ngay_lap DESC`,
  )
    .bind(id)
    .all();

  // Lich su phieu Ke toan duyet (nhap mua / bao hong / thanh ly / tieu huy) cua TS nay.
  const { results: xuLy } = await c.env.DB.prepare(
    `SELECT p.id AS phieu_id, p.ma_phieu, p.loai, p.trang_thai, p.ly_do, p.ngay_de_xuat, p.nguoi_de_xuat
     FROM phieu_xu_ly_ts_ct ct JOIN phieu_xu_ly_ts p ON p.id = ct.phieu_id
     WHERE ct.ccdc_id = ? ORDER BY p.ngay_de_xuat DESC`,
  )
    .bind(id)
    .all();

  return c.json({ row, lich_su: lichSu, xu_ly: xuLy });
});

interface Body {
  id?: string;
  ten_ccdc?: string;
  nhom_id?: number | null;
  don_vi_tinh?: string | null;
  so_seri?: string | null;
  ngay_mua?: string | null;
  nguyen_gia?: number | null;
  nha_cung_cap?: string | null;
  han_bao_hanh?: string | null;
  tinh_trang?: string | null;
  anh_url?: string | null;
  ghi_chu?: string | null;
}

ccdc.post("/", requireRole("Admin", "HCNS"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<Body>().catch(() => null);
  if (!body?.id?.trim() || !body?.ten_ccdc?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);

  const existing = await c.env.DB.prepare("SELECT id FROM ccdc WHERE id = ?").bind(body.id.trim()).first();
  if (existing) return c.json({ error: "ID_EXISTS" }, 409);

  // TS moi = hang nhap tu kho mua -> 'Cho duyet nhap' + tu sinh phieu Nhap mua cho Ke toan duyet
  // (quyet dinh user 2026-09-23). Ke toan duyet xong TS moi vao kho HCNS.
  const ngay = nowVN();
  const phieuId = crypto.randomUUID();
  const db = c.env.DB;
  await db.batch([
    db.prepare(
    `INSERT INTO ccdc (id, ten_ccdc, nhom_id, don_vi_tinh, so_seri, ngay_mua, nguyen_gia,
                        nha_cung_cap, han_bao_hanh, tinh_trang, anh_url, ghi_chu, nguoi_tao, trang_thai_hien_tai)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Cho duyet nhap')`,
  )
    .bind(
      body.id.trim(),
      body.ten_ccdc.trim(),
      body.nhom_id ?? null,
      body.don_vi_tinh ?? null,
      body.so_seri ?? null,
      body.ngay_mua ?? null,
      body.nguyen_gia ?? null,
      body.nha_cung_cap ?? null,
      body.han_bao_hanh ?? null,
      body.tinh_trang ?? "Tot",
      body.anh_url ?? null,
      body.ghi_chu ?? null,
      user.email,
    ),
    db
      .prepare(`INSERT INTO phieu_xu_ly_ts (id, loai, ly_do, ngay_de_xuat, nguoi_de_xuat, created_at) VALUES (?, 'Nhap mua', ?, ?, ?, ?)`)
      .bind(phieuId, body.nha_cung_cap ? `Nhập mua từ ${body.nha_cung_cap}` : "Nhập mua", ngay, user.email, ngay),
    db
      .prepare(`INSERT INTO phieu_xu_ly_ts_ct (phieu_id, ccdc_id, trang_thai_truoc) VALUES (?, ?, 'Cho duyet nhap')`)
      .bind(phieuId, body.id.trim()),
    db
      .prepare(`INSERT INTO phieu_xu_ly_ts_log (phieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly) VALUES (?, 'Cho ke toan duyet', ?, ?)`)
      .bind(phieuId, user.email, ngay),
    ...sinhMaPhieu(db, "phieu_xu_ly_ts", phieuId, "NT", ngay),
  ]);

  return c.json({ ok: true, id: body.id.trim(), phieu_id: phieuId });
});

ccdc.put("/:id", requireRole("Admin", "HCNS"), async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<Body>().catch(() => null);
  if (!body?.ten_ccdc?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);

  const result = await c.env.DB.prepare(
    `UPDATE ccdc SET ten_ccdc = ?, nhom_id = ?, don_vi_tinh = ?, so_seri = ?, ngay_mua = ?,
                      nguyen_gia = ?, nha_cung_cap = ?, han_bao_hanh = ?, tinh_trang = ?,
                      anh_url = ?, ghi_chu = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      body.ten_ccdc.trim(),
      body.nhom_id ?? null,
      body.don_vi_tinh ?? null,
      body.so_seri ?? null,
      body.ngay_mua ?? null,
      body.nguyen_gia ?? null,
      body.nha_cung_cap ?? null,
      body.han_bao_hanh ?? null,
      body.tinh_trang ?? "Tot",
      body.anh_url ?? null,
      body.ghi_chu ?? null,
      nowVN(),
      id,
    )
    .run();
  if ((result.meta.changes ?? 0) === 0) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json({ ok: true });
});

// DELETE /:id - vo hieu hoa (soft-delete). Chan neu CCDC dang duoc cap phat (co nguoi giu) - phai
// thu hoi truoc khi vo hieu hoa, tranh mat dau vet CCDC dang o ngoai.
ccdc.delete("/:id", requireRole("Admin", "HCNS"), async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT trang_thai_hien_tai FROM ccdc WHERE id = ?").bind(id).first<{ trang_thai_hien_tai: string }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  if (row.trang_thai_hien_tai === "Dang cap phat") return c.json({ error: "DANG_CAP_PHAT" }, 400);
  if (row.trang_thai_hien_tai.startsWith("Cho ")) return c.json({ error: "DANG_CHO_DUYET" }, 400);

  await c.env.DB.prepare("UPDATE ccdc SET vo_hieu_hoa = 1, updated_at = ? WHERE id = ?").bind(nowVN(), id).run();
  return c.json({ ok: true });
});

// POST /:id/sua-xong - HCNS dua TS 'Hong' (da bao hong, KT duyet) tro lai su dung sau khi sua.
ccdc.post("/:id/sua-xong", async (c) => {
  const user = c.get("user");
  if (!laHcns(user)) return c.json({ error: "CHI_HCNS" }, 403);
  const id = c.req.param("id");
  const ngay = nowVN();
  const r = await c.env.DB.prepare(
    `UPDATE ccdc SET trang_thai_hien_tai = 'Trong kho', tinh_trang = 'Tot',
            ghi_chu = TRIM(COALESCE(ghi_chu, '') || char(10) || ?), updated_at = ?
     WHERE id = ? AND trang_thai_hien_tai = 'Hong'`,
  )
    .bind(`[${ngay}] Sửa xong, đưa lại sử dụng - ${user.email}`, ngay, id)
    .run();
  if ((r.meta.changes ?? 0) === 0) return c.json({ error: "SAI_TRANG_THAI" }, 409);
  return c.json({ ok: true });
});

export default ccdc;
