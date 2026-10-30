import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import type { AppUser } from "../types";
import { nowVN } from "../lib/vnTime";
import { kyMacDinh, thuThapBaoCao, tieuDeBaoCao } from "../lib/baoCaoTuan";
import { taoExcelBaoCao, taoHtmlBaoCao, tenFileExcel } from "../lib/baoCaoEmail";
import { guiGmail, LoiGmail } from "../lib/gmail";

// Bao cao email dinh ky (2026-10-30, migration 0021): Admin / HCNS cau hinh nguoi nhan + cong ty, cron toi thu 5 (20h VN) tu
// gui, hoac bam "Gui ngay". Xem truoc HTML / tai Excel cung du lieu voi email. HCNS chi duoc gan 1 so cong ty: chi chon /
// xem / gui thu cong trong cac cong ty do (congTyCuaNguoi); cron van gui dung cau hinh da luu.
const baoCaoEmail = new Hono<{ Bindings: Env }>();
baoCaoEmail.use("*", verifySessionMiddleware, loadUser, requireRole("Admin", "HCNS"));

/** Cong ty nguoi thao tac duoc dua vao bao cao: Admin = cau hinh; HCNS = cau hinh giao cong ty tai khoan. */
function congTyCuaNguoi(user: AppUser, cauHinh: number[] | null): number[] | null {
  if (user.vai_tro === "Admin") return cauHinh;
  return (cauHinh ?? user.cong_ty_ids).filter((id) => user.cong_ty_ids.includes(id));
}

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
export const LICH_GUI = "Thứ 5 hằng tuần, 20:00 (giờ VN)";

interface CauHinh {
  nguoi_nhan: string[];
  cong_ty_ids: number[] | null;
  tu_dong: boolean;
  dinh_kem_excel: boolean;
  nguoi_cap_nhat: string | null;
  updated_at: string | null;
}

export async function docCauHinh(db: D1Database): Promise<CauHinh> {
  const r = await db
    .prepare("SELECT nguoi_nhan, cong_ty_ids, tu_dong, dinh_kem_excel, nguoi_cap_nhat, updated_at FROM bao_cao_email_cau_hinh WHERE id = 1")
    .first<{ nguoi_nhan: string; cong_ty_ids: string | null; tu_dong: number; dinh_kem_excel: number; nguoi_cap_nhat: string | null; updated_at: string | null }>();
  const mang = <T>(s: string | null | undefined): T[] | null => {
    try {
      const v = s ? JSON.parse(s) : null;
      return Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  };
  return {
    nguoi_nhan: mang<string>(r?.nguoi_nhan) ?? [],
    cong_ty_ids: mang<number>(r?.cong_ty_ids),
    tu_dong: r ? !!r.tu_dong : true,
    dinh_kem_excel: r ? !!r.dinh_kem_excel : true,
    nguoi_cap_nhat: r?.nguoi_cap_nhat ?? null,
    updated_at: r?.updated_at ?? null,
  };
}

const ngayHopLe = (s: string | undefined | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
function kyYeuCau(tu?: string | null, den?: string | null) {
  const md = kyMacDinh();
  const t = ngayHopLe(tu) ?? md.tu;
  const d = ngayHopLe(den) ?? md.den;
  return t <= d ? { tu: t, den: d } : { tu: d, den: t };
}

/**
 * Lap + gui bao cao, ghi nhat ky. Dung cho cron (kieu "Tu dong") va nut "Gui ngay". nguoiNhanRieng: gui thu cho 1 so
 * dia chi (khong doi cau hinh). Loi gui KHONG nem ra - ghi log + tra ve de man hinh / cron bao.
 */
export async function guiBaoCao(
  env: Env,
  kieu: "Tu dong" | "Thu cong",
  nguoiGui: string | null,
  opts: { tu?: string | null; den?: string | null; nguoiNhanRieng?: string[]; congTyIds?: number[] | null } = {},
): Promise<{ ok: boolean; tieu_de?: string; nguoi_nhan: string[]; loi?: string; ma_loi?: string }> {
  const db = env.DB;
  const ch = await docCauHinh(db);
  const nguoiNhan = opts.nguoiNhanRieng?.length ? opts.nguoiNhanRieng : ch.nguoi_nhan;
  const ghiLog = (ketQua: "Thanh cong" | "Loi" | "Bo qua", tieuDe: string | null, loi: string | null) =>
    db
      .prepare("INSERT INTO bao_cao_email_log (thoi_gian, kieu, nguoi_gui, nguoi_nhan, tieu_de, ket_qua, loi) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(nowVN(), kieu, nguoiGui, nguoiNhan.join(", "), tieuDe, ketQua, loi)
      .run();
  if (!nguoiNhan.length) {
    await ghiLog("Bo qua", null, "Chưa có người nhận");
    return { ok: false, nguoi_nhan: [], loi: "Chưa có người nhận", ma_loi: "CHUA_CO_NGUOI_NHAN" };
  }
  let tieuDe: string | null = null;
  try {
    const { tu, den } = kyYeuCau(opts.tu, opts.den);
    const bc = await thuThapBaoCao(db, opts.congTyIds !== undefined ? opts.congTyIds : ch.cong_ty_ids, tu, den);
    tieuDe = tieuDeBaoCao(bc);
    await guiGmail(env, db, {
      den: nguoiNhan,
      tieuDe,
      html: taoHtmlBaoCao(bc, env.FRONTEND_URL || "/"),
      dinhKem: ch.dinh_kem_excel ? [{ ten: tenFileExcel(bc), mime: MIME_XLSX, data: taoExcelBaoCao(bc) }] : [],
    });
    await ghiLog("Thanh cong", tieuDe, null);
    return { ok: true, tieu_de: tieuDe, nguoi_nhan: nguoiNhan };
  } catch (e) {
    const loi = e instanceof Error ? e.message : String(e);
    console.error("[guiBaoCao]", e);
    await ghiLog("Loi", tieuDe, loi.slice(0, 500));
    return { ok: false, nguoi_nhan: nguoiNhan, loi, ma_loi: e instanceof LoiGmail ? e.code : "GUI_LOI" };
  }
}

/** Cron toi thu 5: chi gui khi bat tu dong. */
export async function guiBaoCaoDinhKy(env: Env): Promise<void> {
  const ch = await docCauHinh(env.DB);
  if (!ch.tu_dong) return;
  await guiBaoCao(env, "Tu dong", null);
}

baoCaoEmail.get("/cau-hinh", async (c) => {
  const db = c.env.DB;
  const [ch, gmail, log, cts] = await Promise.all([
    docCauHinh(db),
    db.prepare("SELECT google_email, authorized_by, authorized_at FROM gmail_oauth WHERE id = 1").first(),
    db.prepare("SELECT id, thoi_gian, kieu, nguoi_gui, nguoi_nhan, tieu_de, ket_qua, loi FROM bao_cao_email_log ORDER BY id DESC LIMIT 30").all(),
    db.prepare("SELECT id, ma, ten FROM cong_ty WHERE bat_tat = 1 ORDER BY id").all<{ id: number; ma: string; ten: string }>(),
  ]);
  const user = c.get("user");
  // HCNS chi thay / chon cac cong ty tai khoan duoc phep.
  const congTy = user.vai_tro === "Admin" ? cts.results : cts.results.filter((x) => user.cong_ty_ids.includes(x.id));
  return c.json({ cau_hinh: ch, gmail: gmail ? { connected: true, ...gmail } : { connected: false }, lich: LICH_GUI, nhat_ky: log.results, cong_ty: congTy, ky_mac_dinh: kyMacDinh() });
});

baoCaoEmail.put("/cau-hinh", async (c) => {
  const body = await c.req.json<{ nguoi_nhan?: unknown; cong_ty_ids?: unknown; tu_dong?: boolean; dinh_kem_excel?: boolean }>().catch(() => null);
  if (!body) return c.json({ error: "MISSING_FIELDS" }, 400);
  const ds = Array.isArray(body.nguoi_nhan) ? body.nguoi_nhan.map((x) => String(x).trim().toLowerCase()).filter(Boolean) : [];
  const sai = ds.filter((e) => !EMAIL_RE.test(e));
  if (sai.length) return c.json({ error: "EMAIL_KHONG_HOP_LE", message: sai.join(", ") }, 400);
  const nguoiNhan = [...new Set(ds)];
  if (nguoiNhan.length > 50) return c.json({ error: "QUA_NHIEU_NGUOI_NHAN" }, 400);
  const user = c.get("user");
  let congTy = Array.isArray(body.cong_ty_ids) ? [...new Set(body.cong_ty_ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))] : [];
  if (user.vai_tro !== "Admin") {
    // HCNS: chi cong ty minh; "tat ca" (rong) = moi cong ty minh duoc phep, giu NULL neu tai khoan co du moi cong ty.
    const { results: tatCa } = await c.env.DB.prepare("SELECT id FROM cong_ty WHERE bat_tat = 1").all<{ id: number }>();
    if (congTy.some((id) => !user.cong_ty_ids.includes(id))) return c.json({ error: "FORBIDDEN" }, 403);
    const duTatCa = tatCa.every((x) => user.cong_ty_ids.includes(x.id));
    if (!congTy.length && !duTatCa) congTy = tatCa.map((x) => x.id).filter((id) => user.cong_ty_ids.includes(id));
  }
  await c.env.DB.prepare(
    `INSERT INTO bao_cao_email_cau_hinh (id, nguoi_nhan, cong_ty_ids, tu_dong, dinh_kem_excel, nguoi_cap_nhat, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET nguoi_nhan = excluded.nguoi_nhan, cong_ty_ids = excluded.cong_ty_ids, tu_dong = excluded.tu_dong,
       dinh_kem_excel = excluded.dinh_kem_excel, nguoi_cap_nhat = excluded.nguoi_cap_nhat, updated_at = excluded.updated_at`,
  )
    .bind(JSON.stringify(nguoiNhan), congTy.length ? JSON.stringify(congTy) : null, body.tu_dong === false ? 0 : 1, body.dinh_kem_excel === false ? 0 : 1, c.get("user").email, nowVN())
    .run();
  return c.json({ ok: true });
});

// GET /xem-truoc?tu&den - HTML email dung nhu se gui (hien trong iframe).
baoCaoEmail.get("/xem-truoc", async (c) => {
  const ch = await docCauHinh(c.env.DB);
  const { tu, den } = kyYeuCau(c.req.query("tu"), c.req.query("den"));
  const bc = await thuThapBaoCao(c.env.DB, congTyCuaNguoi(c.get("user"), ch.cong_ty_ids), tu, den);
  return c.html(taoHtmlBaoCao(bc, c.env.FRONTEND_URL || new URL(c.req.url).origin), 200, { "Cache-Control": "no-store", "X-Tieu-De": encodeURIComponent(tieuDeBaoCao(bc)) });
});

// GET /excel?tu&den - tai file Excel dinh kem.
baoCaoEmail.get("/excel", async (c) => {
  const ch = await docCauHinh(c.env.DB);
  const { tu, den } = kyYeuCau(c.req.query("tu"), c.req.query("den"));
  const bc = await thuThapBaoCao(c.env.DB, congTyCuaNguoi(c.get("user"), ch.cong_ty_ids), tu, den);
  return new Response(taoExcelBaoCao(bc), {
    headers: { "Content-Type": MIME_XLSX, "Content-Disposition": `attachment; filename="${tenFileExcel(bc)}"`, "Cache-Control": "no-store" },
  });
});

// POST /gui { tu?, den?, nguoi_nhan? } - gui ngay (nguoi_nhan: gui thu toi cac dia chi nay thay danh sach cau hinh).
baoCaoEmail.post("/gui", async (c) => {
  const body = await c.req.json<{ tu?: string; den?: string; nguoi_nhan?: string[] }>().catch(() => ({}) as { tu?: string; den?: string; nguoi_nhan?: string[] });
  const rieng = Array.isArray(body.nguoi_nhan) ? body.nguoi_nhan.map((x) => String(x).trim().toLowerCase()).filter(Boolean) : [];
  if (rieng.some((e) => !EMAIL_RE.test(e))) return c.json({ error: "EMAIL_KHONG_HOP_LE" }, 400);
  const user = c.get("user");
  const ch = await docCauHinh(c.env.DB);
  const kq = await guiBaoCao(c.env, "Thu cong", user.email, { tu: body.tu, den: body.den, nguoiNhanRieng: rieng, congTyIds: congTyCuaNguoi(user, ch.cong_ty_ids) });
  if (!kq.ok) return c.json({ error: kq.ma_loi, message: kq.loi }, kq.ma_loi === "GUI_LOI" || kq.ma_loi === "GMAIL_LOI" ? 502 : 400);
  return c.json(kq);
});

export default baoCaoEmail;
