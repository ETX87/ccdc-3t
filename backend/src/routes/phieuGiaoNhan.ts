import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { nowVN } from "../lib/vnTime";
import { laKhoTon, laKhoPhatChung, coCongTy, getKho, khoPhuTrach, laBenNhan, laHcns, laNguoiLap, laKeToan, laThuKho, trongNhom } from "../lib/quyen";
import { nvThuocCongTy } from "../lib/nvCongTy";
import { sinhMaPhieu } from "../lib/maPhieu";
import { layPhamVi } from "../lib/phamVi";
import { NV_THEO_EMAIL, TEN_KHO, TEN_NV } from "../lib/nhanCongTy";

const phieuGiaoNhan = new Hono<{ Bindings: Env }>();
phieuGiaoNhan.use("*", verifySessionMiddleware, loadUser);

phieuGiaoNhan.get("/", async (c) => {
  const nhanVienId = c.req.query("nhan_vien_id");
  const loaiPhieu = c.req.query("loai_phieu");
  const khoId = c.req.query("kho_id");

  const user = c.get("user");
  const pv = await layPhamVi(c.env.DB, user);
  const conditions: string[] = [];
  const binds: unknown[] = [];
  // Pham vi: quan tri xem het; con lai - phieu kho minh phu trach, phieu nhom minh (ban than + cap duoi), phieu minh lap.
  if (!pv.toanBo) {
    const kho = JSON.stringify(pv.khoIds);
    const nhom = JSON.stringify(pv.nhomMaNv);
    conditions.push(
      `(p.nguoi_lap = ? OR p.tu_kho_id IN (SELECT value FROM json_each(?)) OR p.den_kho_id IN (SELECT value FROM json_each(?))
        OR p.nhan_vien_id IN (SELECT value FROM json_each(?)) OR p.nhan_vien_nhan_moi_id IN (SELECT value FROM json_each(?)))`,
    );
    binds.push(user.email, kho, kho, nhom, nhom);
  }
  // Cong ty dang xem: TS cua cong ty do, hoac phieu chuyen TOI kho cong ty do (chuyen cong ty).
  if (!user.tat_ca_cong_ty) {
    const ct = JSON.stringify(user.cong_ty_xem);
    conditions.push(
      `(EXISTS (SELECT 1 FROM phieu_giao_nhan_ct q JOIN ccdc x ON x.id = q.ccdc_id WHERE q.phieu_id = p.id AND x.cong_ty_id IN (SELECT value FROM json_each(?)))
        OR p.den_kho_id IN (SELECT id FROM kho WHERE cong_ty_id IN (SELECT value FROM json_each(?))))`,
    );
    binds.push(ct, ct);
  }
  const daXacNhan = c.req.query("da_xac_nhan");
  if (daXacNhan === "0" || daXacNhan === "1") {
    // Phieu chuyen cong ty bi KT tu choi: da ket thuc, khong con "cho xac nhan".
    conditions.push(daXacNhan === "0" ? "p.da_xac_nhan = 0 AND p.trang_thai_duyet IS NOT 'Ke toan tu choi'" : "p.da_xac_nhan = 1");
  }
  const thang = c.req.query("thang");
  if (thang && /^\d{4}-\d{2}$/.test(thang)) {
    conditions.push("substr(p.ngay_lap, 1, 7) = ?");
    binds.push(thang);
  }
  if (nhanVienId) {
    conditions.push("(p.nhan_vien_id = ? OR p.nhan_vien_nhan_moi_id = ?)");
    binds.push(nhanVienId, nhanVienId);
  }
  if (loaiPhieu) {
    conditions.push("p.loai_phieu = ?");
    binds.push(loaiPhieu);
  }
  if (khoId) {
    conditions.push("(p.tu_kho_id = ? OR p.den_kho_id = ?)");
    binds.push(Number(khoId), Number(khoId));
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.ma_phieu, p.loai_phieu, p.nhan_vien_id, ${TEN_NV("nv")} AS nhan_vien_ten,
            p.nhan_vien_nhan_moi_id, ${TEN_NV("nv2")} AS nhan_vien_nhan_moi_ten,
            p.tu_kho_id, ${TEN_KHO("kt")} AS tu_kho_ten, p.den_kho_id, ${TEN_KHO("kd")} AS den_kho_ten,
            p.nguoi_lap, p.ngay_lap, p.ghi_chu, p.da_xac_nhan, p.created_at, p.trang_thai_duyet,
            kt.cong_ty_id AS tu_cong_ty_id, kd.cong_ty_id AS den_cong_ty_id,
            (SELECT COUNT(*) FROM phieu_giao_nhan_ct ct WHERE ct.phieu_id = p.id) AS so_luong_ccdc,
            (SELECT group_concat(x.ten_ccdc, '; ') FROM phieu_giao_nhan_ct ct JOIN ccdc x ON x.id = ct.ccdc_id WHERE ct.phieu_id = p.id) AS tom_tat
     FROM phieu_giao_nhan p
     LEFT JOIN nhan_vien nv ON nv.ma_nv = p.nhan_vien_id
     LEFT JOIN nhan_vien nv2 ON nv2.ma_nv = p.nhan_vien_nhan_moi_id
     LEFT JOIN kho kt ON kt.id = p.tu_kho_id
     LEFT JOIN kho kd ON kd.id = p.den_kho_id
     ${where}
     ORDER BY p.created_at DESC
     LIMIT 500`,
  )
    .bind(...binds)
    .all();
  return c.json({ rows: results });
});

phieuGiaoNhan.get("/:id", async (c) => {
  const id = c.req.param("id");
  const phieu = await c.env.DB.prepare(
    `SELECT p.*, ${TEN_NV("nv")} AS nhan_vien_ten, ${TEN_NV("nv2")} AS nhan_vien_nhan_moi_ten,
            ${TEN_KHO("kt")} AS tu_kho_ten, ${TEN_KHO("kd")} AS den_kho_ten, kt.cong_ty_id AS tu_cong_ty_id, kd.cong_ty_id AS den_cong_ty_id,
            (SELECT x.cong_ty_id FROM phieu_giao_nhan_ct q JOIN ccdc x ON x.id = q.ccdc_id WHERE q.phieu_id = p.id LIMIT 1) AS ts_cong_ty_id,
            ${NV_THEO_EMAIL("p.nguoi_lap", "nguoi_lap")}, ${NV_THEO_EMAIL("p.nguoi_xac_nhan", "nguoi_xac_nhan")}
     FROM phieu_giao_nhan p
     LEFT JOIN nhan_vien nv ON nv.ma_nv = p.nhan_vien_id
     LEFT JOIN nhan_vien nv2 ON nv2.ma_nv = p.nhan_vien_nhan_moi_id
     LEFT JOIN kho kt ON kt.id = p.tu_kho_id
     LEFT JOIN kho kd ON kd.id = p.den_kho_id
     WHERE p.id = ?`,
  )
    .bind(id)
    .first<{ tu_cong_ty_id: number | null; den_cong_ty_id: number | null; ts_cong_ty_id: number | null }>();
  if (!phieu) return c.json({ error: "NOT_FOUND" }, 404);
  const user = c.get("user");
  if (![phieu.tu_cong_ty_id, phieu.den_cong_ty_id, phieu.ts_cong_ty_id].some((ct) => coCongTy(user, ct))) return c.json({ error: "FORBIDDEN" }, 403);

  const { results: items } = await c.env.DB.prepare(
    `SELECT ct.id, ct.ccdc_id, c.ten_ccdc, ct.tinh_trang_ghi_nhan, ct.ghi_chu, c.nguyen_gia, c.trang_thai_hien_tai, c.so_seri,
            c.nguoi_dang_giu, ${TEN_NV("h")} AS nguoi_dang_giu_ten
     FROM phieu_giao_nhan_ct ct JOIN ccdc c ON c.id = ct.ccdc_id LEFT JOIN nhan_vien h ON h.ma_nv = c.nguoi_dang_giu
     WHERE ct.phieu_id = ?`,
  )
    .bind(id)
    .all();

  return c.json({ row: phieu, items });
});

interface CreateItem {
  ccdc_id: string;
  tinh_trang_ghi_nhan?: string;
  ghi_chu?: string;
}
type LoaiPhieu = "Cap phat" | "Thu hoi" | "Dieu chuyen" | "Chuyen kho";
interface CreateBody {
  loai_phieu?: LoaiPhieu;
  nhan_vien_id?: string | null;
  nhan_vien_nhan_moi_id?: string | null;
  tu_kho_id?: number | null;
  den_kho_id?: number | null;
  ghi_chu?: string;
  items?: CreateItem[];
}

async function nvTonTai(db: D1Database, maNv: string | null | undefined) {
  if (!maNv) return false;
  return !!(await db.prepare("SELECT 1 AS ok FROM nhan_vien WHERE ma_nv = ? AND dang_lam_viec = 1").bind(maNv).first());
}

/** Nhan vien thuoc cong ty (ke ca kiem nhiem - lib/nvCongTy.ts). */
const nvThuoc = (db: D1Database, maNv: string | null | undefined, congTyId: number | null) =>
  !maNv || congTyId == null ? Promise.resolve(false) : nvThuocCongTy(db, maNv, congTyId);

// Giao nhan TAI SAN CO DINH (hieu luc ngay, ben nhan xac nhan sau - co che giu nguyen tu Phase 1).
// Quyen (ke hoach Giai doan 1.5 muc 1), kiem tra o server - khong tin client:
//   Cap phat    (kho -> NV) : thu kho nguon; kho QL chi cap cho nhom cua chu kho.
//   Thu hoi     (NV -> kho) : thu kho dich; kho QL chi thu tu nhom cua chu kho.
//   Dieu chuyen (NV -> NV)  : HCNS/Admin/thu kho HCNS-Mien bat ky ai; QL chi khi CA 2 nguoi trong nhom minh.
//   Chuyen kho  (kho -> kho): thu kho nguon. Sang kho CONG TY KHAC: trang_thai_duyet 'Cho ke toan duyet',
//                             TS chua di chuyen - KT cong ty nguon duyet (/:id/ke-toan-duyet) moi doi kho + cong ty.
// Da phap nhan: moi loai khac chi trong 1 cong ty (kho, nhan vien, tai san cung cong ty).
phieuGiaoNhan.post("/", async (c) => {
  const user = c.get("user");
  const db = c.env.DB;
  const body = await c.req.json<CreateBody>().catch(() => null);
  if (!body?.loai_phieu || !body.items?.length) return c.json({ error: "MISSING_FIELDS" }, 400);
  const loai = body.loai_phieu;

  let tuKhoId: number | null = null;
  let denKhoId: number | null = null;
  let nvId: string | null = null;
  let nvMoiId: string | null = null;
  let congTyId: number | null = null; // cong ty cua TS trong phieu (tat ca phai trung)
  let lienCongTy = false;

  if (loai === "Cap phat" || loai === "Chuyen kho") {
    const tu = await getKho(db, Number(body.tu_kho_id));
    if (!tu || !tu.bat_tat || !laKhoTon(tu.loai)) return c.json({ error: "TU_KHO_NOT_FOUND" }, 400);
    if (!(await laThuKho(db, user, tu.id))) return c.json({ error: "KHONG_PHU_TRACH_KHO_NGUON" }, 403);
    tuKhoId = tu.id;
    congTyId = tu.cong_ty_id;
    if (loai === "Cap phat") {
      if (!(await nvTonTai(db, body.nhan_vien_id))) return c.json({ error: "NHAN_VIEN_NOT_FOUND" }, 400);
      if (!(await nvThuoc(db, body.nhan_vien_id, tu.cong_ty_id))) return c.json({ error: "NHAN_VIEN_KHAC_CONG_TY" }, 400);
      if (tu.loai === "Quan ly" && !(await trongNhom(db, tu.nhan_vien_id!, body.nhan_vien_id!))) {
        return c.json({ error: "NGOAI_NHOM_QUAN_LY" }, 403);
      }
      nvId = body.nhan_vien_id!;
    } else {
      const den = await getKho(db, Number(body.den_kho_id));
      if (!den || !den.bat_tat || !laKhoTon(den.loai)) return c.json({ error: "DEN_KHO_NOT_FOUND" }, 400);
      if (den.id === tu.id) return c.json({ error: "TRUNG_KHO" }, 400);
      denKhoId = den.id;
      lienCongTy = den.cong_ty_id !== tu.cong_ty_id;
    }
  } else if (loai === "Thu hoi") {
    const den = await getKho(db, Number(body.den_kho_id));
    if (!den || !den.bat_tat || !laKhoTon(den.loai)) return c.json({ error: "DEN_KHO_NOT_FOUND" }, 400);
    if (!(await laThuKho(db, user, den.id))) return c.json({ error: "KHONG_PHU_TRACH_KHO_DICH" }, 403);
    if (!body.nhan_vien_id) return c.json({ error: "MISSING_FIELDS" }, 400);
    congTyId = den.cong_ty_id;
    if (den.loai === "Quan ly" && !(await trongNhom(db, den.nhan_vien_id!, body.nhan_vien_id))) {
      return c.json({ error: "NGOAI_NHOM_QUAN_LY" }, 403);
    }
    denKhoId = den.id;
    nvId = body.nhan_vien_id;
  } else if (loai === "Dieu chuyen") {
    if (!body.nhan_vien_id || !(await nvTonTai(db, body.nhan_vien_nhan_moi_id))) return c.json({ error: "MISSING_NHAN_VIEN_NHAN_MOI" }, 400);
    if (body.nhan_vien_id === body.nhan_vien_nhan_moi_id) return c.json({ error: "TRUNG_NGUOI" }, 400);
    // Cong ty = cong ty cua tai san (nhan vien kiem nhiem giu TS nhieu cong ty); 2 nguoi deu phai thuoc cong ty do.
    congTyId =
      (await db.prepare("SELECT cong_ty_id FROM ccdc WHERE id = ?").bind(body.items[0].ccdc_id).first<{ cong_ty_id: number }>())?.cong_ty_id ?? null;
    if (congTyId == null) return c.json({ error: "CCDC_NOT_FOUND" }, 400);
    if (!(await nvThuoc(db, body.nhan_vien_id, congTyId)) || !(await nvThuoc(db, body.nhan_vien_nhan_moi_id, congTyId))) {
      return c.json({ error: "NHAN_VIEN_KHAC_CONG_TY" }, 400);
    }
    const ctDc = congTyId;
    const toanQuyen = laHcns(user, ctDc) || (await khoPhuTrach(db, user)).some((k) => laKhoPhatChung(k.loai) && k.cong_ty_id === ctDc);
    if (!toanQuyen) {
      const ok =
        !!user.ma_nv &&
        (await trongNhom(db, user.ma_nv, body.nhan_vien_id)) &&
        (await trongNhom(db, user.ma_nv, body.nhan_vien_nhan_moi_id!));
      if (!ok) return c.json({ error: "NGOAI_NHOM_QUAN_LY" }, 403);
    }
    nvId = body.nhan_vien_id;
    nvMoiId = body.nhan_vien_nhan_moi_id!;
  } else {
    return c.json({ error: "MISSING_FIELDS" }, 400);
  }

  const ccdcIds = [...new Set(body.items.map((i) => i.ccdc_id))];
  const { results: ccdcRows } = await db
    .prepare(
      `SELECT id, trang_thai_hien_tai, nguoi_dang_giu, kho_id, cong_ty_id,
              EXISTS (SELECT 1 FROM phieu_giao_nhan_ct q JOIN phieu_giao_nhan g ON g.id = q.phieu_id
                      WHERE q.ccdc_id = ccdc.id AND g.trang_thai_duyet = 'Cho ke toan duyet') AS dang_cho_duyet
       FROM ccdc WHERE vo_hieu_hoa = 0 AND id IN (SELECT value FROM json_each(?))`,
    )
    .bind(JSON.stringify(ccdcIds))
    .all<{ id: string; trang_thai_hien_tai: string; nguoi_dang_giu: string | null; kho_id: number | null; cong_ty_id: number; dang_cho_duyet: number }>();
  if (ccdcRows.length !== ccdcIds.length) return c.json({ error: "CCDC_NOT_FOUND" }, 400);
  for (const row of ccdcRows) {
    if (row.cong_ty_id !== congTyId) return c.json({ error: "TS_KHAC_CONG_TY", ccdc_id: row.id }, 400);
    // TS dang nam trong phieu chuyen cong ty cho KT duyet -> khong lap phieu khac cho no.
    if (row.dang_cho_duyet) return c.json({ error: "DANG_CHO_CHUYEN_CONG_TY", ccdc_id: row.id }, 400);
  }

  // Validate TRUOC khi ghi - khong de 1 phan thanh cong 1 phan loi giua chung.
  for (const row of ccdcRows) {
    if (loai === "Cap phat" || loai === "Chuyen kho") {
      if (row.trang_thai_hien_tai !== "Trong kho" || row.kho_id !== tuKhoId) return c.json({ error: "CCDC_KHONG_O_KHO_NGUON", ccdc_id: row.id }, 400);
    } else if (row.trang_thai_hien_tai !== "Dang cap phat" || row.nguoi_dang_giu !== nvId) {
      return c.json({ error: "CCDC_KHONG_DUNG_NGUOI_GIU", ccdc_id: row.id }, 400);
    }
  }

  const phieuId = crypto.randomUUID();
  const ngay = nowVN();
  const statements = [
    db
      .prepare(
        `INSERT INTO phieu_giao_nhan (id, loai_phieu, nhan_vien_id, nhan_vien_nhan_moi_id, tu_kho_id, den_kho_id, nguoi_lap, ngay_lap, ghi_chu, trang_thai_duyet, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(phieuId, loai, nvId, nvMoiId, tuKhoId, denKhoId, user.email, ngay, body.ghi_chu ?? null, lienCongTy ? "Cho ke toan duyet" : null, nowVN()),
    ...sinhMaPhieu(db, "phieu_giao_nhan", phieuId, "GN", ngay),
  ];

  for (const ccdcId of ccdcIds) {
    const item = body.items.find((i) => i.ccdc_id === ccdcId)!;
    statements.push(
      db
        .prepare(`INSERT INTO phieu_giao_nhan_ct (phieu_id, ccdc_id, tinh_trang_ghi_nhan, ghi_chu) VALUES (?, ?, ?, ?)`)
        .bind(phieuId, ccdcId, item.tinh_trang_ghi_nhan ?? null, item.ghi_chu ?? null),
    );
    if (loai === "Cap phat") {
      statements.push(
        db
          .prepare(`UPDATE ccdc SET trang_thai_hien_tai = 'Dang cap phat', nguoi_dang_giu = ?, kho_id = NULL, updated_at = ? WHERE id = ?`)
          .bind(nvId, ngay, ccdcId),
      );
    } else if (loai === "Thu hoi") {
      statements.push(
        db
          .prepare(`UPDATE ccdc SET trang_thai_hien_tai = 'Trong kho', nguoi_dang_giu = NULL, kho_id = ?, updated_at = ? WHERE id = ?`)
          .bind(denKhoId, ngay, ccdcId),
      );
    } else if (loai === "Dieu chuyen") {
      statements.push(db.prepare(`UPDATE ccdc SET nguoi_dang_giu = ?, updated_at = ? WHERE id = ?`).bind(nvMoiId, ngay, ccdcId));
    } else if (!lienCongTy) {
      statements.push(db.prepare(`UPDATE ccdc SET kho_id = ?, updated_at = ? WHERE id = ?`).bind(denKhoId, ngay, ccdcId));
    }
    // lienCongTy: TS dung yen o kho nguon den khi KT cong ty nguon duyet.
  }

  await db.batch(statements);
  return c.json({ ok: true, id: phieuId, trang_thai_duyet: lienCongTy ? "Cho ke toan duyet" : null });
});

// ---- Chuyen TSCD sang cong ty khac: KT cong ty NGUON duyet / tu choi ----
async function phieuChoDuyet(db: D1Database, id: string) {
  return db
    .prepare(
      `SELECT g.id, g.tu_kho_id, g.den_kho_id, g.trang_thai_duyet, kt.cong_ty_id AS tu_cong_ty_id, kd.cong_ty_id AS den_cong_ty_id
       FROM phieu_giao_nhan g JOIN kho kt ON kt.id = g.tu_kho_id JOIN kho kd ON kd.id = g.den_kho_id WHERE g.id = ?`,
    )
    .bind(id)
    .first<{ id: string; tu_kho_id: number; den_kho_id: number; trang_thai_duyet: string | null; tu_cong_ty_id: number; den_cong_ty_id: number }>();
}

async function docGhiChu(c: { req: { json: <T>() => Promise<T> } }): Promise<string | null> {
  const b = await c.req.json<{ ghi_chu?: string }>().catch(() => ({}) as { ghi_chu?: string });
  return b.ghi_chu?.trim() || null;
}

// Duyet: TS (con o kho nguon, 'Trong kho') -> kho dich + cong ty dich + nhom cung ten ben dich (chua co thi tao);
// ben nhan xac nhan nhu phieu chuyen kho thuong (da_xac_nhan).
phieuGiaoNhan.post("/:id/ke-toan-duyet", async (c) => {
  const user = c.get("user");
  const db = c.env.DB;
  const p = await phieuChoDuyet(db, c.req.param("id") ?? "");
  if (!p) return c.json({ error: "NOT_FOUND" }, 404);
  if (!laKeToan(user, p.tu_cong_ty_id)) return c.json({ error: "CHI_KE_TOAN" }, 403);
  if (await laNguoiLap(db, "phieu_giao_nhan", p.id, user.email)) return c.json({ error: "KHONG_TU_DUYET" }, 403);
  if (p.trang_thai_duyet !== "Cho ke toan duyet") return c.json({ error: "SAI_TRANG_THAI" }, 409);
  const ghiChu = await docGhiChu(c);
  const { results: ts } = await db
    .prepare(
      `SELECT x.id, x.trang_thai_hien_tai, x.kho_id, n.ten_nhom FROM phieu_giao_nhan_ct q JOIN ccdc x ON x.id = q.ccdc_id
       LEFT JOIN nhom_ccdc n ON n.id = x.nhom_id WHERE q.phieu_id = ?`,
    )
    .bind(p.id)
    .all<{ id: string; trang_thai_hien_tai: string; kho_id: number | null; ten_nhom: string | null }>();
  for (const t of ts) {
    if (t.trang_thai_hien_tai !== "Trong kho" || t.kho_id !== p.tu_kho_id) return c.json({ error: "CCDC_KHONG_O_KHO_NGUON", ccdc_id: t.id }, 409);
  }
  const ngay = nowVN();
  const { results: nhomDich } = await db.prepare("SELECT ten_nhom FROM nhom_ccdc WHERE cong_ty_id = ? AND bat_tat = 1").bind(p.den_cong_ty_id).all<{ ten_nhom: string }>();
  const coNhom = new Set(nhomDich.map((n) => n.ten_nhom));
  const stmts: D1PreparedStatement[] = [];
  for (const ten of new Set(ts.map((t) => t.ten_nhom).filter((x): x is string => !!x))) {
    if (!coNhom.has(ten)) stmts.push(db.prepare("INSERT INTO nhom_ccdc (ten_nhom, cong_ty_id) VALUES (?, ?)").bind(ten, p.den_cong_ty_id));
  }
  stmts.push(
    db
      .prepare(`UPDATE phieu_giao_nhan SET trang_thai_duyet = 'Da duyet', ghi_chu = TRIM(COALESCE(ghi_chu, '') || char(10) || ?) WHERE id = ? AND trang_thai_duyet = 'Cho ke toan duyet'`)
      .bind(`[${ngay}] KT duyệt chuyển công ty (${user.email})${ghiChu ? `: ${ghiChu}` : ""}`, p.id),
    db.prepare("INSERT INTO batch_guard (x) SELECT changes()"),
    db.prepare("DELETE FROM batch_guard"),
  );
  for (const t of ts) {
    stmts.push(
      db
        .prepare(
          `UPDATE ccdc SET kho_id = ?, cong_ty_id = ?, updated_at = ?,
                  nhom_id = ${t.ten_nhom ? "(SELECT id FROM nhom_ccdc WHERE cong_ty_id = ? AND ten_nhom = ? AND bat_tat = 1 ORDER BY id LIMIT 1)" : "NULL"}
           WHERE id = ? AND kho_id = ? AND trang_thai_hien_tai = 'Trong kho'`,
        )
        .bind(p.den_kho_id, p.den_cong_ty_id, ngay, ...(t.ten_nhom ? [p.den_cong_ty_id, t.ten_nhom] : []), t.id, p.tu_kho_id),
      db.prepare("INSERT INTO batch_guard (x) SELECT changes()"),
      db.prepare("DELETE FROM batch_guard"),
    );
  }
  try {
    await db.batch(stmts);
  } catch (e) {
    if (String(e).includes("CHECK constraint failed")) return c.json({ error: "SAI_TRANG_THAI" }, 409);
    throw e;
  }
  return c.json({ ok: true });
});

phieuGiaoNhan.post("/:id/ke-toan-tu-choi", async (c) => {
  const user = c.get("user");
  const db = c.env.DB;
  const p = await phieuChoDuyet(db, c.req.param("id") ?? "");
  if (!p) return c.json({ error: "NOT_FOUND" }, 404);
  if (!laKeToan(user, p.tu_cong_ty_id)) return c.json({ error: "CHI_KE_TOAN" }, 403);
  const ghiChu = await docGhiChu(c);
  if (!ghiChu) return c.json({ error: "CAN_LY_DO" }, 400);
  const r = await db
    .prepare(
      `UPDATE phieu_giao_nhan SET trang_thai_duyet = 'Ke toan tu choi', ghi_chu = TRIM(COALESCE(ghi_chu, '') || char(10) || ?)
       WHERE id = ? AND trang_thai_duyet = 'Cho ke toan duyet'`,
    )
    .bind(`[${nowVN()}] KT từ chối (${user.email}): ${ghiChu}`, p.id)
    .run();
  if ((r.meta.changes ?? 0) === 0) return c.json({ error: "SAI_TRANG_THAI" }, 409);
  return c.json({ ok: true });
});

// POST /:id/xac-nhan - CHI ben nhan dung phieu moi duoc xac nhan (chong IDOR): NV nhan (Cap phat /
// Dieu chuyen, qua email_dang_nhap) hoac thu kho cua kho nhan (Thu hoi / Chuyen kho).
phieuGiaoNhan.post("/:id/xac-nhan", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const phieu = await c.env.DB.prepare("SELECT nhan_vien_id, nhan_vien_nhan_moi_id, den_kho_id, loai_phieu, trang_thai_duyet FROM phieu_giao_nhan WHERE id = ?")
    .bind(id)
    .first<{ nhan_vien_id: string | null; nhan_vien_nhan_moi_id: string | null; den_kho_id: number | null; loai_phieu: string; trang_thai_duyet: string | null }>();
  if (!phieu) return c.json({ error: "NOT_FOUND" }, 404);
  // Chuyen cong ty: chi xac nhan nhan sau khi KT duyet.
  if (phieu.trang_thai_duyet && phieu.trang_thai_duyet !== "Da duyet") return c.json({ error: "CHUA_KE_TOAN_DUYET" }, 409);

  let ok = false;
  if (phieu.loai_phieu === "Cap phat" || phieu.loai_phieu === "Dieu chuyen") {
    const target = phieu.loai_phieu === "Dieu chuyen" ? phieu.nhan_vien_nhan_moi_id : phieu.nhan_vien_id;
    ok = !!user.ma_nv && user.ma_nv === target;
  } else if (phieu.den_kho_id) {
    ok = await laBenNhan(c.env.DB, user, phieu.den_kho_id);
  }
  if (!ok) return c.json({ error: "FORBIDDEN" }, 403);

  await c.env.DB.prepare("UPDATE phieu_giao_nhan SET da_xac_nhan = 1, xac_nhan_luc = ?, nguoi_xac_nhan = ? WHERE id = ?")
    .bind(nowVN(), user.email, id)
    .run();
  return c.json({ ok: true });
});

export default phieuGiaoNhan;
