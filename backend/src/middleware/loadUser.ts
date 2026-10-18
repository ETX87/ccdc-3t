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
  xem_ton?: number;
}

export async function loadUser(c: Context<{ Bindings: Env }>, next: Next) {
  const email = c.get("email");

  let row = await c.env.DB.prepare("SELECT email, ten, vai_tro, trang_thai_duyet, bi_khoa, anh_dai_dien, xem_ton FROM users WHERE email = ?")
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
    cong_ty_ids: [],
    cong_ty_xem: [],
    tat_ca_cong_ty: false,
    xem_ton: !!row.xem_ton,
  };
  let nv = await c.env.DB.prepare("SELECT ma_nv, cong_ty_id FROM nhan_vien WHERE email_dang_nhap = ? AND dang_lam_viec = 1 LIMIT 1")
    .bind(row.email)
    .first<{ ma_nv: string; cong_ty_id?: number }>();
  if (!nv) {
    // Tu lien ket: tai khoan (da duyet) co email trung gmail cua dung 1 ho so nhan vien dang lam viec
    // chua lien ket ai (gmail tu ETX / du lieu cu) -> gan email_dang_nhap, khoi can HCNS gan tay.
    const { results: cands } = await c.env.DB.prepare(
      "SELECT ma_nv, cong_ty_id FROM nhan_vien WHERE LOWER(gmail) = LOWER(?) AND dang_lam_viec = 1 AND email_dang_nhap IS NULL LIMIT 2",
    )
      .bind(row.email)
      .all<{ ma_nv: string; cong_ty_id?: number }>();
    if (cands.length === 1) {
      await c.env.DB.prepare("UPDATE nhan_vien SET email_dang_nhap = ? WHERE ma_nv = ? AND email_dang_nhap IS NULL").bind(row.email, cands[0].ma_nv).run();
      nv = cands[0];
    }
  }
  user.ma_nv = nv?.ma_nv ?? null;

  // Cong ty duoc phep = gan them (user_cong_ty) + cong ty ho so nhan vien cua minh + cong ty cac kho minh la
  // thu kho; khong co gi -> cong ty mac dinh. Admin: moi cong ty. (xem types.ts AppUser)
  const [ct, gan] = await c.env.DB.batch<{ id: number; mac_dinh?: number }>([
    c.env.DB.prepare("SELECT id, mac_dinh FROM cong_ty WHERE bat_tat = 1 ORDER BY id"),
    c.env.DB.prepare(
      `SELECT cong_ty_id AS id FROM user_cong_ty WHERE email = ?
       UNION SELECT k.cong_ty_id FROM kho_thu_kho t JOIN kho k ON k.id = t.kho_id WHERE t.email = ?
       UNION SELECT cong_ty_id FROM nhan_vien_cong_ty WHERE ma_nv = ?`,
    ).bind(row.email, row.email, nv?.ma_nv ?? ""),
  ]);
  const hoatDong = ct.results.map((r) => r.id);
  const tap = new Set(gan.results.map((r) => r.id));
  if (nv?.cong_ty_id != null) tap.add(nv.cong_ty_id);
  if (!tap.size) {
    const macDinh = ct.results.find((r) => r.mac_dinh)?.id ?? hoatDong[0];
    if (macDinh != null) tap.add(macDinh);
  }
  const duocPhep = user.vai_tro === "Admin" ? hoatDong : hoatDong.filter((id) => tap.has(id));
  const loc = Number(c.req.header("x-cong-ty") || c.req.query("cong_ty") || 0);
  user.cong_ty_ids = duocPhep;
  user.cong_ty_xem = loc && duocPhep.includes(loc) ? [loc] : duocPhep;
  user.tat_ca_cong_ty = hoatDong.length > 0 && hoatDong.every((id) => user.cong_ty_xem.includes(id));

  c.set("user", user);
  await next();
}
