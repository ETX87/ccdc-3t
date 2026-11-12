import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { nowVN } from "../lib/vnTime";
import { coCongTy, congTyLoc, congTyTao, laHcns } from "../lib/quyen";
import { layPhamViXemTon } from "../lib/phamVi";
import { danhGiaTon, tonVatTu } from "../lib/tonToiThieu";
import { TEN_KHO, TEN_NV } from "../lib/nhanCongTy";

const vtTieuHao = new Hono<{ Bindings: Env }>();
vtTieuHao.use("*", verifySessionMiddleware, loadUser);

vtTieuHao.get("/", async (c) => {
  const search = c.req.query("search")?.trim();
  // Danh muc rieng tung cong ty: ?cong_ty_id= (form theo kho dang chon) hoac cac cong ty dang xem.
  const conditions = ["v.vo_hieu_hoa = 0", "v.cong_ty_id IN (SELECT value FROM json_each(?))"];
  const binds: unknown[] = [JSON.stringify(congTyLoc(c.get("user"), c.req.query("cong_ty_id")))];
  if (search) {
    conditions.push("(LOWER(v.id) LIKE LOWER(?) OR LOWER(v.ten_vt) LIKE LOWER(?))");
    binds.push(`%${search}%`, `%${search}%`);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT v.id, v.ten_vt, v.nhom_id, n.ten_nhom, v.don_vi_tinh, v.don_gia_tham_khao, v.cong_ty_id, v.ton_toi_thieu, v.thoi_gian_dat_hang
     FROM vt_tieu_hao v LEFT JOIN nhom_ccdc n ON n.id = v.nhom_id
     WHERE ${conditions.join(" AND ")} ORDER BY v.ten_vt`,
  )
    .bind(...binds)
    .all<{ id: string; ton_toi_thieu: number | null }>();
  // ?kem_ton=1 (man Danh muc vat tu): tong ton cong ty (gom hang dang chuyen) + danh gia so voi ton toi thieu.
  if (c.req.query("kem_ton") === "1") {
    const ton = await tonVatTu(c.env.DB, congTyLoc(c.get("user"), c.req.query("cong_ty_id")), false);
    return c.json({
      rows: results.map((r) => {
        const sl = ton.get(r.id) ?? 0;
        return { ...r, ton: sl, ...danhGiaTon(sl, r.ton_toi_thieu) };
      }),
    });
  }
  return c.json({ rows: results });
});

interface Body {
  id?: string;
  ten_vt?: string;
  nhom_id?: number | null;
  don_vi_tinh?: string | null;
  don_gia_tham_khao?: number | null;
  cong_ty_id?: number;
  ton_toi_thieu?: number | null;
  thoi_gian_dat_hang?: string | null;
}

/** Ton toi thieu: so >= 0 (0 / rong = khong quy dinh -> NULL). undefined = loi dinh dang. */
function soToiThieu(v: unknown): number | null | undefined {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n > 0 ? n : null;
}
const ghiChuDatHang = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null);

/** Nhom phai cung cong ty voi vat tu (danh muc rieng tung cong ty). */
async function nhomHopLe(db: D1Database, nhomId: number | null | undefined, congTyId: number): Promise<boolean> {
  if (nhomId == null) return true;
  return !!(await db.prepare("SELECT 1 AS ok FROM nhom_ccdc WHERE id = ? AND cong_ty_id = ?").bind(nhomId, congTyId).first());
}

async function vtQuanTri(db: D1Database, user: Parameters<typeof laHcns>[0], id: string) {
  const v = await db.prepare("SELECT cong_ty_id FROM vt_tieu_hao WHERE id = ?").bind(id).first<{ cong_ty_id: number }>();
  if (!v) return { error: "NOT_FOUND" as const, status: 404 as const };
  if (!laHcns(user, v.cong_ty_id)) return { error: "FORBIDDEN" as const, status: 403 as const };
  return { congTyId: v.cong_ty_id };
}

// Ma vat tu TU SINH (2026-10-16, user yeu cau): "TS<ma cong ty>-" + 6 chu so, so tiep theo = max cac ma cung dang
// trong danh muc (vd TS3T-000344, TSNSKX-000273). Ma cu dang khac (TS3T-c550f9f2, ten tu do...) khong tinh vao day so.
async function tienToMa(db: D1Database, congTyId: number): Promise<string> {
  const ct = await db.prepare("SELECT ma FROM cong_ty WHERE id = ?").bind(congTyId).first<{ ma: string }>();
  return `TS${(ct?.ma ?? String(congTyId)).toUpperCase()}-`;
}
const SO_TIEP = (cot: string) =>
  `?1 || printf('%06d', COALESCE((SELECT MAX(CAST(substr(${cot}, length(?1) + 1) AS INTEGER)) FROM vt_tieu_hao
     WHERE ${cot} GLOB ?1 || '[0-9][0-9][0-9][0-9][0-9][0-9]'), 0) + 1)`;

// GET /ma-tiep-theo?cong_ty_id= - ma se duoc cap (hien truoc o form; ma that cap luc luu, co the khac neu ai vua them).
vtTieuHao.get("/ma-tiep-theo", requireRole("Admin", "HCNS"), async (c) => {
  const congTyId = congTyTao(c.get("user"), c.req.query("cong_ty_id"));
  if (!congTyId) return c.json({ error: "CHON_CONG_TY" }, 400);
  const row = await c.env.DB.prepare(`SELECT ${SO_TIEP("id")} AS ma`).bind(await tienToMa(c.env.DB, congTyId)).first<{ ma: string }>();
  return c.json({ ma: row?.ma });
});

// GET /:id/chi-tiet - "ho so" 1 vat tu tren 1 man (2026-10-30, user: tim 1 mat hang 1-2 click thay het): thong tin, ton
// tung kho (ca kho DA HET - co phat sinh nhung ton 0), dang chuyen, gia tri, ton toi thieu, LICH SU moi phiep (nhap mua,
// chuyen kho, cap phat NV, tieu dung VP, dieu chinh) va nguoi nhan cap phat. Pham vi: Admin/KT/HCNS (va quyen "xem ton")
// thay ca cong ty; thu kho / QL chi cac phieu + kho minh phu trach. Ton tinh CUNG quy tac v_ton_kho.
vtTieuHao.get("/:id/chi-tiet", async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const id = c.req.param("id");
  const vt = await db
    .prepare(
      `SELECT v.id, v.ten_vt, v.nhom_id, n.ten_nhom, v.don_vi_tinh, v.don_gia_tham_khao, v.cong_ty_id, ct.ma AS cong_ty_ma,
              v.ton_toi_thieu, v.thoi_gian_dat_hang, v.vo_hieu_hoa, v.created_at
       FROM vt_tieu_hao v LEFT JOIN nhom_ccdc n ON n.id = v.nhom_id LEFT JOIN cong_ty ct ON ct.id = v.cong_ty_id WHERE v.id = ?`,
    )
    .bind(id)
    .first<{ id: string; cong_ty_id: number; don_gia_tham_khao: number | null; ton_toi_thieu: number | null }>();
  if (!vt) return c.json({ error: "NOT_FOUND" }, 404);
  if (!coCongTy(user, vt.cong_ty_id)) return c.json({ error: "FORBIDDEN" }, 403);
  const pv = await layPhamViXemTon(db, user);
  if (!pv.xemTongHop && !user.xem_ton) return c.json({ error: "FORBIDDEN" }, 403);
  const toanCongTy = pv.toanBo || !!pv.congTyToan;
  const trongPv = (khoId: number | null) => khoId != null && (toanCongTy || pv.khoIds.includes(khoId));

  const [dong, ton] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT p.id AS phieu_id, p.ma_phieu, p.loai, p.trang_thai, p.created_at, p.updated_at, p.nguoi_lap, p.ghi_chu,
                p.tu_kho_id, ${TEN_KHO("kt")} AS tu_ten, kt.loai AS tu_loai, p.den_kho_id, ${TEN_KHO("kd")} AS den_ten, kd.loai AS den_loai,
                p.den_nhan_vien_id, ${TEN_NV("nv")} AS nv_ten, nv.bo_phan AS nv_bo_phan, p.nguoi_nhan_ten_tu_do, p.nha_cung_cap,
                ct.so_luong, ct.don_gia, ct.thanh_tien, ct.dau, ct.vt_id, ct.vt_id_den
         FROM phieu_chuyen_kho_ct ct JOIN phieu_chuyen_kho p ON p.id = ct.phieu_id
         LEFT JOIN kho kt ON kt.id = p.tu_kho_id LEFT JOIN kho kd ON kd.id = p.den_kho_id LEFT JOIN nhan_vien nv ON nv.ma_nv = p.den_nhan_vien_id
         WHERE ct.vt_id = ?1 OR ct.vt_id_den = ?1
         ORDER BY p.created_at DESC, p.ma_phieu DESC LIMIT 5000`,
      )
      .bind(id),
    db.prepare(`SELECT t.kho_id, t.ton, ${TEN_KHO("k")} AS ten_kho, k.loai, k.bat_tat FROM v_ton_kho t JOIN kho k ON k.id = t.kho_id WHERE t.vt_id = ?`).bind(id),
  ]);
  const S = (v: unknown) => (v == null ? null : String(v));
  const N = (v: unknown) => Number(v ?? 0) || 0;
  const giaTk = vt.don_gia_tham_khao ?? 0;

  // ---- lich su (theo pham vi): moi dong = 1 dong phieu, chieu so voi kho minh dang xem do frontend tu loc.
  const lichSu = dong.results
    .map((r) => {
      const vao = r.vt_id_den === id && r.vt_id !== id; // ve nhan cua phieu chuyen sang cong ty khac
      const ra = r.vt_id === id && r.vt_id_den != null && r.vt_id_den !== id;
      const loai = String(r.loai);
      const xuatTieuDung = loai === "Cap phat NV" && r.den_loai === "Tieu hao";
      const nguoiNhan = S(r.nv_ten) ?? S(r.nguoi_nhan_ten_tu_do);
      return {
        phieu_id: String(r.phieu_id),
        ma_phieu: S(r.ma_phieu),
        loai,
        kieu: loai === "Nhap mua" ? "nhap_mua" : loai === "Dieu chinh" ? "dieu_chinh" : xuatTieuDung ? "tieu_dung" : loai === "Cap phat NV" ? "cap_phat" : "chuyen_kho",
        trang_thai: String(r.trang_thai),
        ngay: String(r.created_at),
        nguoi_lap: S(r.nguoi_lap),
        tu_kho_id: r.tu_kho_id == null ? null : N(r.tu_kho_id),
        tu: loai === "Nhap mua" ? (S(r.nha_cung_cap) ?? S(r.tu_ten)) : S(r.tu_ten),
        den_kho_id: r.den_kho_id == null ? null : N(r.den_kho_id),
        den: S(r.den_ten) ?? nguoiNhan,
        den_nhan_vien_id: S(r.den_nhan_vien_id),
        nguoi_nhan: nguoiNhan,
        bo_phan: S(r.nv_bo_phan),
        so_luong: N(r.so_luong) * (loai === "Dieu chinh" ? (N(r.dau) < 0 ? -1 : 1) : 1),
        don_gia: r.don_gia == null ? null : N(r.don_gia),
        thanh_tien: r.thanh_tien != null ? N(r.thanh_tien) : N(r.so_luong) * (r.don_gia != null ? N(r.don_gia) : giaTk),
        khac_cong_ty: vao || ra,
        ghi_chu: S(r.ghi_chu),
      };
    })
    .filter((d) => toanCongTy || trongPv(d.tu_kho_id) || trongPv(d.den_kho_id));

  // ---- ton tung kho (v_ton_kho) + dang chuyen den + phat sinh cuoi / tong nhap-xuat (tu lich su).
  const HIEU_LUC_NHAP = (tt: string) => tt === "Da nhan";
  const HIEU_LUC_XUAT = (tt: string) => tt === "Dang chuyen" || tt === "Da nhan" || tt === "Da giao";
  const theoKho = ton.results
    .filter((r) => trongPv(N(r.kho_id)))
    .map((r) => {
      const k = N(r.kho_id);
      const cua = lichSu.filter((d) => d.tu_kho_id === k || d.den_kho_id === k);
      const nhap = cua.filter((d) => d.den_kho_id === k && d.kieu !== "dieu_chinh" && HIEU_LUC_NHAP(d.trang_thai)).reduce((s, d) => s + d.so_luong, 0);
      const xuat = cua.filter((d) => d.tu_kho_id === k && d.kieu !== "dieu_chinh" && HIEU_LUC_XUAT(d.trang_thai)).reduce((s, d) => s + d.so_luong, 0);
      const dieuChinh = cua.filter((d) => d.kieu === "dieu_chinh" && d.trang_thai === "Da dieu chinh").reduce((s, d) => s + d.so_luong, 0);
      const dangChuyenDen = cua.filter((d) => d.den_kho_id === k && d.trang_thai === "Dang chuyen").reduce((s, d) => s + d.so_luong, 0);
      return {
        kho_id: k,
        ten_kho: String(r.ten_kho),
        loai: String(r.loai),
        bat_tat: N(r.bat_tat),
        ton: N(r.ton),
        gia_tri: Math.max(0, N(r.ton)) * giaTk,
        dang_chuyen_den: dangChuyenDen,
        tong_nhap: nhap,
        tong_xuat: xuat,
        dieu_chinh: dieuChinh,
        phat_sinh_cuoi: cua[0]?.ngay ?? null,
      };
    })
    .sort((a, b) => b.ton - a.ton || String(b.phat_sinh_cuoi).localeCompare(String(a.phat_sinh_cuoi)));

  // ---- diem tieu dung VP (kho Tieu hao - khong tinh ton): da xuat vao bao nhieu.
  const tieuDung = new Map<number, { kho_id: number; ten_kho: string; so_luong: number; gia_tri: number; lan_cuoi: string }>();
  for (const d of lichSu.filter((x) => x.kieu === "tieu_dung" && x.trang_thai === "Da giao" && x.den_kho_id != null)) {
    const cu = tieuDung.get(d.den_kho_id!) ?? { kho_id: d.den_kho_id!, ten_kho: d.den ?? "", so_luong: 0, gia_tri: 0, lan_cuoi: d.ngay };
    cu.so_luong += d.so_luong;
    cu.gia_tri += d.thanh_tien;
    if (d.ngay > cu.lan_cuoi) cu.lan_cuoi = d.ngay;
    tieuDung.set(d.den_kho_id!, cu);
  }

  // ---- nguoi nhan cap phat NV (khong vao kho)
  const nguoiNhan = new Map<string, { ma_nv: string | null; ten: string; bo_phan: string | null; so_luong: number; so_lan: number; gia_tri: number; lan_cuoi: string }>();
  for (const d of lichSu.filter((x) => x.kieu === "cap_phat" && x.trang_thai === "Da giao")) {
    const key = d.den_nhan_vien_id ?? `~${d.nguoi_nhan ?? ""}`;
    const cu = nguoiNhan.get(key) ?? { ma_nv: d.den_nhan_vien_id, ten: d.nguoi_nhan ?? "-", bo_phan: d.bo_phan, so_luong: 0, so_lan: 0, gia_tri: 0, lan_cuoi: d.ngay };
    cu.so_luong += d.so_luong;
    cu.so_lan++;
    cu.gia_tri += d.thanh_tien;
    if (d.ngay > cu.lan_cuoi) cu.lan_cuoi = d.ngay;
    nguoiNhan.set(key, cu);
  }

  // ---- tong hop
  const nhapMua = lichSu.filter((d) => d.kieu === "nhap_mua" && d.trang_thai === "Da nhan");
  const coGia = nhapMua.filter((d) => d.don_gia != null && d.don_gia > 0);
  const tongTon = theoKho.reduce((s, k) => s + k.ton, 0);
  const dangChuyen = lichSu.filter((d) => d.trang_thai === "Dang chuyen").reduce((s, d) => s + d.so_luong, 0);
  const tong = {
    ton: tongTon,
    gia_tri: Math.max(0, tongTon) * giaTk,
    dang_chuyen: dangChuyen,
    so_kho_con_hang: theoKho.filter((k) => k.ton > 0).length,
    so_kho_het: theoKho.filter((k) => k.ton === 0).length,
    so_kho_am: theoKho.filter((k) => k.ton < 0).length,
    nhap_mua: { so_luong: nhapMua.reduce((s, d) => s + d.so_luong, 0), gia_tri: nhapMua.reduce((s, d) => s + d.thanh_tien, 0), so_phieu: nhapMua.length },
    cap_phat_nv: [...nguoiNhan.values()].reduce((s, x) => ({ so_luong: s.so_luong + x.so_luong, gia_tri: s.gia_tri + x.gia_tri, so_nguoi: s.so_nguoi + 1 }), { so_luong: 0, gia_tri: 0, so_nguoi: 0 }),
    tieu_dung_vp: [...tieuDung.values()].reduce((s, x) => ({ so_luong: s.so_luong + x.so_luong, gia_tri: s.gia_tri + x.gia_tri }), { so_luong: 0, gia_tri: 0 }),
    gia_nhap_cuoi: coGia[0]?.don_gia ?? null,
    ngay_nhap_cuoi: nhapMua[0]?.ngay ?? null,
    gia_nhap_tb: coGia.length ? coGia.reduce((s, d) => s + d.thanh_tien, 0) / coGia.reduce((s, d) => s + d.so_luong, 0) : null,
    phat_sinh_cuoi: lichSu[0]?.ngay ?? null,
  };
  // Ton toi thieu la chi tieu CONG TY -> chi danh gia khi xem toan cong ty (gom hang dang chuyen, nhu lib/tonToiThieu).
  const toiThieu = toanCongTy ? { ton_toi_thieu: vt.ton_toi_thieu, ...danhGiaTon(tongTon + dangChuyen, vt.ton_toi_thieu) } : null;

  return c.json({
    vt,
    pham_vi: toanCongTy ? "cong_ty" : "kho",
    tong,
    toi_thieu: toiThieu,
    theo_kho: theoKho,
    tieu_dung: [...tieuDung.values()].sort((a, b) => b.so_luong - a.so_luong),
    nguoi_nhan: [...nguoiNhan.values()].sort((a, b) => b.lan_cuoi.localeCompare(a.lan_cuoi)),
    lich_su: lichSu,
    cap_nhat_luc: nowVN(),
  });
});

vtTieuHao.post("/", requireRole("Admin", "HCNS"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<Body>().catch(() => null);
  if (!body?.ten_vt?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);
  const congTyId = congTyTao(user, body.cong_ty_id);
  if (!congTyId || !laHcns(user, congTyId)) return c.json({ error: "CHON_CONG_TY" }, 400);
  if (!(await nhomHopLe(c.env.DB, body.nhom_id, congTyId))) return c.json({ error: "NHOM_KHAC_CONG_TY" }, 400);
  const toiThieu = soToiThieu(body.ton_toi_thieu);
  if (toiThieu === undefined) return c.json({ error: "TON_TOI_THIEU_KHONG_HOP_LE" }, 400);

  // Sinh ma NGAY TRONG lenh INSERT (1 cau lenh = nguyen tu, 2 nguoi them cung luc khong trung so); trung PK hiem
  // hoi (vd ma cu trung dang) -> thu lai vai lan.
  const tienTo = await tienToMa(c.env.DB, congTyId);
  for (let lan = 0; lan < 3; lan++) {
    try {
      const row = await c.env.DB.prepare(
        `INSERT INTO vt_tieu_hao (id, ten_vt, nhom_id, don_vi_tinh, don_gia_tham_khao, nguoi_tao, cong_ty_id, created_at, updated_at, ton_toi_thieu, thoi_gian_dat_hang)
         VALUES (${SO_TIEP("id")}, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?9, ?10) RETURNING id`,
      )
        .bind(tienTo, body.ten_vt.trim(), body.nhom_id ?? null, body.don_vi_tinh ?? null, body.don_gia_tham_khao ?? null, user.email, congTyId, nowVN(), toiThieu, ghiChuDatHang(body.thoi_gian_dat_hang))
        .first<{ id: string }>();
      return c.json({ ok: true, id: row?.id });
    } catch (e) {
      if (!String(e).includes("UNIQUE constraint failed") || lan === 2) throw e;
    }
  }
  return c.json({ error: "ID_EXISTS" }, 409);
});

vtTieuHao.put("/:id", requireRole("Admin", "HCNS"), async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<Body>().catch(() => null);
  if (!body?.ten_vt?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);
  const q = await vtQuanTri(c.env.DB, c.get("user"), id ?? "");
  if ("error" in q) return c.json({ error: q.error }, q.status);
  if (!(await nhomHopLe(c.env.DB, body.nhom_id, q.congTyId))) return c.json({ error: "NHOM_KHAC_CONG_TY" }, 400);
  const toiThieu = soToiThieu(body.ton_toi_thieu);
  if (toiThieu === undefined) return c.json({ error: "TON_TOI_THIEU_KHONG_HOP_LE" }, 400);

  // Khong gui ton_toi_thieu / thoi_gian_dat_hang (client cu) -> giu nguyen.
  const coToiThieu = "ton_toi_thieu" in body ? 1 : 0;
  const coDatHang = "thoi_gian_dat_hang" in body ? 1 : 0;
  const result = await c.env.DB.prepare(
    `UPDATE vt_tieu_hao SET ten_vt = ?, nhom_id = ?, don_vi_tinh = ?, don_gia_tham_khao = ?, updated_at = ?,
       ton_toi_thieu = CASE WHEN ? THEN ? ELSE ton_toi_thieu END, thoi_gian_dat_hang = CASE WHEN ? THEN ? ELSE thoi_gian_dat_hang END
     WHERE id = ?`,
  )
    .bind(body.ten_vt.trim(), body.nhom_id ?? null, body.don_vi_tinh ?? null, body.don_gia_tham_khao ?? null, nowVN(), coToiThieu, toiThieu, coDatHang, ghiChuDatHang(body.thoi_gian_dat_hang), id)
    .run();
  if ((result.meta.changes ?? 0) === 0) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json({ ok: true });
});

// POST /ton-toi-thieu/import { cong_ty_id, dong: [{ dong, ten, dvt?, ton_toi_thieu, ghi_chu?, vt_id? }], thuc_hien? }
// Nhap ton toi thieu hang loat tu Excel (mau "TON KHO TOI THIEU.xlsx": ten CCDC, DVT, ton toi thieu, ghi chu thoi gian
// dat hang). Khop ten trong danh muc cong ty: trung khop nguyen van (chuan hoa) truoc, roi bo dau; nhieu vat tu cung ten ->
// loc them theo DVT. Dong chua khop / khop nhieu: client chon tay vt_id. thuc_hien = true -> ghi moi dong da xac dinh
// duoc vat tu (1 db.batch); khong thi chi xem truoc.
const boDau = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

vtTieuHao.post("/ton-toi-thieu/import", requireRole("Admin", "HCNS"), async (c) => {
  const user = c.get("user");
  const body = await c.req
    .json<{ cong_ty_id?: number; thuc_hien?: boolean; dong?: { dong: number; ten?: string; dvt?: string; ton_toi_thieu?: unknown; ghi_chu?: string; vt_id?: string }[] }>()
    .catch(() => null);
  const congTyId = congTyTao(user, body?.cong_ty_id);
  if (!congTyId || !laHcns(user, congTyId)) return c.json({ error: "CHON_CONG_TY" }, 400);
  const dong = (body?.dong ?? []).filter((d) => d && (d.ten?.trim() || d.vt_id));
  if (!dong.length || dong.length > 2000) return c.json({ error: "FILE_RONG" }, 400);

  const { results: vts } = await c.env.DB.prepare(
    "SELECT id, ten_vt, don_vi_tinh, ton_toi_thieu, thoi_gian_dat_hang FROM vt_tieu_hao WHERE vo_hieu_hoa = 0 AND cong_ty_id = ?",
  )
    .bind(congTyId)
    .all<{ id: string; ten_vt: string; don_vi_tinh: string | null; ton_toi_thieu: number | null; thoi_gian_dat_hang: string | null }>();
  const theoId = new Map(vts.map((v) => [v.id, v]));
  const chuan = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

  const kq = dong.map((d) => {
    const ten = (d.ten ?? "").trim();
    const toiThieu = soToiThieu(d.ton_toi_thieu);
    let ung: typeof vts = [];
    if (d.vt_id) ung = theoId.has(d.vt_id) ? [theoId.get(d.vt_id)!] : [];
    else {
      ung = vts.filter((v) => chuan(v.ten_vt) === chuan(ten));
      if (!ung.length) ung = vts.filter((v) => boDau(v.ten_vt) === boDau(ten));
      if (ung.length > 1 && d.dvt?.trim()) {
        const cungDvt = ung.filter((v) => boDau(v.don_vi_tinh ?? "") === boDau(d.dvt!));
        if (cungDvt.length) ung = cungDvt;
      }
    }
    // Goi y khi chua khop: ten chua nhau (bo dau), toi da 5.
    const k = boDau(ten);
    const goiY =
      ung.length === 1 || !k
        ? []
        : (ung.length > 1 ? ung : vts.filter((v) => boDau(v.ten_vt).includes(k) || k.includes(boDau(v.ten_vt)))).slice(0, 5).map((v) => ({ id: v.id, ten_vt: v.ten_vt, don_vi_tinh: v.don_vi_tinh }));
    const vt = ung.length === 1 ? ung[0] : null;
    return {
      dong: d.dong,
      ten,
      dvt: d.dvt ?? null,
      ton_toi_thieu: toiThieu ?? null,
      ghi_chu: ghiChuDatHang(d.ghi_chu),
      ket_qua: toiThieu === undefined ? "loi_so" : vt ? "khop" : ung.length > 1 ? "nhieu" : "khong_thay",
      vt_id: vt?.id ?? null,
      ten_vt: vt?.ten_vt ?? null,
      don_vi_tinh: vt?.don_vi_tinh ?? null,
      cu: vt ? { ton_toi_thieu: vt.ton_toi_thieu, thoi_gian_dat_hang: vt.thoi_gian_dat_hang } : null,
      goi_y: goiY,
    };
  });

  const ghi = kq.filter((r) => r.ket_qua === "khop");
  // 2 dong cung tro 1 vat tu -> dong sau thang (bao de nguoi dung biet).
  const trung = ghi.filter((r, i) => ghi.findIndex((x) => x.vt_id === r.vt_id) !== i).map((r) => r.dong);
  if (body?.thuc_hien && ghi.length) {
    const now = nowVN();
    await c.env.DB.batch(
      ghi.map((r) =>
        c.env.DB.prepare("UPDATE vt_tieu_hao SET ton_toi_thieu = ?, thoi_gian_dat_hang = COALESCE(?, thoi_gian_dat_hang), updated_at = ? WHERE id = ? AND cong_ty_id = ?").bind(
          r.ton_toi_thieu,
          r.ghi_chu,
          now,
          r.vt_id,
          congTyId,
        ),
      ),
    );
  }
  return c.json({ dong: kq, so_khop: ghi.length, trung, da_ghi: !!body?.thuc_hien });
});

// PATCH /:id/ton-toi-thieu { ton_toi_thieu, thoi_gian_dat_hang } - CHI sua cai dat ton toi thieu (nut sua nhanh o danh
// muc / ho so vat tu, 2026-11-03) - khong dong cac truong khac nhu PUT. Admin / HCNS cong ty cua vat tu.
vtTieuHao.patch("/:id/ton-toi-thieu", requireRole("Admin", "HCNS"), async (c) => {
  const id = c.req.param("id") ?? "";
  const body = await c.req.json<{ ton_toi_thieu?: unknown; thoi_gian_dat_hang?: unknown }>().catch(() => null);
  if (!body) return c.json({ error: "MISSING_FIELDS" }, 400);
  const q = await vtQuanTri(c.env.DB, c.get("user"), id);
  if ("error" in q) return c.json({ error: q.error }, q.status);
  const toiThieu = soToiThieu(body.ton_toi_thieu);
  if (toiThieu === undefined) return c.json({ error: "TON_TOI_THIEU_KHONG_HOP_LE" }, 400);
  await c.env.DB.prepare("UPDATE vt_tieu_hao SET ton_toi_thieu = ?, thoi_gian_dat_hang = ?, updated_at = ? WHERE id = ?")
    .bind(toiThieu, ghiChuDatHang(body.thoi_gian_dat_hang), nowVN(), id)
    .run();
  return c.json({ ok: true, ton_toi_thieu: toiThieu });
});

vtTieuHao.delete("/:id", requireRole("Admin", "HCNS"), async (c) => {
  const id = c.req.param("id");
  const q = await vtQuanTri(c.env.DB, c.get("user"), id ?? "");
  if ("error" in q) return c.json({ error: q.error }, q.status);
  await c.env.DB.prepare("UPDATE vt_tieu_hao SET vo_hieu_hoa = 1, updated_at = ? WHERE id = ?").bind(nowVN(), id).run();
  return c.json({ ok: true });
});

export default vtTieuHao;
