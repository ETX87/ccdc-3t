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
    `SELECT u.email, u.ten, u.vai_tro, u.trang_thai_duyet, u.bi_khoa, u.created_at, u.anh_dai_dien,
            nv.ma_nv, nv.ten_nv, nv.bo_phan,
            (SELECT GROUP_CONCAT(k.ten_kho, ', ') FROM kho_thu_kho t JOIN kho k ON k.id = t.kho_id WHERE t.email = u.email) AS kho_thu_kho
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
  return c.json({ rows: results.map((r) => ({ ...r, bi_khoa: !!r.bi_khoa })) });
});

interface PatchUserBody {
  trang_thai_duyet?: TrangThaiDuyet;
  vai_tro?: VaiTro | null;
  bi_khoa?: boolean;
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
