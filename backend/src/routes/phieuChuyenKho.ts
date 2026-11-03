import { Hono, type Context } from "hono";
import type { AppUser, Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { nowVN } from "../lib/vnTime";
import { coCongTy, duocThemNvVaoCongTy, getKho, guardTonKhongAm, khoNhanHang, khoPhuTrach, laBenNhan, laCapDuoi, laNguoiLap, laHcns, laKeToan, laKhoTon, laThuKho, tonKho } from "../lib/quyen";
import { NV_THUOC_CT, lenhTaoKhoQl, nvThuocCongTy } from "../lib/nvCongTy";
import { ghepVatTu } from "../lib/ghepVatTu";
import { sinhMaPhieu, TIEN_TO_CHUYEN_KHO } from "../lib/maPhieu";
import { dkPhieuKho, layPhamVi, type PhamVi } from "../lib/phamVi";
import { docTrang, layTrang } from "../lib/phanTrang";

/**
 * Phieu nguoi dung duoc xem: kho trong pham vi + phieu minh lap + phieu cap cho nhom minh (ban than/cap duoi),
 * va luon chi phieu co kho nguon HOAC dich thuoc cac cong ty dang xem (chuyen cong ty hien o ca 2 ben).
 */
function dkXemPhieu(pv: PhamVi, user: AppUser) {
  const k = dkPhieuKho(pv);
  const ct = JSON.stringify(user.cong_ty_xem);
  const congTy = user.tat_ca_cong_ty
    ? { sql: "1=1", binds: [] as unknown[] }
    : {
        sql: "(p.tu_kho_id IN (SELECT id FROM kho WHERE cong_ty_id IN (SELECT value FROM json_each(?))) OR p.den_kho_id IN (SELECT id FROM kho WHERE cong_ty_id IN (SELECT value FROM json_each(?))))",
        binds: [ct, ct] as unknown[],
      };
  if (pv.toanBo) return { sql: `(${k.sql} AND ${congTy.sql})`, binds: [...k.binds, ...congTy.binds] };
  const nhom = pv.nhomMaNv.length ? " OR p.den_nhan_vien_id IN (SELECT value FROM json_each(?))" : "";
  return {
    sql: `((${k.sql} OR p.nguoi_lap = ?${nhom}) AND ${congTy.sql})`,
    binds: [...k.binds, user.email, ...(pv.nhomMaNv.length ? [JSON.stringify(pv.nhomMaNv)] : []), ...congTy.binds],
  };
}

// Phieu chuyen kho TAI SAN TIEU HAO (thay phieu_tieu_hao phang cu). Luong da chot voi user 2026-09-23:
//   Nhap mua   : kho Mua hang -> kho HCNS, HCNS lap, CHI buoc nay can Ke toan duyet.
//   Chuyen kho : kho -> kho, thu kho nguon lap -> 'Dang chuyen' (TRU nguon ngay) -> thu kho dich nhan
//                ('Da nhan', cong dich) hoac tu choi ('Bi tu choi', hoan nguon).
//   Cap phat NV: kho -> nhan vien (tieu hao het) -> 'Da giao' ngay; NV co tai khoan bam xac nhan.
//                Hoac kho -> KHO TIEU HAO van phong (den_kho_id, loai 'Tieu hao' - 2026-10-09): tieu dung het,
//                'Da giao' + da_xac_nhan = 1 ngay (khong ai phai xac nhan, kho tieu hao khong tinh ton).
//   Dieu chinh : chenh lech ton thuc te (POST /dieu-chinh, ct.dau +1/-1) -> KT duyet -> 'Da dieu chinh'.
//   Phieu cho KT duyet (Nhap mua / chuyen cong ty) sua / huy duoc toi khi KT duyet (PUT /:id, /:id/huy); phieu
//   bi tu choi nhan: gui lai (tao phieu moi, gui_lai_tu) hoac danh dau da xu ly.
// Quyen nguon/dich (IDOR): kho HCNS/Mien -> moi kho/moi NV; kho QL -> chi cap duoi truc tiep cua chu
// kho, hoac tra ve kho HCNS/Mien. Moi ghi nhieu bang qua db.batch() + chot chan ton khong am.
const phieuChuyenKho = new Hono<{ Bindings: Env }>();
phieuChuyenKho.use("*", verifySessionMiddleware, loadUser);

const LOAI = ["Nhap mua", "Chuyen kho", "Cap phat NV"] as const;
type Loai = (typeof LOAI)[number];

phieuChuyenKho.get("/", async (c) => {
  const user = c.get("user");
  const q = (k: string) => c.req.query(k);
  const pham = dkXemPhieu(await layPhamVi(c.env.DB, user), user);
  const conditions: string[] = [pham.sql];
  const binds: unknown[] = [...pham.binds];

  if (q("kho_id")) {
    conditions.push("(p.tu_kho_id = ? OR p.den_kho_id = ?)");
    binds.push(Number(q("kho_id")), Number(q("kho_id")));
  }
  if (q("loai")) {
    conditions.push("p.loai = ?");
    binds.push(q("loai"));
  }
  if (q("trang_thai")) {
    conditions.push("p.trang_thai = ?");
    binds.push(q("trang_thai"));
  }
  if (q("thang")) {
    conditions.push("substr(p.created_at, 1, 7) = ?");
    binds.push(q("thang"));
  }
  if (q("nhan_vien_id")) {
    conditions.push("p.den_nhan_vien_id = ?");
    binds.push(q("nhan_vien_id"));
  }
  if (q("vt_id")) {
    conditions.push("EXISTS (SELECT 1 FROM phieu_chuyen_kho_ct x WHERE x.phieu_id = p.id AND x.vt_id = ?)");
    binds.push(q("vt_id"));
  }
  // cho_toi_nhan=1: phieu Chuyen kho dang tren duong toi kho minh phu trach.
  if (q("cho_toi_nhan") === "1") {
    const ids = (await khoNhanHang(c.env.DB, user)).map((k) => k.id);
    if (ids.length === 0) return c.json({ rows: [] });
    conditions.push(`p.trang_thai = 'Dang chuyen' AND p.den_kho_id IN (${ids.map(() => "?").join(",")})`);
    binds.push(...ids);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT p.id, p.ma_phieu, p.loai, p.tu_kho_id, kt.ten_kho AS tu_kho_ten, p.den_kho_id, kd.ten_kho AS den_kho_ten,
            kt.cong_ty_id AS tu_cong_ty_id, kd.cong_ty_id AS den_cong_ty_id,
            p.den_nhan_vien_id, nv.ten_nv AS den_nhan_vien_ten, p.nguoi_nhan_ten_tu_do, p.nha_cung_cap,
            p.nguoi_lap, p.trang_thai, p.da_xac_nhan, p.ghi_chu, p.created_at, kt.loai AS tu_kho_loai, kd.loai AS den_kho_loai, p.da_xu_ly_tu_choi,
            (SELECT COUNT(*) FROM phieu_chuyen_kho_ct ct WHERE ct.phieu_id = p.id) AS so_dong,
            (SELECT group_concat(v.ten_vt || CASE WHEN ct.dau IS NULL THEN ' x' || printf('%g', ct.so_luong) ELSE ' ' || printf('%+g', ct.so_luong * ct.dau) END, '; ') FROM phieu_chuyen_kho_ct ct
               JOIN vt_tieu_hao v ON v.id = ct.vt_id WHERE ct.phieu_id = p.id) AS tom_tat,
            (SELECT SUM(ct.thanh_tien) FROM phieu_chuyen_kho_ct ct WHERE ct.phieu_id = p.id) AS tong_tien,
            (SELECT SUM(CASE WHEN COALESCE(ct.dau, 1) > 0 THEN ct.so_luong ELSE 0 END) FROM phieu_chuyen_kho_ct ct WHERE ct.phieu_id = p.id) AS tong_sl,
            (SELECT SUM(CASE WHEN ct.dau < 0 THEN ct.so_luong ELSE 0 END) FROM phieu_chuyen_kho_ct ct WHERE ct.phieu_id = p.id) AS sl_giam,
            (SELECT CASE WHEN COUNT(DISTINCT COALESCE(v.don_vi_tinh, '')) = 1 THEN MAX(v.don_vi_tinh) END FROM phieu_chuyen_kho_ct ct
               JOIN vt_tieu_hao v ON v.id = ct.vt_id WHERE ct.phieu_id = p.id) AS dvt_chung
     FROM phieu_chuyen_kho p
     JOIN kho kt ON kt.id = p.tu_kho_id
     LEFT JOIN kho kd ON kd.id = p.den_kho_id
     LEFT JOIN nhan_vien nv ON nv.ma_nv = p.den_nhan_vien_id
     ${where}
     ORDER BY p.created_at DESC`;
  // ?page=N: 1 trang KICH_THUOC_TRANG dong (bang tren man hinh); khong co page: toi da `limit` dong
  // (xuat Excel / cac cho can ca danh sach).
  const trang = docTrang(c);
  if (trang) return c.json(await layTrang(c.env.DB, trang, { sql: `SELECT COUNT(*) AS n FROM phieu_chuyen_kho p ${where}`, binds }, { sql, binds }));
  const limit = Math.min(Number(q("limit") ?? 300) || 300, 5000);
  const { results } = await c.env.DB.prepare(`${sql} LIMIT ${limit}`)
    .bind(...binds)
    .all();
  return c.json({ rows: results });
});

// GET /thong-ke?thang=YYYY-MM&kho_id= - KPI man phieu tieu hao (cung pham vi voi danh sach): so phieu +
// gia tri theo loai trong thang (va thang truoc de so sanh), cho KT duyet, dang chuyen (qua han 48h).
phieuChuyenKho.get("/thong-ke", async (c) => {
  const user = c.get("user");
  const db = c.env.DB;
  const thang = /^\d{4}-\d{2}$/.test(c.req.query("thang") ?? "") ? c.req.query("thang")! : nowVN().slice(0, 7);
  const [y, m] = thang.split("-").map(Number);
  const thangTruoc = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const pham = dkXemPhieu(await layPhamVi(db, user), user);
  const khoId = Number(c.req.query("kho_id")) || null;
  const dk = `${pham.sql}${khoId ? " AND (p.tu_kho_id = ? OR p.den_kho_id = ?)" : ""}`;
  const b = [...pham.binds, ...(khoId ? [khoId, khoId] : [])];
  const moc = new Date(Date.now() + 7 * 3600e3 - 48 * 3600e3).toISOString().slice(0, 19).replace("T", " ");
  const [theoLoai, cho] = await db.batch<Record<string, number | string>>([
    db
      .prepare(
        `SELECT substr(p.created_at, 1, 7) AS thang, p.loai, COUNT(DISTINCT p.id) AS so_phieu,
                COALESCE(SUM(ct.so_luong), 0) AS so_luong, COALESCE(SUM(ct.thanh_tien), 0) AS gia_tri
         FROM phieu_chuyen_kho p JOIN phieu_chuyen_kho_ct ct ON ct.phieu_id = p.id
         WHERE substr(p.created_at, 1, 7) IN (?, ?) AND p.trang_thai NOT IN ('Ke toan tu choi', 'Bi tu choi') AND ${dk}
         GROUP BY 1, 2`,
      )
      .bind(thang, thangTruoc, ...b),
    db
      .prepare(
        `SELECT
           SUM(CASE WHEN p.trang_thai = 'Cho ke toan duyet' THEN 1 ELSE 0 END) AS cho_kt,
           COALESCE(SUM(CASE WHEN p.trang_thai = 'Cho ke toan duyet' THEN (SELECT SUM(ct.thanh_tien) FROM phieu_chuyen_kho_ct ct WHERE ct.phieu_id = p.id) END), 0) AS cho_kt_gt,
           SUM(CASE WHEN p.trang_thai = 'Dang chuyen' THEN 1 ELSE 0 END) AS dang_chuyen,
           SUM(CASE WHEN p.trang_thai = 'Dang chuyen' AND p.created_at < ? THEN 1 ELSE 0 END) AS dang_chuyen_qua_han,
           SUM(CASE WHEN p.loai = 'Cap phat NV' AND p.trang_thai = 'Da giao' AND p.da_xac_nhan = 0 AND p.den_nhan_vien_id IS NOT NULL THEN 1 ELSE 0 END) AS cho_nv_xac_nhan
         FROM phieu_chuyen_kho p WHERE ${dk}`,
      )
      .bind(moc, ...b),
  ]);
  return c.json({ thang, thang_truoc: thangTruoc, theo_loai: theoLoai.results, ...(cho.results[0] ?? {}) });
});

phieuChuyenKho.get("/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    `SELECT p.*, kt.ten_kho AS tu_kho_ten, kt.loai AS tu_kho_loai, kd.ten_kho AS den_kho_ten, kd.loai AS den_kho_loai, nv.ten_nv AS den_nhan_vien_ten,
            (SELECT g.ma_phieu FROM phieu_chuyen_kho g WHERE g.id = p.gui_lai_tu) AS gui_lai_tu_ma,
            (SELECT g.id FROM phieu_chuyen_kho g WHERE g.gui_lai_tu = p.id) AS da_gui_lai_id,
            (SELECT g.ma_phieu FROM phieu_chuyen_kho g WHERE g.gui_lai_tu = p.id) AS da_gui_lai_ma,
            kt.cong_ty_id AS tu_cong_ty_id, kd.cong_ty_id AS den_cong_ty_id, ctt.ma AS tu_cong_ty_ma, ctd.ma AS den_cong_ty_ma
     FROM phieu_chuyen_kho p
     LEFT JOIN cong_ty ctt ON ctt.id = (SELECT cong_ty_id FROM kho WHERE id = p.tu_kho_id)
     LEFT JOIN cong_ty ctd ON ctd.id = (SELECT cong_ty_id FROM kho WHERE id = p.den_kho_id)
     JOIN kho kt ON kt.id = p.tu_kho_id
     LEFT JOIN kho kd ON kd.id = p.den_kho_id
     LEFT JOIN nhan_vien nv ON nv.ma_nv = p.den_nhan_vien_id
     WHERE p.id = ?`,
  )
    .bind(id)
    .first<{ tu_cong_ty_id: number; den_cong_ty_id: number | null }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  const user = c.get("user");
  if (!coCongTy(user, row.tu_cong_ty_id) && !coCongTy(user, row.den_cong_ty_id)) return c.json({ error: "FORBIDDEN" }, 403);
  const [{ results: items }, { results: log }] = await Promise.all([
    c.env.DB.prepare(
      `SELECT ct.id, ct.vt_id, v.ten_vt, v.don_vi_tinh, ct.so_luong, ct.don_gia, ct.thanh_tien, ct.vt_id_den, ct.dau
       FROM phieu_chuyen_kho_ct ct JOIN vt_tieu_hao v ON v.id = ct.vt_id WHERE ct.phieu_id = ?`,
    )
      .bind(id)
      .all(),
    c.env.DB.prepare(`SELECT trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu FROM phieu_chuyen_kho_log WHERE phieu_id = ? ORDER BY id ASC`)
      .bind(id)
      .all(),
  ]);
  return c.json({ row, items, log });
});

interface CreateItem {
  vt_id: string;
  so_luong: number;
  don_gia?: number | null;
  /** Chi import Excel: thanh tien ghi trong file (mac dinh = don gia x SL). */
  thanh_tien?: number | null;
}
interface CreateBody {
  loai?: Loai;
  tu_kho_id?: number;
  den_kho_id?: number | null;
  den_nhan_vien_id?: string | null;
  nguoi_nhan_ten_tu_do?: string | null;
  nha_cung_cap?: string | null;
  ghi_chu?: string | null;
  items?: CreateItem[];
}

type Loi = { error: string; [k: string]: unknown };

// Kiem tra nguon/dich + quyen theo loai phieu. Tra ve trang thai khoi tao + cong ty kho nguon, hoac loi.
// Da phap nhan: moi phieu trong 1 cong ty, RIENG "Chuyen kho" sang kho cong ty khac -> 'Cho ke toan duyet'
// (KT cong ty nguon duyet moi tru ton - xem /:id/ke-toan-duyet).
// `seThemNv` (import Excel): nguoi nhan khac cong ty se duoc them kiem nhiem cong ty kho nguon trong CUNG batch -> bo qua
// kiem "NV thuoc cong ty kho" (quyen them da kiem rieng bang duocThemNvVaoCongTy).
async function kiemTraTao(db: D1Database, user: AppUser, body: CreateBody, seThemNv = false): Promise<{ trangThai: string; congTyId: number } | Loi> {
  const r = await kiemTraTaoGoc(db, user, body, seThemNv);
  if ("error" in r) return r;
  const tu = (await getKho(db, Number(body.tu_kho_id)))!;
  return { trangThai: r.trangThai, congTyId: tu.cong_ty_id };
}

async function kiemTraTaoGoc(db: D1Database, user: AppUser, body: CreateBody, seThemNv = false): Promise<{ trangThai: string } | Loi> {
  const tu = await getKho(db, Number(body.tu_kho_id));
  if (!tu || !tu.bat_tat) return { error: "TU_KHO_NOT_FOUND" };
  if (!(await laThuKho(db, user, tu.id))) return { error: "KHONG_PHU_TRACH_KHO_NGUON" };

  if (body.loai === "Nhap mua") {
    if (!laHcns(user, tu.cong_ty_id)) return { error: "CHI_HCNS_NHAP_MUA" };
    if (tu.loai !== "Mua hang") return { error: "NHAP_MUA_PHAI_TU_KHO_MUA" };
    const den = await getKho(db, Number(body.den_kho_id));
    if (!den || !den.bat_tat || den.loai !== "HCNS" || den.cong_ty_id !== tu.cong_ty_id) return { error: "NHAP_MUA_PHAI_VAO_KHO_HCNS" };
    return { trangThai: "Cho ke toan duyet" };
  }

  if (tu.loai === "Mua hang") return { error: "KHO_MUA_CHI_NHAP_MUA" };
  if (tu.loai === "Tieu hao") return { error: "KHO_TIEU_HAO_KHONG_XUAT" };

  if (body.loai === "Chuyen kho") {
    const den = await getKho(db, Number(body.den_kho_id));
    if (!den || !den.bat_tat) return { error: "DEN_KHO_NOT_FOUND" };
    if (den.id === tu.id) return { error: "TRUNG_KHO" };
    if (den.loai === "Mua hang") return { error: "KHONG_CHUYEN_VE_KHO_MUA" };
    if (den.loai === "Tieu hao") return { error: "KHO_TIEU_HAO_CHI_XUAT_DUNG" };
    // Sang cong ty khac: cho KT cong ty nguon duyet (chua tru ton), bo qua rang buoc kho QL.
    if (den.cong_ty_id !== tu.cong_ty_id) return { trangThai: "Cho ke toan duyet" };
    // Kho QL chi tra nguoc ve HCNS/Mien, khong chuyen ngang sang kho QL khac.
    if (tu.loai === "Quan ly" && den.loai === "Quan ly") return { error: "QL_KHONG_CHUYEN_SANG_KHO_QL_KHAC" };
    return { trangThai: "Dang chuyen" };
  }

  // Cap phat NV - nguoi nhan: 1 nhan vien, 1 ten tu do, HOAC 1 kho tieu hao van phong (cung cong ty).
  const coNv = !!body.den_nhan_vien_id;
  const coTuDo = !!body.nguoi_nhan_ten_tu_do?.trim();
  const coKhoTh = !!body.den_kho_id;
  if (Number(coNv) + Number(coTuDo) + Number(coKhoTh) !== 1) return { error: "CHON_1_NGUOI_NHAN" };
  if (coKhoTh) {
    const den = await getKho(db, Number(body.den_kho_id));
    if (!den || !den.bat_tat || den.loai !== "Tieu hao") return { error: "DEN_KHO_NOT_FOUND" };
    if (den.cong_ty_id !== tu.cong_ty_id) return { error: "KHAC_CONG_TY" };
    return { trangThai: "Da giao" };
  }
  if (coNv) {
    const nv = await db.prepare("SELECT ma_nv FROM nhan_vien WHERE ma_nv = ? AND dang_lam_viec = 1").bind(body.den_nhan_vien_id).first();
    if (!nv) return { error: "NHAN_VIEN_NOT_FOUND" };
    // Nhan vien kiem nhiem nhieu cong ty nhan duoc tu kho cua MOI cong ty ho thuoc ve.
    if (!seThemNv && !(await nvThuocCongTy(db, body.den_nhan_vien_id!, tu.cong_ty_id))) return { error: "NHAN_VIEN_KHAC_CONG_TY" };
  }
  if (tu.loai === "Quan ly") {
    // QL chi phat cho cap duoi truc tiep cua chu kho (hoac chinh QL) - ten tu do khong kiem chung
    // duoc thuoc nhom nen khong cho.
    if (!coNv) return { error: "QL_KHONG_DUNG_TEN_TU_DO" };
    const chuKho = tu.nhan_vien_id!;
    if (body.den_nhan_vien_id !== chuKho && !(await laCapDuoi(db, chuKho, body.den_nhan_vien_id!))) {
      return { error: "NGOAI_NHOM_QUAN_LY" };
    }
  }
  return { trangThai: "Da giao" };
}

phieuChuyenKho.post("/", async (c) => {
  const body = await c.req.json<CreateBody>().catch(() => null);
  return taoPhieu(c, body);
});

/** Tao phieu (POST / va gui lai phieu bi tu choi nhan). `phu.lenhThem` chay trong CUNG batch. */
async function taoPhieu(c: Context<{ Bindings: Env }>, body: CreateBody | null, phu: { guiLaiTu?: string; lenhThem?: D1PreparedStatement[] } = {}) {
  const user = c.get("user");
  if (!body?.loai || !LOAI.includes(body.loai) || !body.tu_kho_id || !body.items?.length) return c.json({ error: "MISSING_FIELDS" }, 400);
  for (const it of body.items) {
    if (!it.vt_id || !(Number(it.so_luong) > 0)) return c.json({ error: "SO_LUONG_KHONG_HOP_LE", vt_id: it.vt_id }, 400);
  }

  const kt = await kiemTraTao(c.env.DB, user, body);
  if ("error" in kt) return c.json(kt, kt.error.startsWith("KHONG_PHU_TRACH") || kt.error.startsWith("CHI_") || kt.error === "NGOAI_NHOM_QUAN_LY" ? 403 : 400);

  const vtIds = [...new Set(body.items.map((i) => i.vt_id))];
  const { results: vts } = await c.env.DB.prepare(
    `SELECT id FROM vt_tieu_hao WHERE vo_hieu_hoa = 0 AND cong_ty_id = ? AND id IN (${vtIds.map(() => "?").join(",")})`,
  )
    .bind(kt.congTyId, ...vtIds)
    .all<{ id: string }>();
  if (vts.length !== vtIds.length) return c.json({ error: "VT_NOT_FOUND" }, 400);

  const truTon = kt.trangThai !== "Cho ke toan duyet";
  // Kiem tra truoc de tra loi ro rang (vat tu nao thieu, ton bao nhieu); chot chan trong batch lo
  // truong hop 2 phieu lap cung luc. Chuyen cong ty chua tru ton nhung van bao som neu khong du hang.
  if (body.loai !== "Nhap mua") {
    const canXuat = new Map<string, number>();
    for (const it of body.items) canXuat.set(it.vt_id, (canXuat.get(it.vt_id) ?? 0) + Number(it.so_luong));
    for (const [vtId, sl] of canXuat) {
      const ton = await tonKho(c.env.DB, body.tu_kho_id, vtId);
      if (ton < sl) return c.json({ error: "VUOT_TON", vt_id: vtId, ton, can_xuat: sl }, 400);
    }
  }

  const db = c.env.DB;
  const { id, stmts } = lenhTaoPhieu(db, user, body as CreateBody & { loai: Loai; tu_kho_id: number; items: CreateItem[] }, kt.trangThai, nowVN(), phu.guiLaiTu);
  stmts.push(...(phu.lenhThem ?? []));
  if (truTon) stmts.push(...guardTonKhongAm(db, body.tu_kho_id, vtIds));

  try {
    await db.batch(stmts);
  } catch (e) {
    if (String(e).includes("CHECK constraint failed")) return c.json({ error: phu.lenhThem?.length ? "SAI_TRANG_THAI" : "VUOT_TON" }, 409);
    throw e;
  }
  return c.json({ ok: true, id, trang_thai: kt.trangThai });
}

/** Cac lenh INSERT 1 phieu (phieu + chi tiet + log + ma phieu) - dung chung cho lap tay va import Excel. */
function lenhTaoPhieu(
  db: D1Database,
  user: AppUser,
  body: CreateBody & { loai: Loai; tu_kho_id: number; items: CreateItem[] },
  trangThai: string,
  ngay: string,
  guiLaiTu?: string,
): { id: string; stmts: D1PreparedStatement[] } {
  const id = crypto.randomUUID();
  const kt = { trangThai };
  const phu = { guiLaiTu };
  // Xuat vao kho tieu hao van phong: tieu dung het ngay, khong ai phai xac nhan.
  const xuatTieuDung = body.loai === "Cap phat NV" && !!body.den_kho_id;
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO phieu_chuyen_kho (id, loai, tu_kho_id, den_kho_id, den_nhan_vien_id, nguoi_nhan_ten_tu_do, nha_cung_cap,
                                       nguoi_lap, trang_thai, ghi_chu, created_at, updated_at, da_xac_nhan, xac_nhan_luc, gui_lai_tu)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        body.loai,
        body.tu_kho_id,
        body.loai === "Cap phat NV" && !xuatTieuDung ? null : body.den_kho_id,
        body.loai === "Cap phat NV" ? (body.den_nhan_vien_id ?? null) : null,
        body.loai === "Cap phat NV" ? body.nguoi_nhan_ten_tu_do?.trim() || null : null,
        body.loai === "Nhap mua" ? body.nha_cung_cap?.trim() || null : null,
        user.email,
        kt.trangThai,
        body.ghi_chu ?? null,
        ngay,
        ngay,
        xuatTieuDung ? 1 : 0,
        xuatTieuDung ? ngay : null,
        phu.guiLaiTu ?? null,
      ),
    ...body.items.map((it) => {
      const donGia = it.don_gia ?? null;
      return db
        .prepare(`INSERT INTO phieu_chuyen_kho_ct (phieu_id, vt_id, so_luong, don_gia, thanh_tien) VALUES (?, ?, ?, ?, ?)`)
        .bind(id, it.vt_id, Number(it.so_luong), donGia, it.thanh_tien ?? (donGia != null ? donGia * Number(it.so_luong) : null));
    }),
    db
      .prepare(`INSERT INTO phieu_chuyen_kho_log (phieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)`)
      .bind(id, kt.trangThai, user.email, ngay, body.ghi_chu ?? null),
    ...sinhMaPhieu(db, "phieu_chuyen_kho", id, TIEN_TO_CHUYEN_KHO[body.loai], ngay),
  ];
  return { id, stmts };
}

// ------------------------------------------------------------------ Import Excel (2026-10-16)
// Nhap hang loat phieu Chuyen kho / Cap phat NV / Xuat tieu dung VP tu kho HCNS, Mien, Trung chuyen, QL.
// Moi dong Excel = 1 mat hang; cac dong cung (Nhom phieu, Kho xuat, Nguoi/kho nhan) gop thanh 1 phieu. Loai phieu
// suy ra tu nguoi nhan: kho thuong -> Chuyen kho; kho tieu hao -> xuat tieu dung; ma NV / ten tu do -> Cap phat NV.
// Server tu tra ten kho / vat tu / ma NV, kiem quyen (kiemTraTao - y nhu lap tay) + ton CONG DON moi phieu cung kho.
// thuc_hien = false: chi xem truoc. true: CHI tao khi KHONG co loi nao - tat ca phieu trong 1 db.batch (dung 1 phieu
// loi -> khong phieu nao duoc tao), kem chot chan ton khong am tung kho nguon.
interface DongImport {
  dong: number;
  nhom?: string | number | null;
  kho_xuat?: string | number | null;
  kho_nhan?: string | number | null;
  ma_nv?: string | number | null;
  nguoi_nhan?: string | null;
  vt?: string | number | null;
  ten_vt?: string | null;
  so_luong?: string | number | null;
  don_gia?: string | number | null;
  thanh_tien?: string | number | null;
  ghi_chu?: string | null;
}
type LoiImport = { dong: number; ma: string; gia_tri?: string };
const MAX_DONG_IMPORT = 1000;

const chuan = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/gi, "d")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
const so = (v: unknown) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/\s/g, "").replace(",", ".")));

phieuChuyenKho.post("/import", async (c) => {
  const user = c.get("user");
  const db = c.env.DB;
  const body = await c.req.json<{ dong?: DongImport[]; thuc_hien?: boolean }>().catch(() => null);
  const dongs = (body?.dong ?? []).filter((d) => d && (d.kho_xuat || d.vt || d.ten_vt || d.so_luong));
  if (!dongs.length) return c.json({ error: "MISSING_FIELDS" }, 400);
  if (dongs.length > MAX_DONG_IMPORT) return c.json({ error: "IMPORT_QUA_NHIEU", max: MAX_DONG_IMPORT }, 400);

  // Danh muc tra cuu: kho moi cong ty tai khoan duoc phep (kho dich co the khac cong ty), vat tu + NV cac cong ty do.
  const congTy = JSON.stringify(user.cong_ty_ids);
  const [{ results: khos }, { results: vts }, { results: nvs }, { results: cts }] = await db.batch([
    db.prepare(`SELECT id, ten_kho, loai, nhan_vien_id, bat_tat, cong_ty_id FROM kho WHERE bat_tat = 1`),
    db.prepare(
      `SELECT id, ten_vt, don_vi_tinh, cong_ty_id, don_gia_tham_khao FROM vt_tieu_hao WHERE vo_hieu_hoa = 0 AND cong_ty_id IN (SELECT value FROM json_each(?))`,
    ).bind(congTy),
    // Moi nhan vien dang lam viec (ca cong ty khac - 2026-10-28: ma NV cong ty khac -> tu them kiem nhiem cong ty kho).
    db.prepare(
      `SELECT n.ma_nv, n.ten_nv, n.quan_ly_id, (SELECT group_concat(v.cong_ty_id) FROM v_nv_cong_ty v WHERE v.ma_nv = n.ma_nv) AS cts
       FROM nhan_vien n WHERE n.dang_lam_viec = 1`,
    ),
    db.prepare("SELECT id, ma FROM cong_ty"),
  ]) as unknown as [
    { results: { id: number; ten_kho: string; loai: string; cong_ty_id: number }[] },
    { results: { id: string; ten_vt: string; don_vi_tinh: string | null; cong_ty_id: number; don_gia_tham_khao: number | null }[] },
    { results: { ma_nv: string; ten_nv: string; quan_ly_id: string | null; cts: string | null }[] },
    { results: { id: number; ma: string }[] },
  ];
  const maCt = new Map(cts.map((x) => [x.id, x.ma]));
  // Quyen them NV vao nhan su cong ty (theo cong ty kho nguon) - tinh 1 lan / cong ty.
  const dsKhoPt = await khoPhuTrach(db, user);
  const quyenThem = new Map<number, boolean>();
  const duocThem = async (ct: number) => {
    if (!quyenThem.has(ct)) quyenThem.set(ct, await duocThemNvVaoCongTy(db, user, ct, dsKhoPt));
    return quyenThem.get(ct)!;
  };
  const tenKho = new Map(khos.map((k) => [k.id, k.ten_kho]));

  // Kho: theo ma (id) hoac ten (bo dau). Trung ten -> uu tien cong ty `uuTien` (cong ty kho nguon / dang xem), con
  // trung nua thi bao loi de nguoi dung ghi ma kho.
  function timKho(v: unknown, uuTien: number[]): { id: number } | { loi: string } {
    const s = chuan(v);
    if (!s) return { loi: "IMPORT_THIEU_KHO" };
    let ds = /^\d+$/.test(s) ? khos.filter((k) => k.id === Number(s)) : [];
    if (!ds.length) ds = khos.filter((k) => chuan(k.ten_kho) === s);
    if (ds.length > 1) {
      const uu = ds.filter((k) => uuTien.includes(k.cong_ty_id));
      if (uu.length) ds = uu;
    }
    if (!ds.length) return { loi: "IMPORT_KHO_KHONG_THAY" };
    if (ds.length > 1) return { loi: "IMPORT_KHO_TRUNG_TEN" };
    return { id: ds[0].id };
  }

  const loi: LoiImport[] = [];
  type Nhom = {
    khoa: string;
    dong: number[];
    body: CreateBody & { loai: Loai; tu_kho_id: number; items: CreateItem[] };
    congTyId: number;
    den: string;
    /** Nguoi nhan khac cong ty kho -> them kiem nhiem cong ty kho khi tao. */
    themNv: { ma_nv: string; ten_nv: string; quan_ly_id: string | null } | null;
  };
  const nhoms = new Map<string, Nhom>();
  // Nguon don gia tung dong phieu (file / thanh tien / danh muc) - hien o xem truoc.
  const nguonGiaVt = new Map<string, "file" | "thanh_tien" | "danh_muc" | null>();

  for (const d of dongs) {
    const loiTruoc = loi.length;
    const gv = (x: unknown) => String(x ?? "").trim();
    const tu = timKho(d.kho_xuat, user.cong_ty_xem);
    if ("loi" in tu) loi.push({ dong: d.dong, ma: tu.loi, gia_tri: gv(d.kho_xuat) });
    const khoTu = "id" in tu ? khos.find((k) => k.id === tu.id)! : null;
    const ctNguon = khoTu?.cong_ty_id ?? 0;

    // Nguoi / kho nhan: dung 1 trong 3 (kho nhan, ma NV, ten tu do).
    const coKho = !!gv(d.kho_nhan);
    const coNv = !!gv(d.ma_nv);
    const coTuDo = !!gv(d.nguoi_nhan);
    let loai: Loai = "Cap phat NV";
    let denKho: number | null = null;
    let denNv: string | null = null;
    let themNv: Nhom["themNv"] = null;
    let tuDo: string | null = null;
    let den = "";
    if (Number(coKho) + Number(coNv) + Number(coTuDo) !== 1) {
      loi.push({ dong: d.dong, ma: coKho || coNv || coTuDo ? "IMPORT_NHIEU_NGUOI_NHAN" : "IMPORT_THIEU_NGUOI_NHAN" });
    } else if (coKho) {
      const k = timKho(d.kho_nhan, ctNguon ? [ctNguon] : user.cong_ty_xem);
      if ("loi" in k) loi.push({ dong: d.dong, ma: k.loi, gia_tri: gv(d.kho_nhan) });
      else {
        denKho = k.id;
        loai = khos.find((x) => x.id === k.id)!.loai === "Tieu hao" ? "Cap phat NV" : "Chuyen kho";
        den = tenKho.get(k.id) ?? "";
      }
    } else if (coNv) {
      const ma = gv(d.ma_nv).toUpperCase();
      const nv = nvs.find((n) => n.ma_nv.toUpperCase() === ma);
      if (!nv) loi.push({ dong: d.dong, ma: "NHAN_VIEN_NOT_FOUND", gia_tri: gv(d.ma_nv) });
      else if (ctNguon && !(nv.cts ?? "").split(",").map(Number).includes(ctNguon) && !(await duocThem(ctNguon))) {
        loi.push({ dong: d.dong, ma: "NHAN_VIEN_KHAC_CONG_TY", gia_tri: gv(d.ma_nv) });
      } else {
        denNv = nv.ma_nv;
        den = `${nv.ten_nv} (${nv.ma_nv})`;
        if (ctNguon && !(nv.cts ?? "").split(",").map(Number).includes(ctNguon)) themNv = { ma_nv: nv.ma_nv, ten_nv: nv.ten_nv, quan_ly_id: nv.quan_ly_id };
      }
    } else {
      tuDo = gv(d.nguoi_nhan);
      den = tuDo;
    }

    // Vat tu: ma (id) hoac ten, trong danh muc cong ty kho nguon.
    const vtMa = chuan(d.vt);
    const vtTen = chuan(d.ten_vt);
    const dsVt = vts.filter((v) => v.cong_ty_id === ctNguon);
    let vt = vtMa ? dsVt.find((v) => chuan(v.id) === vtMa) : undefined;
    if (!vt && !vtMa && vtTen) {
      const theoTen = dsVt.filter((v) => chuan(v.ten_vt) === vtTen);
      if (theoTen.length > 1) loi.push({ dong: d.dong, ma: "IMPORT_VT_TRUNG_TEN", gia_tri: gv(d.ten_vt) });
      vt = theoTen.length === 1 ? theoTen[0] : undefined;
    }
    if (!vt && khoTu && !loi.some((l) => l.dong === d.dong && l.ma === "IMPORT_VT_TRUNG_TEN")) {
      loi.push({ dong: d.dong, ma: vtMa || vtTen ? "IMPORT_VT_KHONG_THAY" : "IMPORT_THIEU_VT", gia_tri: gv(d.vt) || gv(d.ten_vt) });
    }
    const sl = so(d.so_luong);
    if (!(sl > 0)) loi.push({ dong: d.dong, ma: "SO_LUONG_KHONG_HOP_LE", gia_tri: gv(d.so_luong) });
    // Gia (2026-11-03): Don gia trong file > Thanh tien / SL > gia tham khao danh muc. Thanh tien bo trong = don gia x SL;
    // ghi ca 2 ma lech nhau (> 1 dong) -> loi de nguoi dung bo trong 1 cot.
    let dg = gv(d.don_gia) ? so(d.don_gia) : null;
    const tt = gv(d.thanh_tien) ? so(d.thanh_tien) : null;
    if (dg != null && !(dg >= 0)) loi.push({ dong: d.dong, ma: "IMPORT_DON_GIA_SAI", gia_tri: gv(d.don_gia) });
    if (tt != null && !(tt >= 0)) loi.push({ dong: d.dong, ma: "IMPORT_THANH_TIEN_SAI", gia_tri: gv(d.thanh_tien) });
    let nguonGia: "file" | "thanh_tien" | "danh_muc" | null = dg != null ? "file" : null;
    if (dg != null && tt != null && sl > 0 && Math.abs(dg * sl - tt) > 1) {
      loi.push({ dong: d.dong, ma: "IMPORT_THANH_TIEN_LECH", gia_tri: `${gv(d.so_luong)} × ${gv(d.don_gia)} ≠ ${gv(d.thanh_tien)}` });
    }
    if (dg == null && tt != null && sl > 0) {
      dg = tt / sl;
      nguonGia = "thanh_tien";
    }
    if (dg == null && vt?.don_gia_tham_khao != null) {
      dg = vt.don_gia_tham_khao;
      nguonGia = "danh_muc";
    }
    const thanhTien = tt ?? (dg != null && sl > 0 ? dg * sl : null);
    if (loi.length > loiTruoc || !khoTu || !vt) continue;

    const khoa = [gv(d.nhom), khoTu.id, denKho ?? "", denNv ?? "", chuan(tuDo)].join("|");
    let n = nhoms.get(khoa);
    if (!n) {
      n = {
        khoa,
        dong: [],
        congTyId: ctNguon,
        den,
        themNv,
        body: {
          loai,
          tu_kho_id: khoTu.id,
          den_kho_id: denKho,
          den_nhan_vien_id: denNv,
          nguoi_nhan_ten_tu_do: tuDo,
          ghi_chu: gv(d.ghi_chu) || null,
          items: [],
        },
      };
      nhoms.set(khoa, n);
    } else if (!n.body.ghi_chu && gv(d.ghi_chu)) n.body.ghi_chu = gv(d.ghi_chu);
    n.dong.push(d.dong);
    // Cung vat tu nhieu dong trong 1 phieu -> cong don thanh 1 dong.
    // Cung vat tu + cung don gia nhieu dong trong 1 phieu -> cong don 1 dong; khac gia -> dong rieng.
    const cu = n.body.items.find((i) => i.vt_id === vt!.id && i.don_gia === dg);
    if (cu) {
      cu.so_luong += sl;
      cu.thanh_tien = cu.thanh_tien != null && thanhTien != null ? cu.thanh_tien + thanhTien : null;
    } else n.body.items.push({ vt_id: vt.id, so_luong: sl, don_gia: dg, thanh_tien: thanhTien });
    nguonGiaVt.set(`${khoa}|${vt.id}|${dg}`, nguonGia);
  }

  // Quyen + quy tac nguon/dich tung phieu (y nhu lap tay), roi ton cong don theo kho nguon.
  const ketQua: {
    dong: number[];
    loai: Loai;
    xuat_tieu_dung: boolean;
    tu_kho: string;
    den: string;
    trang_thai: string | null;
    them_kiem_nhiem: { ma_nv: string; ten_nv: string; cong_ty: string } | null;
    items: { vt_id: string; ten_vt: string; don_vi_tinh: string | null; so_luong: number; don_gia: number | null; thanh_tien: number | null; nguon_gia: "file" | "thanh_tien" | "danh_muc" | null; ton: number }[];
  }[] = [];
  const trangThai = new Map<string, string>();
  const canXuat = new Map<string, number>();
  for (const n of nhoms.values()) {
    const kt = await kiemTraTao(db, user, n.body, !!n.themNv);
    if ("error" in kt) for (const dg of n.dong) loi.push({ dong: dg, ma: kt.error });
    else trangThai.set(n.khoa, kt.trangThai);
    for (const it of n.body.items) {
      const k = `${n.body.tu_kho_id}|${it.vt_id}`;
      canXuat.set(k, (canXuat.get(k) ?? 0) + it.so_luong);
    }
  }
  const khoNguon = [...new Set([...nhoms.values()].map((n) => n.body.tu_kho_id))];
  const ton = new Map<string, number>();
  if (khoNguon.length) {
    const { results } = await db
      .prepare(`SELECT kho_id, vt_id, ton FROM v_ton_kho WHERE kho_id IN (SELECT value FROM json_each(?))`)
      .bind(JSON.stringify(khoNguon))
      .all<{ kho_id: number; vt_id: string; ton: number }>();
    for (const r of results) ton.set(`${r.kho_id}|${r.vt_id}`, r.ton);
  }
  const vtMap = new Map(vts.map((v) => [v.id, v]));
  for (const n of nhoms.values()) {
    for (const it of n.body.items) {
      const k = `${n.body.tu_kho_id}|${it.vt_id}`;
      const tonCo = ton.get(k) ?? 0;
      if ((canXuat.get(k) ?? 0) > tonCo) {
        loi.push({ dong: n.dong[0], ma: "IMPORT_VUOT_TON", gia_tri: `${vtMap.get(it.vt_id)?.ten_vt ?? it.vt_id}: ${tonCo} < ${canXuat.get(k)}` });
        canXuat.set(k, -Infinity); // bao 1 lan / mat hang / kho
      }
    }
    ketQua.push({
      dong: n.dong,
      loai: n.body.loai,
      xuat_tieu_dung: n.body.loai === "Cap phat NV" && !!n.body.den_kho_id,
      tu_kho: tenKho.get(n.body.tu_kho_id) ?? String(n.body.tu_kho_id),
      den: n.den,
      trang_thai: trangThai.get(n.khoa) ?? null,
      them_kiem_nhiem: n.themNv ? { ma_nv: n.themNv.ma_nv, ten_nv: n.themNv.ten_nv, cong_ty: maCt.get(n.congTyId) ?? String(n.congTyId) } : null,
      items: n.body.items.map((it) => ({
        vt_id: it.vt_id,
        ten_vt: vtMap.get(it.vt_id)?.ten_vt ?? it.vt_id,
        don_vi_tinh: vtMap.get(it.vt_id)?.don_vi_tinh ?? null,
        so_luong: it.so_luong,
        don_gia: it.don_gia ?? null,
        thanh_tien: it.thanh_tien ?? null,
        nguon_gia: nguonGiaVt.get(`${n.khoa}|${it.vt_id}|${it.don_gia ?? null}`) ?? null,
        ton: ton.get(`${n.body.tu_kho_id}|${it.vt_id}`) ?? 0,
      })),
    });
  }
  loi.sort((a, b) => a.dong - b.dong);

  if (!body?.thuc_hien || loi.length || !nhoms.size) {
    return c.json({ phieu: ketQua, loi, so_dong: dongs.length, hop_le: !loi.length && nhoms.size > 0 });
  }

  const ngay = nowVN();
  const ids: string[] = [];
  const stmts: D1PreparedStatement[] = [];
  // Nguoi nhan khac cong ty -> them kiem nhiem cong ty kho nguon (ghi nguoi them) + kho QL neu can, TRUOC cac phieu,
  // cung batch: phieu loi thi khong ai bi them.
  const daThem = new Set<string>();
  for (const n of nhoms.values()) {
    if (!n.themNv || daThem.has(`${n.themNv.ma_nv}|${n.congTyId}`)) continue;
    daThem.add(`${n.themNv.ma_nv}|${n.congTyId}`);
    stmts.push(
      db
        .prepare("INSERT OR IGNORE INTO nhan_vien_cong_ty (ma_nv, cong_ty_id, created_at, nguoi_them) VALUES (?, ?, ?, ?)")
        .bind(n.themNv.ma_nv, n.congTyId, ngay, user.email),
      lenhTaoKhoQl(db, n.themNv.ma_nv, ngay),
    );
    if (n.themNv.quan_ly_id) stmts.push(lenhTaoKhoQl(db, n.themNv.quan_ly_id, ngay));
  }
  for (const n of nhoms.values()) {
    const g = lenhTaoPhieu(db, user, { ...n.body, ghi_chu: n.body.ghi_chu ?? "Import Excel" }, trangThai.get(n.khoa)!, ngay);
    ids.push(g.id);
    stmts.push(...g.stmts);
  }
  // Chot chan ton tung kho nguon (phieu chuyen cong ty chua tru ton - guard van dung vi khong lam ton am).
  for (const k of khoNguon) {
    const vtIds = [...new Set([...nhoms.values()].filter((n) => n.body.tu_kho_id === k).flatMap((n) => n.body.items.map((i) => i.vt_id)))];
    stmts.push(...guardTonKhongAm(db, k, vtIds));
  }
  try {
    await db.batch(stmts);
  } catch (e) {
    if (String(e).includes("CHECK constraint failed")) return c.json({ error: "VUOT_TON" }, 409);
    throw e;
  }
  const { results: tao } = await db
    .prepare(`SELECT id, ma_phieu FROM phieu_chuyen_kho WHERE id IN (SELECT value FROM json_each(?)) ORDER BY ma_phieu`)
    .bind(JSON.stringify(ids))
    .all<{ id: string; ma_phieu: string }>();
  return c.json({ ok: true, so_phieu: ids.length, phieu: tao, so_nv_them: daThem.size });
});

// ------------------------------------------------------------------ Sua / huy phieu cho KT duyet
interface PhieuSua {
  id: string;
  loai: Loai | "Dieu chinh";
  tu_kho_id: number;
  den_kho_id: number | null;
  trang_thai: string;
  nguoi_lap: string;
  ma_phieu: string | null;
}
const CO_THE_SUA = ["Cho ke toan duyet", "Ke toan tu choi"];

/** Phieu chua KT duyet (cho duyet / bi KT tu choi) + nguoi lap hoac HCNS cong ty kho nguon. */
async function phieuSuaDuoc(c: Context<{ Bindings: Env }>): Promise<{ p: PhieuSua; congTyId: number } | { error: string; status: 403 | 404 | 409 }> {
  const p = await c.env.DB.prepare("SELECT id, loai, tu_kho_id, den_kho_id, trang_thai, nguoi_lap, ma_phieu FROM phieu_chuyen_kho WHERE id = ?")
    .bind(c.req.param("id"))
    .first<PhieuSua>();
  if (!p) return { error: "NOT_FOUND", status: 404 };
  const congTyId = (await getKho(c.env.DB, p.tu_kho_id))?.cong_ty_id ?? 0;
  const user = c.get("user");
  if (p.nguoi_lap !== user.email && !laHcns(user, congTyId)) return { error: "FORBIDDEN", status: 403 };
  if (!CO_THE_SUA.includes(p.trang_thai)) return { error: "DA_DUYET_KHONG_SUA", status: 409 };
  return { p, congTyId };
}

// PUT /:id - sua phieu Nhap mua / chuyen cong ty chua KT duyet: ghi chu, nha cung cap, dong hang (so luong, don
// gia). Phieu bi KT tu choi -> sua xong tu gui duyet lai ('Cho ke toan duyet'). Nhat ky ghi tom tat thay doi.
phieuChuyenKho.put("/:id", async (c) => {
  const q = await phieuSuaDuoc(c);
  if ("error" in q) return c.json({ error: q.error }, q.status);
  const { p, congTyId } = q;
  if (p.loai !== "Nhap mua" && p.loai !== "Chuyen kho") return c.json({ error: "SAI_TRANG_THAI" }, 409);
  const body = await c.req.json<{ ghi_chu?: string | null; nha_cung_cap?: string | null; items?: CreateItem[] }>().catch(() => null);
  if (!body?.items?.length) return c.json({ error: "MISSING_FIELDS" }, 400);
  for (const it of body.items) {
    if (!it.vt_id || !(Number(it.so_luong) > 0)) return c.json({ error: "SO_LUONG_KHONG_HOP_LE", vt_id: it.vt_id }, 400);
    if (it.don_gia != null && !(Number(it.don_gia) >= 0)) return c.json({ error: "SO_LUONG_KHONG_HOP_LE", vt_id: it.vt_id }, 400);
  }
  const db = c.env.DB;
  const vtIds = [...new Set(body.items.map((i) => i.vt_id))];
  const { results: vts } = await db
    .prepare(`SELECT id FROM vt_tieu_hao WHERE vo_hieu_hoa = 0 AND cong_ty_id = ? AND id IN (${vtIds.map(() => "?").join(",")})`)
    .bind(congTyId, ...vtIds)
    .all<{ id: string }>();
  if (vts.length !== vtIds.length) return c.json({ error: "VT_NOT_FOUND" }, 400);
  if (p.loai === "Chuyen kho") {
    const canXuat = new Map<string, number>();
    for (const it of body.items) canXuat.set(it.vt_id, (canXuat.get(it.vt_id) ?? 0) + Number(it.so_luong));
    for (const [vtId, sl] of canXuat) {
      const ton = await tonKho(db, p.tu_kho_id, vtId);
      if (ton < sl) return c.json({ error: "VUOT_TON", vt_id: vtId, ton, can_xuat: sl }, 400);
    }
  }
  const { results: cu } = await db
    .prepare("SELECT ct.vt_id, v.ten_vt, ct.so_luong, ct.don_gia FROM phieu_chuyen_kho_ct ct JOIN vt_tieu_hao v ON v.id = ct.vt_id WHERE ct.phieu_id = ?")
    .bind(p.id)
    .all<{ vt_id: string; ten_vt: string; so_luong: number; don_gia: number | null }>();
  const { results: tenMoi } = await db
    .prepare(`SELECT id, ten_vt FROM vt_tieu_hao WHERE id IN (${vtIds.map(() => "?").join(",")})`)
    .bind(...vtIds)
    .all<{ id: string; ten_vt: string }>();
  const ten = new Map([...cu.map((r) => [r.vt_id, r.ten_vt] as const), ...tenMoi.map((r) => [r.id, r.ten_vt] as const)]);
  const thayDoi = moTaThayDoi(cu, body.items, ten);
  const ngay = nowVN();
  const user = c.get("user");
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE phieu_chuyen_kho SET ghi_chu = ?, nha_cung_cap = CASE WHEN loai = 'Nhap mua' THEN ? ELSE nha_cung_cap END,
                trang_thai = 'Cho ke toan duyet', updated_at = ?
         WHERE id = ? AND trang_thai IN ('Cho ke toan duyet', 'Ke toan tu choi')`,
      )
      .bind(body.ghi_chu?.trim() || null, body.nha_cung_cap?.trim() || null, ngay, p.id),
    // KT vua duyet giua luc sua -> UPDATE khong doi dong nao -> chot chan loi -> rollback ca batch.
    db.prepare("INSERT INTO batch_guard (x) SELECT changes()"),
    db.prepare("DELETE FROM batch_guard"),
    db.prepare("DELETE FROM phieu_chuyen_kho_ct WHERE phieu_id = ?").bind(p.id),
    ...body.items.map((it) => {
      const donGia = it.don_gia ?? null;
      return db
        .prepare(`INSERT INTO phieu_chuyen_kho_ct (phieu_id, vt_id, so_luong, don_gia, thanh_tien) VALUES (?, ?, ?, ?, ?)`)
        .bind(p.id, it.vt_id, Number(it.so_luong), donGia, donGia != null ? donGia * Number(it.so_luong) : null);
    }),
    db
      .prepare(`INSERT INTO phieu_chuyen_kho_log (phieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Cho ke toan duyet', ?, ?, ?)`)
      .bind(p.id, user.email, ngay, `${p.trang_thai === "Ke toan tu choi" ? "Sửa phiếu, gửi duyệt lại" : "Sửa phiếu"}${thayDoi ? `: ${thayDoi}` : ""}`),
  ];
  try {
    await db.batch(stmts);
  } catch (e) {
    if (String(e).includes("CHECK constraint failed")) return c.json({ error: "DA_DUYET_KHONG_SUA" }, 409);
    throw e;
  }
  return c.json({ ok: true });
});

function moTaThayDoi(
  cu: { vt_id: string; so_luong: number; don_gia: number | null }[],
  moi: CreateItem[],
  ten: Map<string, string>,
): string {
  const so = (n: number | null | undefined) => (n == null ? "-" : String(Number(n)));
  const out: string[] = [];
  const mCu = new Map(cu.map((r) => [r.vt_id, r]));
  const mMoi = new Map(moi.map((r) => [r.vt_id, r]));
  for (const r of moi) {
    const o = mCu.get(r.vt_id);
    const tn = ten.get(r.vt_id) ?? r.vt_id;
    if (!o) out.push(`+ ${tn} x${so(r.so_luong)}`);
    else {
      if (Number(o.so_luong) !== Number(r.so_luong)) out.push(`${tn}: SL ${so(o.so_luong)} → ${so(r.so_luong)}`);
      if ((o.don_gia ?? null) !== (r.don_gia ?? null)) out.push(`${tn}: đơn giá ${so(o.don_gia)} → ${so(r.don_gia)}`);
    }
  }
  for (const o of cu) if (!mMoi.has(o.vt_id)) out.push(`- ${ten.get(o.vt_id) ?? o.vt_id}`);
  return out.join("; ");
}

// POST /:id/huy - huy phieu chua KT duyet (khong anh huong ton: phieu cho duyet chua tru / cong ton).
phieuChuyenKho.post("/:id/huy", async (c) => {
  const q = await phieuSuaDuoc(c);
  if ("error" in q) return c.json({ error: q.error }, q.status);
  return doiTrangThai(c, { ...q.p, den_nhan_vien_id: null }, q.p.trang_thai, "Da huy", await docGhiChu(c));
});

// ------------------------------------------------------------------ Phieu bi tu choi nhan
/** Nguoi lap hoac thu kho nguon cua phieu chuyen kho bi tu choi nhan, chua xu ly. */
async function phieuTuChoi(c: Context<{ Bindings: Env }>) {
  const p = await c.env.DB.prepare(
    "SELECT id, loai, tu_kho_id, den_kho_id, den_nhan_vien_id, trang_thai, nguoi_lap, ma_phieu, ghi_chu, da_xu_ly_tu_choi FROM phieu_chuyen_kho WHERE id = ?",
  )
    .bind(c.req.param("id"))
    .first<PhieuRow & { nguoi_lap: string; ma_phieu: string | null; ghi_chu: string | null; da_xu_ly_tu_choi: number }>();
  if (!p) return { error: "NOT_FOUND", status: 404 as const };
  const user = c.get("user");
  if (p.nguoi_lap !== user.email && !(await laThuKho(c.env.DB, user, p.tu_kho_id))) return { error: "FORBIDDEN", status: 403 as const };
  if (!["Bi tu choi", "Ke toan tu choi"].includes(p.trang_thai) || p.da_xu_ly_tu_choi) return { error: "SAI_TRANG_THAI", status: 409 as const };
  return { p };
}

// POST /:id/gui-lai - phieu bi tu choi nhan (thuong do bam nham): tao phieu moi y het (kiem tra ton lai, ma moi,
// gui_lai_tu = phieu cu) va danh dau phieu cu da xu ly - cung 1 batch.
phieuChuyenKho.post("/:id/gui-lai", async (c) => {
  const q = await phieuTuChoi(c);
  if ("error" in q) return c.json({ error: q.error }, q.status);
  const { p } = q;
  if (p.loai !== "Chuyen kho" || p.trang_thai !== "Bi tu choi") return c.json({ error: "SAI_TRANG_THAI" }, 409);
  const db = c.env.DB;
  const ghiChu = await docGhiChu(c);
  const { results: items } = await db
    .prepare("SELECT vt_id, so_luong, don_gia FROM phieu_chuyen_kho_ct WHERE phieu_id = ?")
    .bind(p.id)
    .all<CreateItem>();
  const ngay = nowVN();
  return taoPhieu(
    c,
    {
      loai: "Chuyen kho",
      tu_kho_id: p.tu_kho_id,
      den_kho_id: p.den_kho_id,
      ghi_chu: [`Gửi lại từ ${p.ma_phieu ?? p.id}`, ghiChu].filter(Boolean).join(". "),
      items,
    },
    {
      guiLaiTu: p.id,
      lenhThem: [
        db.prepare("UPDATE phieu_chuyen_kho SET da_xu_ly_tu_choi = 1, updated_at = ? WHERE id = ? AND da_xu_ly_tu_choi = 0").bind(ngay, p.id),
        db.prepare("INSERT INTO batch_guard (x) SELECT changes()"),
        db.prepare("DELETE FROM batch_guard"),
        db
          .prepare(`INSERT INTO phieu_chuyen_kho_log (phieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Bi tu choi', ?, ?, 'Đã gửi lại bằng phiếu mới')`)
          .bind(p.id, c.get("user").email, ngay),
      ],
    },
  );
});

// POST /:id/da-xu-ly - phieu bi tu choi (nhan / KT) da xu ly xong theo cach khac -> het nhac o Viec can lam.
phieuChuyenKho.post("/:id/da-xu-ly", async (c) => {
  const q = await phieuTuChoi(c);
  if ("error" in q) return c.json({ error: q.error }, q.status);
  const ngay = nowVN();
  const ghiChu = await docGhiChu(c);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE phieu_chuyen_kho SET da_xu_ly_tu_choi = 1, updated_at = ? WHERE id = ?").bind(ngay, q.p.id),
    c.env.DB.prepare(`INSERT INTO phieu_chuyen_kho_log (phieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)`).bind(
      q.p.id,
      q.p.trang_thai,
      c.get("user").email,
      ngay,
      ghiChu ? `Đánh dấu đã xử lý: ${ghiChu}` : "Đánh dấu đã xử lý",
    ),
  ]);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ Dieu chinh ton tieu hao
// POST /dieu-chinh {kho_id, ly_do, items: [{vt_id, ton_thuc_te}]} - thu kho / HCNS nhap ton THUC TE, server tinh chenh
// lech voi ton so sach LUC LAP (bo dong khong lech) -> phieu 'Dieu chinh' cho KT duyet; duyet moi cong/tru ton.
phieuChuyenKho.post("/dieu-chinh", async (c) => {
  const user = c.get("user");
  const db = c.env.DB;
  const body = await c.req.json<{ kho_id?: number; ly_do?: string; items?: { vt_id: string; ton_thuc_te: number }[] }>().catch(() => null);
  if (!body?.kho_id || !body.items?.length) return c.json({ error: "MISSING_FIELDS" }, 400);
  if (!body.ly_do?.trim()) return c.json({ error: "CAN_LY_DO" }, 400);
  const kho = await getKho(db, Number(body.kho_id));
  if (!kho || !kho.bat_tat || !laKhoTon(kho.loai)) return c.json({ error: "TU_KHO_NOT_FOUND" }, 400);
  if (!laHcns(user, kho.cong_ty_id) && !(await laThuKho(db, user, kho.id))) return c.json({ error: "KHONG_PHU_TRACH_KHO_NGUON" }, 403);
  for (const it of body.items) if (!it.vt_id || !(Number(it.ton_thuc_te) >= 0)) return c.json({ error: "SO_LUONG_KHONG_HOP_LE", vt_id: it.vt_id }, 400);
  const vtIds = [...new Set(body.items.map((i) => i.vt_id))];
  if (vtIds.length !== body.items.length) return c.json({ error: "TRUNG_VAT_TU" }, 400);
  const { results: vts } = await db
    .prepare(`SELECT id, ten_vt, don_gia_tham_khao FROM vt_tieu_hao WHERE cong_ty_id = ? AND id IN (${vtIds.map(() => "?").join(",")})`)
    .bind(kho.cong_ty_id, ...vtIds)
    .all<{ id: string; ten_vt: string; don_gia_tham_khao: number | null }>();
  if (vts.length !== vtIds.length) return c.json({ error: "VT_NOT_FOUND" }, 400);
  const vtMap = new Map(vts.map((v) => [v.id, v]));
  const dong: { vt_id: string; so_luong: number; dau: number; ton: number; thuc_te: number }[] = [];
  for (const it of body.items) {
    const ton = await tonKho(db, kho.id, it.vt_id);
    const lech = Math.round((Number(it.ton_thuc_te) - ton) * 1000) / 1000;
    if (lech !== 0) dong.push({ vt_id: it.vt_id, so_luong: Math.abs(lech), dau: lech > 0 ? 1 : -1, ton, thuc_te: Number(it.ton_thuc_te) });
  }
  if (!dong.length) return c.json({ error: "KHONG_CO_CHENH_LECH" }, 400);
  const id = crypto.randomUUID();
  const ngay = nowVN();
  const chiTiet = dong.map((d) => `${vtMap.get(d.vt_id)?.ten_vt ?? d.vt_id}: sổ sách ${d.ton} → thực tế ${d.thuc_te}`).join("; ");
  await db.batch([
    db
      .prepare(
        `INSERT INTO phieu_chuyen_kho (id, loai, tu_kho_id, nguoi_lap, trang_thai, ghi_chu, created_at, updated_at)
         VALUES (?, 'Dieu chinh', ?, ?, 'Cho ke toan duyet', ?, ?, ?)`,
      )
      .bind(id, kho.id, user.email, body.ly_do.trim(), ngay, ngay),
    ...dong.map((d) => {
      const gia = vtMap.get(d.vt_id)?.don_gia_tham_khao ?? null;
      return db
        .prepare(`INSERT INTO phieu_chuyen_kho_ct (phieu_id, vt_id, so_luong, don_gia, thanh_tien, dau) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(id, d.vt_id, d.so_luong, gia, gia != null ? gia * d.so_luong * d.dau : null, d.dau);
    }),
    db
      .prepare(`INSERT INTO phieu_chuyen_kho_log (phieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Cho ke toan duyet', ?, ?, ?)`)
      .bind(id, user.email, ngay, `${body.ly_do.trim()}. ${chiTiet}`),
    ...sinhMaPhieu(db, "phieu_chuyen_kho", id, TIEN_TO_CHUYEN_KHO["Dieu chinh"], ngay),
  ]);
  return c.json({ ok: true, id, so_dong: dong.length });
});

interface PhieuRow {
  id: string;
  loai: Loai | "Dieu chinh";
  tu_kho_id: number;
  den_kho_id: number | null;
  den_nhan_vien_id: string | null;
  trang_thai: string;
}

async function doiTrangThai(c: Context<{ Bindings: Env }>, phieu: PhieuRow, from: string, to: string, ghiChu: string | null) {
  const user = c.get("user");
  const ngay = nowVN();
  const [upd] = await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE phieu_chuyen_kho SET trang_thai = ?, updated_at = ? WHERE id = ? AND trang_thai = ?`).bind(to, ngay, phieu.id, from),
    c.env.DB.prepare(
      `INSERT INTO phieu_chuyen_kho_log (phieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu)
       SELECT ?, ?, ?, ?, ? WHERE changes() = 1`,
    ).bind(phieu.id, to, user.email, ngay, ghiChu),
  ]);
  if ((upd.meta.changes ?? 0) === 0) return c.json({ error: "SAI_TRANG_THAI" }, 409);
  return c.json({ ok: true });
}

async function layPhieu(c: Context<{ Bindings: Env }>) {
  return c.env.DB.prepare("SELECT id, loai, tu_kho_id, den_kho_id, den_nhan_vien_id, trang_thai FROM phieu_chuyen_kho WHERE id = ?")
    .bind(c.req.param("id"))
    .first<PhieuRow>();
}

async function docGhiChu(c: Context<{ Bindings: Env }>): Promise<string | null> {
  const b = await c.req.json<{ ghi_chu?: string }>().catch(() => ({}) as { ghi_chu?: string });
  return b.ghi_chu?.trim() || null;
}

// Ke toan duyet / tu choi: phieu Nhap mua, va phieu Chuyen kho sang cong ty khac (KT cong ty NGUON).
async function congTyKhoNguon(db: D1Database, p: PhieuRow): Promise<number | null> {
  return (await getKho(db, p.tu_kho_id))?.cong_ty_id ?? null;
}

phieuChuyenKho.post("/:id/ke-toan-duyet", async (c) => {
  const user = c.get("user");
  const db = c.env.DB;
  const p = await layPhieu(c);
  if (!p) return c.json({ error: "NOT_FOUND" }, 404);
  if (!laKeToan(user, await congTyKhoNguon(db, p))) return c.json({ error: "CHI_KE_TOAN" }, 403);
  if (await laNguoiLap(db, "phieu_chuyen_kho", p.id, user.email)) return c.json({ error: "KHONG_TU_DUYET" }, 403);
  if (p.trang_thai !== "Cho ke toan duyet" || !["Nhap mua", "Chuyen kho", "Dieu chinh"].includes(p.loai)) return c.json({ error: "SAI_TRANG_THAI" }, 409);
  const ghiChu = await docGhiChu(c);
  if (p.loai === "Nhap mua") return doiTrangThai(c, p, "Cho ke toan duyet", "Da nhan", ghiChu);
  if (p.loai === "Dieu chinh") {
    // Dong giam ton: chot chan khong am (ton co the da doi tu luc lap phieu).
    const { results: giam } = await db
      .prepare("SELECT DISTINCT vt_id FROM phieu_chuyen_kho_ct WHERE phieu_id = ? AND dau = -1")
      .bind(p.id)
      .all<{ vt_id: string }>();
    const ngay = nowVN();
    try {
      await db.batch([
        db.prepare(`UPDATE phieu_chuyen_kho SET trang_thai = 'Da dieu chinh', updated_at = ? WHERE id = ? AND trang_thai = 'Cho ke toan duyet'`).bind(ngay, p.id),
        db.prepare("INSERT INTO batch_guard (x) SELECT changes()"),
        db.prepare("DELETE FROM batch_guard"),
        db
          .prepare(`INSERT INTO phieu_chuyen_kho_log (phieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Da dieu chinh', ?, ?, ?)`)
          .bind(p.id, user.email, ngay, ghiChu),
        ...(giam.length ? guardTonKhongAm(db, p.tu_kho_id, giam.map((r) => r.vt_id)) : []),
      ]);
    } catch (e) {
      if (String(e).includes("CHECK constraint failed")) return c.json({ error: "VUOT_TON" }, 409);
      throw e;
    }
    return c.json({ ok: true });
  }

  // Chuyen cong ty: ghep ma vat tu ben nhan + tru ton nguon (-> 'Dang chuyen', kho dich xac nhan nhu thuong).
  const den = await getKho(db, p.den_kho_id!);
  if (!den) return c.json({ error: "DEN_KHO_NOT_FOUND" }, 400);
  const { results: cts } = await db.prepare("SELECT id, vt_id, so_luong FROM phieu_chuyen_kho_ct WHERE phieu_id = ?").bind(p.id).all<{ id: number; vt_id: string; so_luong: number }>();
  const vtIds = [...new Set(cts.map((r) => r.vt_id))];
  const canXuat = new Map<string, number>();
  for (const r of cts) canXuat.set(r.vt_id, (canXuat.get(r.vt_id) ?? 0) + r.so_luong);
  for (const [vtId, sl] of canXuat) {
    const ton = await tonKho(db, p.tu_kho_id, vtId);
    if (ton < sl) return c.json({ error: "VUOT_TON", vt_id: vtId, ton, can_xuat: sl }, 400);
  }
  const { map, lenh } = await ghepVatTu(db, vtIds, den.cong_ty_id, user.email);
  const ngay = nowVN();
  const stmts: D1PreparedStatement[] = [
    ...lenh,
    ...cts.map((r) => db.prepare("UPDATE phieu_chuyen_kho_ct SET vt_id_den = ? WHERE id = ?").bind(map.get(r.vt_id) ?? r.vt_id, r.id)),
    db.prepare(`UPDATE phieu_chuyen_kho SET trang_thai = 'Dang chuyen', updated_at = ? WHERE id = ? AND trang_thai = 'Cho ke toan duyet'`).bind(ngay, p.id),
    // 2 KT bam cung luc: UPDATE tren khong doi dong nao -> chot chan loi -> rollback ca batch.
    db.prepare("INSERT INTO batch_guard (x) SELECT changes()"),
    db.prepare("DELETE FROM batch_guard"),
    db
      .prepare(`INSERT INTO phieu_chuyen_kho_log (phieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Dang chuyen', ?, ?, ?)`)
      .bind(p.id, user.email, ngay, ghiChu ? `KT duyệt chuyển công ty. ${ghiChu}` : "KT duyệt chuyển công ty"),
    ...guardTonKhongAm(db, p.tu_kho_id, vtIds),
  ];
  try {
    await db.batch(stmts);
  } catch (e) {
    if (String(e).includes("CHECK constraint failed")) return c.json({ error: "VUOT_TON" }, 409);
    throw e;
  }
  return c.json({ ok: true });
});

phieuChuyenKho.post("/:id/ke-toan-tu-choi", async (c) => {
  const ghiChu = await docGhiChu(c);
  if (!ghiChu) return c.json({ error: "CAN_LY_DO" }, 400);
  const p = await layPhieu(c);
  if (!p) return c.json({ error: "NOT_FOUND" }, 404);
  if (!laKeToan(c.get("user"), await congTyKhoNguon(c.env.DB, p))) return c.json({ error: "CHI_KE_TOAN" }, 403);
  if (p.trang_thai !== "Cho ke toan duyet" || !["Nhap mua", "Chuyen kho", "Dieu chinh"].includes(p.loai)) return c.json({ error: "SAI_TRANG_THAI" }, 409);
  return doiTrangThai(c, p, "Cho ke toan duyet", "Ke toan tu choi", ghiChu);
});

// CHI ben nhan that su (thu kho / nguoi phu trach kho dich - laBenNhan) xac nhan da nhan du hang. Da bo "xac nhan
// ho" cua thu kho kho nguon (2026-10-12): ben xuat khong duoc tu xac nhan thay ben nhan. Kho dich chua co nguoi
// nhan -> HCNS gan thu kho cho kho do.
phieuChuyenKho.post("/:id/nhan", async (c) => {
  const user = c.get("user");
  const ghiChu = await docGhiChu(c);
  const p = await layPhieu(c);
  if (!p) return c.json({ error: "NOT_FOUND" }, 404);
  if (p.loai !== "Chuyen kho" || p.trang_thai !== "Dang chuyen") return c.json({ error: "SAI_TRANG_THAI" }, 409);
  if (!(await laBenNhan(c.env.DB, user, p.den_kho_id!))) return c.json({ error: "KHONG_PHU_TRACH_KHO_DICH" }, 403);
  return doiTrangThai(c, p, "Dang chuyen", "Da nhan", ghiChu);
});

phieuChuyenKho.post("/:id/tu-choi-nhan", async (c) => {
  const user = c.get("user");
  const ghiChu = await docGhiChu(c);
  if (!ghiChu) return c.json({ error: "CAN_LY_DO" }, 400);
  const p = await layPhieu(c);
  if (!p) return c.json({ error: "NOT_FOUND" }, 404);
  if (p.loai !== "Chuyen kho" || p.trang_thai !== "Dang chuyen") return c.json({ error: "SAI_TRANG_THAI" }, 409);
  if (!(await laBenNhan(c.env.DB, user, p.den_kho_id!))) return c.json({ error: "KHONG_PHU_TRACH_KHO_DICH" }, 403);
  return doiTrangThai(c, p, "Dang chuyen", "Bi tu choi", ghiChu);
});

// NV nhan hang tieu hao bam xac nhan (chi dung chu phieu - chong IDOR).
phieuChuyenKho.post("/:id/xac-nhan", async (c) => {
  const user = c.get("user");
  const p = await layPhieu(c);
  if (!p) return c.json({ error: "NOT_FOUND" }, 404);
  if (p.loai !== "Cap phat NV" || !user.ma_nv || p.den_nhan_vien_id !== user.ma_nv) return c.json({ error: "FORBIDDEN" }, 403);
  const ngay = nowVN();
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE phieu_chuyen_kho SET da_xac_nhan = 1, xac_nhan_luc = ?, updated_at = ? WHERE id = ?`).bind(ngay, ngay, p.id),
    c.env.DB.prepare(
      `INSERT INTO phieu_chuyen_kho_log (phieu_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, 'Da giao', ?, ?, 'Nhân viên xác nhận đã nhận')`,
    ).bind(p.id, user.email, ngay),
  ]);
  return c.json({ ok: true });
});

export default phieuChuyenKho;
