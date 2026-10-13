import { Hono } from "hono";
import type { Env, TrangThaiDuyet, VaiTro } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireAdmin } from "../middleware/requireAdmin";
import { nowVN } from "../lib/vnTime";

// Route Admin-only: duyet/tu choi/khoa tai khoan + phan vai tro (Admin / Ke toan / HCNS / Quan ly / Nhan vien).
const adminUsers = new Hono<{ Bindings: Env }>();
adminUsers.use("*", verifySessionMiddleware, loadUser, requireAdmin);

const TAB_TRANG_THAI: Record<string, TrangThaiDuyet> = {
  "cho-duyet": "Cho duyet",
  "da-duyet": "Da duyet",
  "tu-choi": "Tu choi",
};

adminUsers.get("/", async (c) => {
  const tab = c.req.query("tab") ?? "cho-duyet";
  const search = c.req.query("search")?.trim();

  const conditions: string[] = [];
  const binds: unknown[] = [];

  if (TAB_TRANG_THAI[tab]) {
    conditions.push("u.trang_thai_duyet = ?");
    binds.push(TAB_TRANG_THAI[tab]);
  }
  if (search) {
    conditions.push("(LOWER(u.email) LIKE LOWER(?) OR LOWER(COALESCE(u.ten,'')) LIKE LOWER(?))");
    binds.push(`%${search}%`, `%${search}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { results } = await c.env.DB.prepare(
    `SELECT u.email, u.ten, u.vai_tro, u.trang_thai_duyet, u.bi_khoa, u.xem_ton, u.created_at, u.anh_dai_dien,
            nv.ma_nv, nv.ten_nv, nv.bo_phan,
            (SELECT GROUP_CONCAT(k.ten_kho, ', ') FROM kho_thu_kho t JOIN kho k ON k.id = t.kho_id WHERE t.email = u.email) AS kho_thu_kho,
            nv.cong_ty_id AS cong_ty_nv,
            (SELECT GROUP_CONCAT(g.cong_ty_id) FROM user_cong_ty g WHERE g.email = u.email) AS cong_ty_gan
     FROM users u
     -- email_dang_nhap khong UNIQUE: lay 1 ho so (uu tien dang lam viec) de khong nhan doi dong user
     LEFT JOIN nhan_vien nv ON nv.ma_nv = (SELECT x.ma_nv FROM nhan_vien x WHERE x.email_dang_nhap = u.email
                                           ORDER BY x.dang_lam_viec DESC LIMIT 1)
     ${where} ORDER BY u.created_at DESC`,
  )
    .bind(...binds)
    .all<{
      email: string;
      ten: string | null;
      vai_tro: VaiTro | null;
      trang_thai_duyet: TrangThaiDuyet;
      bi_khoa: number;
      created_at: string;
    }>();
  return c.json({
    rows: results.map((r) => {
      const gan = (r as { cong_ty_gan?: string | null }).cong_ty_gan;
      return { ...r, bi_khoa: !!r.bi_khoa, cong_ty_gan: gan ? gan.split(",").map(Number) : [] };
    }),
  });
});

// PUT /:email/cong-ty - gan cac cong ty tai khoan duoc XEM / thao tac them (da phap nhan). Cong ty cua ho so
// nhan vien + cong ty cac kho la thu kho luon duoc tinh them (middleware/loadUser.ts), khong can gan o day.
adminUsers.put("/:email/cong-ty", async (c) => {
  const email = decodeURIComponent(c.req.param("email"));
  const body = await c.req.json<{ cong_ty_ids?: number[] }>().catch(() => null);
  const ids = [...new Set((body?.cong_ty_ids ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const db = c.env.DB;
  const u = await db.prepare("SELECT email FROM users WHERE email = ?").bind(email).first();
  if (!u) return c.json({ error: "NOT_FOUND" }, 404);
  if (ids.length) {
    const { results } = await db.prepare("SELECT id FROM cong_ty WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids)).all();
    if (results.length !== ids.length) return c.json({ error: "CONG_TY_NOT_FOUND" }, 400);
  }
  const now = nowVN();
  await db.batch([
    db.prepare("DELETE FROM user_cong_ty WHERE email = ?").bind(email),
    ...ids.map((id) => db.prepare("INSERT INTO user_cong_ty (email, cong_ty_id, created_at) VALUES (?, ?, ?)").bind(email, id, now)),
  ]);
  return c.json({ ok: true });
});

interface PatchUserBody {
  trang_thai_duyet?: TrangThaiDuyet;
  vai_tro?: VaiTro | null;
  bi_khoa?: boolean;
  xem_ton?: boolean;
}

const VALID_VAI_TRO: VaiTro[] = ["Admin", "Ke toan", "HCNS", "Quan ly"];

// PATCH /:email - chan sua BOOTSTRAP_ADMIN_EMAIL (tranh tu khoa/ha quyen chinh minh, mat het loi
// vao he thong - tai khoan nay tu dong lay lai Admin/Da duyet moi lan dang nhap, xem routes/auth.ts).
adminUsers.patch("/:email", async (c) => {
  const email = decodeURIComponent(c.req.param("email"));
  if (email === c.env.BOOTSTRAP_ADMIN_EMAIL) return c.json({ error: "CANNOT_MODIFY_BOOTSTRAP_ADMIN" }, 400);

  const body = await c.req.json<PatchUserBody>().catch(() => null);
  if (!body) return c.json({ error: "INVALID_BODY" }, 400);
  if (body.trang_thai_duyet !== undefined && !["Da duyet", "Tu choi", "Cho duyet"].includes(body.trang_thai_duyet)) {
    return c.json({ error: "INVALID_TRANG_THAI_DUYET" }, 400);
  }
  if (body.vai_tro !== undefined && body.vai_tro !== null && !VALID_VAI_TRO.includes(body.vai_tro)) {
    return c.json({ error: "INVALID_VAI_TRO" }, 400);
  }

  const existing = await c.env.DB.prepare("SELECT email FROM users WHERE email = ?").bind(email).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const sets: string[] = [];
  const binds: unknown[] = [];
  if (body.trang_thai_duyet !== undefined) {
    sets.push("trang_thai_duyet = ?");
    binds.push(body.trang_thai_duyet);
  }
  if (body.vai_tro !== undefined) {
    sets.push("vai_tro = ?");
    binds.push(body.vai_tro);
  }
  if (body.bi_khoa !== undefined) {
    sets.push("bi_khoa = ?");
    binds.push(body.bi_khoa ? 1 : 0);
  }
  if (body.xem_ton !== undefined) {
    sets.push("xem_ton = ?");
    binds.push(body.xem_ton ? 1 : 0);
  }
  if (sets.length === 0) return c.json({ error: "NO_FIELDS" }, 400);
  sets.push("updated_at = ?");
  binds.push(nowVN());
  binds.push(email);

  await c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE email = ?`)
    .bind(...binds)
    .run();

  return c.json({ ok: true });
});

export default adminUsers;
