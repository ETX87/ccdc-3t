import type { Context, Next } from "hono";
import { nowVN } from "../lib/vnTime";
import type { AppUser, Env, VaiTro } from "../types";

interface UserRow {
  email: string;
  ten: string | null;
  vai_tro: VaiTro | null;
  trang_thai_duyet: "Cho duyet" | "Da duyet" | "Tu choi";
  bi_khoa: number;
  anh_dai_dien: string | null;
}

export async function loadUser(c: Context<{ Bindings: Env }>, next: Next) {
  const email = c.get("email");

  let row = await c.env.DB.prepare("SELECT email, ten, vai_tro, trang_thai_duyet, bi_khoa, anh_dai_dien FROM users WHERE email = ?")
    .bind(email)
    .first<UserRow>();

  if (!row) {
    const isBootstrapAdmin = email === c.env.BOOTSTRAP_ADMIN_EMAIL;
    row = await c.env.DB.prepare(
      `INSERT INTO users (email, vai_tro, trang_thai_duyet, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       RETURNING email, ten, vai_tro, trang_thai_duyet, bi_khoa, anh_dai_dien`,
    )
      .bind(email, isBootstrapAdmin ? "Admin" : null, isBootstrapAdmin ? "Da duyet" : "Cho duyet", nowVN(), nowVN())
      .first<UserRow>();
  }

  if (!row) return c.json({ error: "USER_LOAD_FAILED" }, 500);

  if (row.bi_khoa) return c.json({ error: "DISABLED" }, 403);
  if (row.trang_thai_duyet === "Cho duyet") return c.json({ error: "PENDING_APPROVAL" }, 403);
  if (row.trang_thai_duyet === "Tu choi") return c.json({ error: "REJECTED" }, 403);

  const user: AppUser = {
    email: row.email,
    ten: row.ten ?? "",
    vai_tro: row.vai_tro,
    trang_thai_duyet: row.trang_thai_duyet,
    bi_khoa: !!row.bi_khoa,
    ma_nv: null,
    anh_dai_dien: row.anh_dai_dien ?? null,
  };
  let nv = await c.env.DB.prepare("SELECT ma_nv FROM nhan_vien WHERE email_dang_nhap = ? AND dang_lam_viec = 1 LIMIT 1")
    .bind(row.email)
    .first<{ ma_nv: string }>();
  if (!nv) {
    // Tu lien ket: tai khoan (da duyet) co email trung gmail cua dung 1 ho so nhan vien dang lam viec
    // chua lien ket ai (gmail tu ETX / du lieu cu) -> gan email_dang_nhap, khoi can HCNS gan tay.
    const { results: cands } = await c.env.DB.prepare(
      "SELECT ma_nv FROM nhan_vien WHERE LOWER(gmail) = LOWER(?) AND dang_lam_viec = 1 AND email_dang_nhap IS NULL LIMIT 2",
    )
      .bind(row.email)
      .all<{ ma_nv: string }>();
    if (cands.length === 1) {
      await c.env.DB.prepare("UPDATE nhan_vien SET email_dang_nhap = ? WHERE ma_nv = ? AND email_dang_nhap IS NULL").bind(row.email, cands[0].ma_nv).run();
      nv = cands[0];
    }
  }
  user.ma_nv = nv?.ma_nv ?? null;

  c.set("user", user);
  await next();
}
