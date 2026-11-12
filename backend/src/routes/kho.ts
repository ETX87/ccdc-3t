import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { formatVNFromMs, nowVN } from "../lib/vnTime";
import { getKho, khoPhuTrach, laHcns, LOAI_DOI_DUOC, type LoaiKho } from "../lib/quyen";
import { layPhamViXemTon } from "../lib/phamVi";
import { nvThuocCongTy } from "../lib/nvCongTy";
import { TEN_KHO, TEN_NV } from "../lib/nhanCongTy";

// Danh muc kho (chuoi KHO MUA -> HCNS -> MIEN -> QL) + gan thu kho. Kho QL thuong duoc tao tu dong
// khi gan quan ly truc tiep cho nhan vien (routes/nhanVien.ts), van tao tay duoc o day.
const kho = new Hono<{ Bindings: Env }>();
kho.use("*", verifySessionMiddleware, loadUser);

const LOAI_HOP_LE: LoaiKho[] = ["Mua hang", "HCNS", "Mien", "Trung chuyen", "Quan ly", "Tieu hao"];

// Danh sach kho cac cong ty dang xem (bo loc cong ty tren topbar).
kho.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT k.id, ${TEN_KHO("k")} AS ten_kho, k.ten_kho AS ten_goc, k.loai, k.nhan_vien_id, ${TEN_NV("nv")} AS nhan_vien_ten, k.bat_tat, k.ghi_chu, k.cong_ty_id, ct.ma AS cong_ty_ma,
            (SELECT group_concat(t.email, ',') FROM kho_thu_kho t WHERE t.kho_id = k.id) AS thu_kho
     FROM kho k LEFT JOIN nhan_vien nv ON nv.ma_nv = k.nhan_vien_id JOIN cong_ty ct ON ct.id = k.cong_ty_id
     WHERE k.cong_ty_id IN (SELECT value FROM json_each(?))
     ORDER BY k.cong_ty_id, CASE k.loai WHEN 'Mua hang' THEN 0 WHEN 'HCNS' THEN 1 WHEN 'Mien' THEN 2 WHEN 'Trung chuyen' THEN 2 WHEN 'Quan ly' THEN 3 ELSE 4 END, k.ten_kho`,
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
    `SELECT k.id, ${TEN_KHO("k")} AS ten_kho, k.loai, k.nhan_vien_id, k.bat_tat, k.cong_ty_id, ct.ma AS cong_ty_ma
     FROM kho k JOIN cong_ty ct ON ct.id = k.cong_ty_id
     WHERE k.bat_tat = 1 AND ct.bat_tat = 1 AND k.loai NOT IN ('Mua hang', 'Tieu hao')
     ORDER BY k.cong_ty_id, CASE k.loai WHEN 'HCNS' THEN 1 WHEN 'Mien' THEN 2 WHEN 'Trung chuyen' THEN 2 ELSE 3 END, k.ten_kho`,
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
  const pv = await layPhamViXemTon(db, c.get("user"));
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
       SELECT k.id, ${TEN_KHO("k")} AS ten_kho, k.loai, k.bat_tat, k.cong_ty_id, ${TEN_NV("nv")} AS nhan_vien_ten,
              COALESCE(ts.n, 0) AS ts_trong_kho, COALESCE(ts.gt, 0) AS gt_ts,
              COALESCE(ton.so_mat_hang, 0) AS so_mat_hang, COALESCE(ton.gt_tieu_hao, 0) AS gt_tieu_hao,
              COALESCE(ton.ton_am, 0) AS ton_am, COALESCE(cn.n, 0) AS cho_nhan, COALESCE(cn.qh, 0) AS cho_nhan_qua_han
       FROM kho k
       LEFT JOIN nhan_vien nv ON nv.ma_nv = k.nhan_vien_id
       LEFT JOIN ton ON ton.kho_id = k.id LEFT JOIN ts ON ts.kho_id = k.id LEFT JOIN cn ON cn.kho_id = k.id
       WHERE k.loai NOT IN ('Mua hang', 'Tieu hao') AND ${loc}
       ORDER BY CASE k.loai WHEN 'HCNS' THEN 1 WHEN 'Mien' THEN 2 WHEN 'Trung chuyen' THEN 2 ELSE 3 END, k.ten_kho`,
    )
    .bind(moc, ...(pv.toanBo ? [] : [JSON.stringify(pv.khoIds)]))
    .all();
  return c.json({ cap_nhat_luc: nowVN(), toan_bo: pv.toanBo, rows: results });
});

// GET /nhap-xuat-ton?tu=YYYY-MM-DD&den=YYYY-MM-DD[&kho_id=] - nhap / xuat / ton tieu hao theo ky (cung quy tac v_ton_kho):
//   ton dau ky = moi bien dong truoc `tu`; nhap / xuat = bien dong trong ky; ton cuoi = dau + nhap - xuat (den = hom nay
//   -> khop ton hien tai). Ngay bien dong: vao kho (Da nhan) + dieu chinh tinh luc doi trang thai (updated_at - luc thu kho
//   xac nhan / KT duyet), ra kho tinh luc lap phieu (created_at - tru ton ngay). Dieu chinh +/- gop vao nhap / xuat.
//   Khong kho_id: 1 dong / kho (pham vi xem nhu /tong-hop). Co kho_id: 1 dong / mat hang cua kho do. Gia tri = SL x gia tham khao.
kho.get("/nhap-xuat-ton", async (c) => {
  const db = c.env.DB;
  const pv = await layPhamViXemTon(db, c.get("user"));
  if (!pv.xemTongHop) return c.json({ error: "FORBIDDEN" }, 403);
  const ngay = /^\d{4}-\d{2}-\d{2}$/;
  const tu = c.req.query("tu") ?? "";
  const den = c.req.query("den") ?? "";
  if (!ngay.test(tu) || !ngay.test(den) || tu > den) return c.json({ error: "MISSING_FIELDS" }, 400);
  const khoId = Number(c.req.query("kho_id")) || null;
  if (khoId && !pv.toanBo && !pv.khoIds.includes(khoId)) return c.json({ error: "FORBIDDEN" }, 403);
  const tuTs = `${tu} 00:00:00`;
  const denTs = `${den} 23:59:59`;
  const loc = khoId ? "k.id = ?" : pv.toanBo ? "1=1" : "k.id IN (SELECT value FROM json_each(?))";
  const locBind = khoId ? [khoId] : pv.toanBo ? [] : [JSON.stringify(pv.khoIds)];
  const nhom = khoId ? "m.vt_id" : "m.kho_id";
  const { results } = await db
    .prepare(
      `WITH m AS (
         SELECT p.den_kho_id AS kho_id, COALESCE(ct.vt_id_den, ct.vt_id) AS vt_id, p.updated_at AS ngay, ct.so_luong AS delta
         FROM phieu_chuyen_kho p JOIN phieu_chuyen_kho_ct ct ON ct.phieu_id = p.id
         WHERE p.den_kho_id IS NOT NULL AND p.trang_thai = 'Da nhan'
         UNION ALL
         SELECT p.tu_kho_id, ct.vt_id, p.created_at, -ct.so_luong
         FROM phieu_chuyen_kho p JOIN phieu_chuyen_kho_ct ct ON ct.phieu_id = p.id
         WHERE p.trang_thai IN ('Dang chuyen', 'Da nhan', 'Da giao')
         UNION ALL
         SELECT p.tu_kho_id, ct.vt_id, p.updated_at, ct.so_luong * ct.dau
         FROM phieu_chuyen_kho p JOIN phieu_chuyen_kho_ct ct ON ct.phieu_id = p.id
         WHERE p.loai = 'Dieu chinh' AND p.trang_thai = 'Da dieu chinh'),
       a AS (
         SELECT ${nhom} AS khoa,
                SUM(CASE WHEN m.ngay < ?1 THEN m.delta ELSE 0 END) AS ton_dau,
                SUM(CASE WHEN m.ngay >= ?1 AND m.ngay <= ?2 AND m.delta > 0 THEN m.delta ELSE 0 END) AS nhap,
                SUM(CASE WHEN m.ngay >= ?1 AND m.ngay <= ?2 AND m.delta < 0 THEN -m.delta ELSE 0 END) AS xuat,
                SUM(CASE WHEN m.ngay < ?1 THEN m.delta ELSE 0 END * COALESCE(v.don_gia_tham_khao, 0)) AS gt_dau,
                SUM(CASE WHEN m.ngay >= ?1 AND m.ngay <= ?2 AND m.delta > 0 THEN m.delta ELSE 0 END * COALESCE(v.don_gia_tham_khao, 0)) AS gt_nhap,
                SUM(CASE WHEN m.ngay >= ?1 AND m.ngay <= ?2 AND m.delta < 0 THEN -m.delta ELSE 0 END * COALESCE(v.don_gia_tham_khao, 0)) AS gt_xuat,
                COUNT(DISTINCT CASE WHEN m.ngay >= ?1 AND m.ngay <= ?2 THEN m.vt_id END) AS so_mat_hang_ps
         FROM m JOIN kho k ON k.id = m.kho_id AND k.loai NOT IN ('Mua hang', 'Tieu hao')
         JOIN vt_tieu_hao v ON v.id = m.vt_id
         WHERE m.ngay <= ?2 AND ${loc.replace("?", "?3")}
         GROUP BY ${nhom})
       ${
         khoId
           ? `SELECT v.id AS vt_id, v.ten_vt, v.don_vi_tinh, a.* FROM a JOIN vt_tieu_hao v ON v.id = a.khoa
              WHERE a.ton_dau <> 0 OR a.nhap <> 0 OR a.xuat <> 0 ORDER BY v.ten_vt`
           : `SELECT a.khoa AS kho_id, a.* FROM a`
       }`,
    )
    .bind(tuTs, denTs, ...locBind)
    .all<Record<string, number | string | null>>();
  const tron = (x: unknown) => Math.round(Number(x ?? 0) * 1000) / 1000;
  const rows = results.map((r) => {
    const o: Record<string, number | string | null> = { ...r };
    for (const k of ["ton_dau", "nhap", "xuat", "gt_dau", "gt_nhap", "gt_xuat"]) o[k] = tron(r[k]);
    o.ton_cuoi = tron(Number(o.ton_dau) + Number(o.nhap) - Number(o.xuat));
    o.gt_cuoi = Math.round(Number(o.gt_dau) + Number(o.gt_nhap) - Number(o.gt_xuat));
    delete o.khoa;
    return o;
  });
  return c.json({ tu, den, kho_id: khoId, rows });
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
    // 1 kho QL / nguoi / CONG TY (nhan vien kiem nhiem co kho QL rieng o tung cong ty).
    if (!(await nvThuocCongTy(c.env.DB, body.nhan_vien_id!, congTyId))) return c.json({ error: "NHAN_VIEN_KHAC_CONG_TY" }, 400);
    const dup = await c.env.DB.prepare("SELECT id FROM kho WHERE nhan_vien_id = ? AND cong_ty_id = ?").bind(body.nhan_vien_id, congTyId).first();
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

// Doi loai kho Mien <-> Trung chuyen <-> QL (vd kho QL phat cho MOI nhan vien, khong chi nhom). Giu nguyen id, ton, lich su
// va nhan_vien_id (nguoi phu trach - van la thu kho mac nhien; giu de dong bo ETX / gan quan ly khong tu tao
// lai "Kho QL - ..." moi nho ON CONFLICT(nhan_vien_id, cong_ty_id)). Chi anh huong quy tac cua phieu lap SAU khi doi.
// Kho chua co nguoi phu trach -> sang kho QL phai chon 1 nhan vien (cung cong ty, chua co kho rieng).
kho.post("/:id/doi-loai", requireRole("Admin", "HCNS"), async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ loai?: LoaiKho; ten_kho?: string; nhan_vien_id?: string }>().catch(() => null);
  if (!body?.loai || !LOAI_DOI_DUOC.includes(body.loai)) return c.json({ error: "MISSING_FIELDS" }, 400);
  const q = await khoQuanTri(c.env.DB, c.get("user"), id);
  if ("error" in q) return c.json({ error: q.error }, q.status);
  const k = q.kho;
  if (!LOAI_DOI_DUOC.includes(k.loai)) return c.json({ error: "CHI_DOI_KHO_QL_MIEN" }, 400);
  if (k.loai === body.loai) return c.json({ error: "TRUNG_LOAI_KHO" }, 400);
  let nv = k.nhan_vien_id;
  if (body.loai === "Quan ly" && !nv) {
    const chon = body.nhan_vien_id?.trim();
    if (!chon) return c.json({ error: "MISSING_NHAN_VIEN" }, 400);
    const r = await c.env.DB.prepare("SELECT 1 FROM nhan_vien WHERE ma_nv = ? AND dang_lam_viec = 1").bind(chon).first();
    if (!r) return c.json({ error: "NHAN_VIEN_NOT_FOUND" }, 404);
    if (!(await nvThuocCongTy(c.env.DB, chon, k.cong_ty_id))) return c.json({ error: "NHAN_VIEN_KHAC_CONG_TY" }, 400);
    if (await c.env.DB.prepare("SELECT id FROM kho WHERE nhan_vien_id = ? AND cong_ty_id = ?").bind(chon, k.cong_ty_id).first()) {
      return c.json({ error: "QL_DA_CO_KHO" }, 409);
    }
    nv = chon;
  }
  const ten = body.ten_kho?.trim() || k.ten_kho;
  await c.env.DB.prepare("UPDATE kho SET loai = ?, ten_kho = ?, nhan_vien_id = ?, updated_at = ? WHERE id = ?").bind(body.loai, ten, nv, nowVN(), id).run();
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
