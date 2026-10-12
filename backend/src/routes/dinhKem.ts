import { Hono } from "hono";
import type { AppUser, Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { coCongTy, khoPhuTrach, laHcns } from "../lib/quyen";
import { LoiDrive, uploadPublicFile } from "../lib/googleDrive";
import { nowVN } from "../lib/vnTime";

// Dinh kem hoa don / chung tu / anh bang chung (migration 0013) cho phieu (chuyen_kho / giao_nhan / xu_ly) va
// tai san. Tep luu tren Google Drive (lib/googleDrive.ts), D1 chi luu drive_file_id + metadata.
//   - Xem: moi nguoi dang nhap (giong popup chi tiet phieu).
//   - Tai len: Admin / Ke toan / HCNS, hoac nguoi LIEN QUAN (lap phieu, nhan hang, thu kho 2 dau, nguoi giu TS).
//   - Xoa: nguoi tai len hoac Admin/HCNS - XOA MEM (chung tu ke toan), tep tren Drive giu nguyen.
const dinhKem = new Hono<{ Bindings: Env }>();
dinhKem.use("*", verifySessionMiddleware, loadUser);

type DoiTuong = "chuyen_kho" | "giao_nhan" | "xu_ly" | "tai_san";
const DOI_TUONG: DoiTuong[] = ["chuyen_kho", "giao_nhan", "xu_ly", "tai_san"];
const LOAI = ["Hoa don", "Chung tu", "Bang chung", "Khac"] as const;
const MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "application/pdf"]);
const TOI_DA = 10 * 1024 * 1024;

const laQuanTri = (u: AppUser) => u.vai_tro === "Admin" || u.vai_tro === "Ke toan" || u.vai_tro === "HCNS";

/** null = doi tuong khong ton tai. ma = ma hien thi (ma phieu / ma tai san) dung dat ten tep. */
async function docDoiTuong(db: D1Database, dt: DoiTuong, id: string) {
  if (dt === "chuyen_kho")
    return db
      .prepare("SELECT ma_phieu AS ma, nguoi_lap, den_nhan_vien_id AS nv1, NULL AS nv2, tu_kho_id, den_kho_id, (SELECT cong_ty_id FROM kho WHERE id = tu_kho_id) AS cong_ty_id FROM phieu_chuyen_kho WHERE id = ?")
      .bind(id)
      .first<DongDt>();
  if (dt === "giao_nhan")
    return db
      .prepare("SELECT ma_phieu AS ma, nguoi_lap, nhan_vien_id AS nv1, nhan_vien_nhan_moi_id AS nv2, tu_kho_id, den_kho_id, (SELECT c.cong_ty_id FROM phieu_giao_nhan_ct ct JOIN ccdc c ON c.id = ct.ccdc_id WHERE ct.phieu_id = phieu_giao_nhan.id LIMIT 1) AS cong_ty_id FROM phieu_giao_nhan WHERE id = ?")
      .bind(id)
      .first<DongDt>();
  if (dt === "xu_ly")
    return db
      .prepare(
        `SELECT ma_phieu AS ma, nguoi_de_xuat AS nguoi_lap, NULL AS nv1, NULL AS nv2, NULL AS tu_kho_id, NULL AS den_kho_id,
                (SELECT group_concat(nguoi_giu_truoc) FROM phieu_xu_ly_ts_ct WHERE phieu_id = p.id) AS ds_nv,
                (SELECT c.cong_ty_id FROM phieu_xu_ly_ts_ct ct JOIN ccdc c ON c.id = ct.ccdc_id WHERE ct.phieu_id = p.id LIMIT 1) AS cong_ty_id
         FROM phieu_xu_ly_ts p WHERE id = ?`,
      )
      .bind(id)
      .first<DongDt>();
  return db
    .prepare("SELECT id AS ma, nguoi_tao AS nguoi_lap, nguoi_dang_giu AS nv1, NULL AS nv2, kho_id AS tu_kho_id, NULL AS den_kho_id, cong_ty_id FROM ccdc WHERE id = ?")
    .bind(id)
    .first<DongDt>();
}
interface DongDt {
  ma: string | null;
  nguoi_lap: string | null;
  nv1: string | null;
  nv2: string | null;
  tu_kho_id: number | null;
  den_kho_id: number | null;
  ds_nv?: string | null;
  cong_ty_id: number | null;
}

async function duocTaiLen(db: D1Database, user: AppUser, d: DongDt): Promise<boolean> {
  // Admin/KT/HCNS: chi doi tuong thuoc cong ty tai khoan duoc phep (da phap nhan).
  if ((laQuanTri(user) && coCongTy(user, d.cong_ty_id)) || d.nguoi_lap === user.email) return true;
  if (user.ma_nv && [d.nv1, d.nv2, ...(d.ds_nv ?? "").split(",")].includes(user.ma_nv)) return true;
  const khos = (await khoPhuTrach(db, user)).map((k) => k.id);
  return [d.tu_kho_id, d.den_kho_id].some((k) => k != null && khos.includes(k));
}

function docThamSo(c: { req: { query: (k: string) => string | undefined } }) {
  const dt = c.req.query("doi_tuong") as DoiTuong;
  const id = c.req.query("id")?.trim();
  return DOI_TUONG.includes(dt) && id ? { dt, id } : null;
}

// GET /?doi_tuong=&id= - tep dinh kem. Voi tai san: kem ca tep tren cac phieu co tai san do (nhap, giao nhan,
// bao hong, thanh ly...) - xem duoc toan bo chung tu cua 1 tai san o 1 cho, ghi ro phieu nguon.
dinhKem.get("/", async (c) => {
  const user = c.get("user");
  const ts = docThamSo(c);
  if (!ts) return c.json({ error: "MISSING_FIELDS" }, 400);
  const db = c.env.DB;
  const d = await docDoiTuong(db, ts.dt, ts.id);
  if (!d) return c.json({ error: "NOT_FOUND" }, 404);

  const cot = `k.id, k.doi_tuong, k.doi_tuong_id, k.loai, k.drive_file_id, k.ten_file, k.mime, k.kich_thuoc, k.ghi_chu,
               k.nguoi_tai, u.ten AS nguoi_tai_ten, k.created_at`;
  const lienQuan =
    ts.dt === "tai_san"
      ? `UNION ALL
         SELECT ${cot}, p.ma_phieu AS nguon_ma FROM dinh_kem k LEFT JOIN users u ON u.email = k.nguoi_tai
           JOIN phieu_xu_ly_ts p ON p.id = k.doi_tuong_id
         WHERE k.doi_tuong = 'xu_ly' AND k.da_xoa = 0 AND k.doi_tuong_id IN (SELECT phieu_id FROM phieu_xu_ly_ts_ct WHERE ccdc_id = ?1)
         UNION ALL
         SELECT ${cot}, p.ma_phieu AS nguon_ma FROM dinh_kem k LEFT JOIN users u ON u.email = k.nguoi_tai
           JOIN phieu_giao_nhan p ON p.id = k.doi_tuong_id
         WHERE k.doi_tuong = 'giao_nhan' AND k.da_xoa = 0 AND k.doi_tuong_id IN (SELECT phieu_id FROM phieu_giao_nhan_ct WHERE ccdc_id = ?1)`
      : "";
  const { results } = await db
    .prepare(
      `SELECT * FROM (
         SELECT ${cot}, NULL AS nguon_ma FROM dinh_kem k LEFT JOIN users u ON u.email = k.nguoi_tai
         WHERE k.doi_tuong = ?2 AND k.doi_tuong_id = ?1 AND k.da_xoa = 0
         ${lienQuan}
       ) ORDER BY created_at DESC`,
    )
    .bind(ts.id, ts.dt)
    .all<{ nguoi_tai: string }>();
  const ketNoi = await db.prepare("SELECT 1 AS ok FROM google_drive_oauth WHERE id = 1").first();
  const xoaDuoc = laHcns(user, d.cong_ty_id);
  return c.json({
    rows: results.map((r) => ({ ...r, co_the_xoa: xoaDuoc || r.nguoi_tai === user.email })),
    co_the_tai: await duocTaiLen(db, user, d),
    drive_ket_noi: !!ketNoi,
  });
});

// POST /?doi_tuong=&id=&loai=&ten=&ghi_chu= - body la BYTES tho (Content-Type = mime that, giong vi-pham-app),
// KHONG phai multipart/form-data. Anh da duoc frontend thu nho truoc khi gui (lib/dinhKem.ts).
dinhKem.post("/", async (c) => {
  const user = c.get("user");
  const ts = docThamSo(c);
  const loai = c.req.query("loai") as (typeof LOAI)[number];
  if (!ts || !LOAI.includes(loai)) return c.json({ error: "MISSING_FIELDS" }, 400);
  const mime = (c.req.header("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  if (!MIME.has(mime)) return c.json({ error: "SAI_DINH_DANG" }, 415);

  const db = c.env.DB;
  const d = await docDoiTuong(db, ts.dt, ts.id);
  if (!d) return c.json({ error: "NOT_FOUND" }, 404);
  if (!(await duocTaiLen(db, user, d))) return c.json({ error: "FORBIDDEN" }, 403);

  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) return c.json({ error: "EMPTY_BODY" }, 400);
  if (bytes.byteLength > TOI_DA) return c.json({ error: "TEP_QUA_LON" }, 413);

  const ngay = nowVN();
  const ext = mime === "application/pdf" ? "pdf" : mime.split("/")[1].replace("jpeg", "jpg");
  const tenGoc = (c.req.query("ten") ?? "").trim().slice(0, 120);
  const tenDrive = `${d.ma ?? ts.id}_${loai.replace(" ", "-")}_${ngay.replace(/[-: ]/g, "").slice(0, 14)}_${crypto.randomUUID().slice(0, 6)}.${ext}`;
  let driveId: string;
  try {
    driveId = await uploadPublicFile(c.env, db, bytes, mime, tenDrive);
  } catch (e) {
    if (e instanceof LoiDrive && e.code === "DRIVE_CHUA_KET_NOI") return c.json({ error: "DRIVE_CHUA_KET_NOI" }, 409);
    console.error("[dinhKem] upload Drive loi", e);
    return c.json({ error: "DRIVE_LOI" }, 502);
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO dinh_kem (id, doi_tuong, doi_tuong_id, loai, drive_file_id, ten_file, mime, kich_thuoc, ghi_chu, nguoi_tai, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, ts.dt, ts.id, loai, driveId, tenGoc || tenDrive, mime, bytes.byteLength, c.req.query("ghi_chu")?.trim().slice(0, 300) || null, user.email, ngay)
    .run();
  return c.json({ ok: true, id, drive_file_id: driveId });
});

// DELETE /:id - xoa mem (nguoi tai len hoac Admin/HCNS).
dinhKem.delete("/:id", async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT nguoi_tai, doi_tuong, doi_tuong_id FROM dinh_kem WHERE id = ? AND da_xoa = 0")
    .bind(c.req.param("id"))
    .first<{ nguoi_tai: string; doi_tuong: DoiTuong; doi_tuong_id: string }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  if (row.nguoi_tai !== user.email) {
    const d = await docDoiTuong(c.env.DB, row.doi_tuong, row.doi_tuong_id);
    if (!laHcns(user, d?.cong_ty_id ?? null)) return c.json({ error: "FORBIDDEN" }, 403);
  }
  await c.env.DB.prepare("UPDATE dinh_kem SET da_xoa = 1, nguoi_xoa = ?, xoa_luc = ? WHERE id = ?").bind(user.email, nowVN(), c.req.param("id")).run();
  return c.json({ ok: true });
});

export default dinhKem;
