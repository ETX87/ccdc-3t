import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { formatVNFromMs, nowVN } from "../lib/vnTime";
import { getKho, khoPhuTrach, laHcns, type LoaiKho } from "../lib/quyen";
import { layPhamVi } from "../lib/phamVi";

// Danh muc kho (chuoi KHO MUA -> HCNS -> MIEN -> QL) + gan thu kho. Kho QL thuong duoc tao tu dong
// khi gan quan ly truc tiep cho nhan vien (routes/nhanVien.ts), van tao tay duoc o day.
const kho = new Hono<{ Bindings: Env }>();
kho.use("*", verifySessionMiddleware, loadUser);

const LOAI_HOP_LE: LoaiKho[] = ["Mua hang", "HCNS", "Mien", "Quan ly", "Tieu hao"];

// Danh sach kho cac cong ty dang xem (bo loc cong ty tren topbar).
kho.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT k.id, k.ten_kho, k.loai, k.nhan_vien_id, nv.ten_nv AS nhan_vien_ten, k.bat_tat, k.ghi_chu, k.cong_ty_id, ct.ma AS cong_ty_ma,
            (SELECT group_concat(t.email, ',') FROM kho_thu_kho t WHERE t.kho_id = k.id) AS thu_kho
     FROM kho k LEFT JOIN nhan_vien nv ON nv.ma_nv = k.nhan_vien_id JOIN cong_ty ct ON ct.id = k.cong_ty_id
     WHERE k.cong_ty_id IN (SELECT value FROM json_each(?))
     ORDER BY k.cong_ty_id, CASE k.loai WHEN 'Mua hang' THEN 0 WHEN 'HCNS' THEN 1 WHEN 'Mien' THEN 2 WHEN 'Quan ly' THEN 3 ELSE 4 END, k.ten_kho`,
  )
    .bind(JSON.stringify(c.get("user").cong_ty_xem))
    .all<{ thu_kho: string | null }>();
  return c.json({ rows: results.map((r) => ({ ...r, thu_kho: r.thu_kho ? r.thu_kho.split(",") : [] })) });
});

// GET /dich - kho DICH chon duoc khi lap phieu chuyen kho: moi kho dang hoat dong (tru kho mua hang) cua MOI cong
// ty dang hoat dong - chuyen sang kho cong ty khac = phieu chuyen cong ty, can KT cong ty nguon duyet. Chi ten +
// loai + cong ty (khong so lieu ton).
kho.get("/dich", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT k.id, k.ten_kho, k.loai, k.nhan_vien_id, k.bat_tat, k.cong_ty_id, ct.ma AS cong_ty_ma
     FROM kho k JOIN cong_ty ct ON ct.id = k.cong_ty_id
     WHERE k.bat_tat = 1 AND ct.bat_tat = 1 AND k.loai NOT IN ('Mua hang', 'Tieu hao')
     ORDER BY k.cong_ty_id, CASE k.loai WHEN 'HCNS' THEN 1 WHEN 'Mien' THEN 2 ELSE 3 END, k.ten_kho`,
  ).all();
  return c.json({ rows: results });
});

// GET /cua-toi - cac kho user dang dang nhap duoc thao tac (xem lib/quyen.ts khoPhuTrach).
kho.get("/cua-toi", async (c) => {
  const rows = await khoPhuTrach(c.env.DB, c.get("user"));
  return c.json({ rows });
});

// GET /tong-hop - so lieu that tung kho trong pham vi (quan tri: moi kho; thu kho/QL: kho minh): TSCD
// dang trong kho, mat hang tieu hao con ton + gia tri (ton x don gia tham khao), vat tu ton am, phieu
// chuyen kho dang cho nhan (qua han 48h). v_ton_kho tinh 1 lan (CTE) thay vi moi kho 1 lan.
kho.get("/tong-hop", async (c) => {
  const db = c.env.DB;
  const pv = await layPhamVi(db, c.get("user"));
  if (!pv.xemTongHop) return c.json({ error: "FORBIDDEN" }, 403);
  const moc = formatVNFromMs(Date.now() - 48 * 3600 * 1000);
  const loc = pv.toanBo ? "1=1" : "k.id IN (SELECT value FROM json_each(?))";
  const { results } = await db
    .prepare(
      `WITH ton AS (
         SELECT t.kho_id,
                SUM(CASE WHEN t.ton > 0 THEN 1 ELSE 0 END) AS so_mat_hang,
                SUM(CASE WHEN t.ton > 0 THEN t.ton * COALESCE(v.don_gia_tham_khao, 0) ELSE 0 END) AS gt_tieu_hao,
                SUM(CASE WHEN t.ton < 0 THEN 1 ELSE 0 END) AS ton_am
         FROM v_ton_kho t JOIN vt_tieu_hao v ON v.id = t.vt_id GROUP BY t.kho_id),
       ts AS (
         SELECT kho_id, COUNT(*) AS n, SUM(COALESCE(nguyen_gia, 0)) AS gt FROM ccdc
         WHERE vo_hieu_hoa = 0 AND trang_thai_hien_tai = 'Trong kho' GROUP BY kho_id),
       cn AS (
         SELECT den_kho_id AS kho_id, COUNT(*) AS n, SUM(CASE WHEN created_at < ? THEN 1 ELSE 0 END) AS qh
         FROM phieu_chuyen_kho WHERE trang_thai = 'Dang chuyen' GROUP BY den_kho_id)
       SELECT k.id, k.ten_kho, k.loai, k.bat_tat, k.cong_ty_id, nv.ten_nv AS nhan_vien_ten,
              COALESCE(ts.n, 0) AS ts_trong_kho, COALESCE(ts.gt, 0) AS gt_ts,
              COALESCE(ton.so_mat_hang, 0) AS so_mat_hang, COALESCE(ton.gt_tieu_hao, 0) AS gt_tieu_hao,
              COALESCE(ton.ton_am, 0) AS ton_am, COALESCE(cn.n, 0) AS cho_nhan, COALESCE(cn.qh, 0) AS cho_nhan_qua_han
       FROM kho k
       LEFT JOIN nhan_vien nv ON nv.ma_nv = k.nhan_vien_id
       LEFT JOIN ton ON ton.kho_id = k.id LEFT JOIN ts ON ts.kho_id = k.id LEFT JOIN cn ON cn.kho_id = k.id
       WHERE k.loai NOT IN ('Mua hang', 'Tieu hao') AND ${loc}
       ORDER BY CASE k.loai WHEN 'HCNS' THEN 1 WHEN 'Mien' THEN 2 ELSE 3 END, k.ten_kho`,
    )
    .bind(moc, ...(pv.toanBo ? [] : [JSON.stringify(pv.khoIds)]))
    .all();
  return c.json({ cap_nhat_luc: nowVN(), toan_bo: pv.toanBo, rows: results });
});

interface Body {
  ten_kho?: string;
  loai?: LoaiKho;
  nhan_vien_id?: string | null;
  bat_tat?: boolean;
  ghi_chu?: string | null;
  cong_ty_id?: number;
}

/** Kho ton tai + nguoi dung la HCNS/Admin CUA CONG TY kho do. */
async function khoQuanTri(db: D1Database, user: Parameters<typeof laHcns>[0], id: number) {
  const k = await getKho(db, id);
  if (!k) return { error: "NOT_FOUND" as const, status: 404 as const };
  if (!laHcns(user, k.cong_ty_id)) return { error: "FORBIDDEN" as const, status: 403 as const };
  return { kho: k };
}

kho.post("/", requireRole("Admin", "HCNS"), async (c) => {
  const body = await c.req.json<Body>().catch(() => null);
  if (!body?.ten_kho?.trim() || !body.loai || !LOAI_HOP_LE.includes(body.loai)) return c.json({ error: "MISSING_FIELDS" }, 400);
  if (body.loai === "Quan ly" && !body.nhan_vien_id) return c.json({ error: "MISSING_NHAN_VIEN" }, 400);
  // Cong ty: gui kem, hoac cong ty duy nhat dang xem.
  const user = c.get("user");
  const congTyId = Number(body.cong_ty_id ?? (user.cong_ty_xem.length === 1 ? user.cong_ty_xem[0] : 0));
  if (!congTyId) return c.json({ error: "CHON_CONG_TY" }, 400);
  if (!laHcns(user, congTyId)) return c.json({ error: "FORBIDDEN" }, 403);
  if (body.loai === "Quan ly") {
    const dup = await c.env.DB.prepare("SELECT id FROM kho WHERE nhan_vien_id = ?").bind(body.nhan_vien_id).first();
    if (dup) return c.json({ error: "QL_DA_CO_KHO" }, 409);
  }
  const row = await c.env.DB.prepare(
    `INSERT INTO kho (ten_kho, loai, nhan_vien_id, ghi_chu, cong_ty_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(body.ten_kho.trim(), body.loai, body.loai === "Quan ly" ? body.nhan_vien_id : null, body.ghi_chu ?? null, congTyId, nowVN(), nowVN())
    .first<{ id: number }>();
  return c.json({ ok: true, id: row?.id });
});

kho.put("/:id", requireRole("Admin", "HCNS"), async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<Body>().catch(() => null);
  if (!body?.ten_kho?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);
  const q = await khoQuanTri(c.env.DB, c.get("user"), id);
  if ("error" in q) return c.json({ error: q.error }, q.status);
  // Khong cho tat kho Mua hang / HCNS cuoi cung cua 1 cong ty - moi luong nhap deu di qua.
  if (body.bat_tat === false && (q.kho.loai === "Mua hang" || q.kho.loai === "HCNS")) {
    const khac = await c.env.DB.prepare("SELECT 1 AS ok FROM kho WHERE cong_ty_id = ? AND loai = ? AND bat_tat = 1 AND id != ? LIMIT 1")
      .bind(q.kho.cong_ty_id, q.kho.loai, id)
      .first();
    if (!khac) return c.json({ error: "KHONG_TAT_KHO_HE_THONG" }, 400);
  }
  const r = await c.env.DB.prepare(`UPDATE kho SET ten_kho = ?, bat_tat = ?, ghi_chu = ?, updated_at = ? WHERE id = ?`)
    .bind(body.ten_kho.trim(), body.bat_tat === false ? 0 : 1, body.ghi_chu ?? null, nowVN(), id)
    .run();
  if ((r.meta.changes ?? 0) === 0) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json({ ok: true });
});

// Doi loai kho QL <-> Mien (vd kho QL phat cho MOI nhan vien, khong chi nhom). Giu nguyen id, ton, lich su
// va nhan_vien_id (nguoi phu trach - van la thu kho mac nhien; giu de dong bo ETX / gan quan ly khong tu tao
// lai "Kho QL - ..." moi nho ON CONFLICT(nhan_vien_id)). Chi anh huong quy tac cua phieu lap SAU khi doi.
kho.post("/:id/doi-loai", requireRole("Admin", "HCNS"), async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ loai?: LoaiKho; ten_kho?: string }>().catch(() => null);
  if (body?.loai !== "Mien" && body?.loai !== "Quan ly") return c.json({ error: "MISSING_FIELDS" }, 400);
  const q = await khoQuanTri(c.env.DB, c.get("user"), id);
  if ("error" in q) return c.json({ error: q.error }, q.status);
  const k = q.kho;
  if (k.loai !== "Mien" && k.loai !== "Quan ly") return c.json({ error: "CHI_DOI_KHO_QL_MIEN" }, 400);
  if (body.loai === "Quan ly" && !k.nhan_vien_id) return c.json({ error: "MISSING_NHAN_VIEN" }, 400);
  const ten = body.ten_kho?.trim() || k.ten_kho;
  await c.env.DB.prepare("UPDATE kho SET loai = ?, ten_kho = ?, updated_at = ? WHERE id = ?").bind(body.loai, ten, nowVN(), id).run();
  return c.json({ ok: true });
});

// Gan / bo thu kho. Email phai la user da dang nhap it nhat 1 lan (FK users) - nguoi chua co tai
// khoan thi chua gan duoc (giong ly do email_dang_nhap cua nhan_vien).
kho.post("/:id/thu-kho", requireRole("Admin", "HCNS"), async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ email?: string }>().catch(() => null);
  const email = body?.email?.trim().toLowerCase();
  if (!email) return c.json({ error: "MISSING_FIELDS" }, 400);
  const u = await c.env.DB.prepare("SELECT email FROM users WHERE email = ?").bind(email).first();
  if (!u) return c.json({ error: "USER_CHUA_DANG_NHAP" }, 400);
  const q = await khoQuanTri(c.env.DB, c.get("user"), id);
  if ("error" in q) return c.json({ error: q.error }, q.status);
  await c.env.DB.prepare("INSERT INTO kho_thu_kho (kho_id, email, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING").bind(id, email, nowVN()).run();
  return c.json({ ok: true });
});

kho.delete("/:id/thu-kho/:email", requireRole("Admin", "HCNS"), async (c) => {
  const q = await khoQuanTri(c.env.DB, c.get("user"), Number(c.req.param("id")));
  if ("error" in q) return c.json({ error: q.error }, q.status);
  await c.env.DB.prepare("DELETE FROM kho_thu_kho WHERE kho_id = ? AND email = ?")
    .bind(Number(c.req.param("id")), decodeURIComponent(c.req.param("email") ?? ""))
    .run();
  return c.json({ ok: true });
});

export default kho;
