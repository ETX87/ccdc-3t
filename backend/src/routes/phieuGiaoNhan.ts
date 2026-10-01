import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { nowVN } from "../lib/vnTime";
import { getKho, khoPhuTrach, laHcns, laThuKho, trongNhom } from "../lib/quyen";
import { sinhMaPhieu } from "../lib/maPhieu";
import { layPhamVi } from "../lib/phamVi";

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
  const daXacNhan = c.req.query("da_xac_nhan");
  if (daXacNhan === "0" || daXacNhan === "1") {
    conditions.push("p.da_xac_nhan = ?");
    binds.push(Number(daXacNhan));
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
    `SELECT p.id, p.ma_phieu, p.loai_phieu, p.nhan_vien_id, nv.ten_nv AS nhan_vien_ten,
            p.nhan_vien_nhan_moi_id, nv2.ten_nv AS nhan_vien_nhan_moi_ten,
            p.tu_kho_id, kt.ten_kho AS tu_kho_ten, p.den_kho_id, kd.ten_kho AS den_kho_ten,
            p.nguoi_lap, p.ngay_lap, p.ghi_chu, p.da_xac_nhan, p.created_at,
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
    `SELECT p.*, nv.ten_nv AS nhan_vien_ten, nv2.ten_nv AS nhan_vien_nhan_moi_ten,
            kt.ten_kho AS tu_kho_ten, kd.ten_kho AS den_kho_ten
     FROM phieu_giao_nhan p
     LEFT JOIN nhan_vien nv ON nv.ma_nv = p.nhan_vien_id
     LEFT JOIN nhan_vien nv2 ON nv2.ma_nv = p.nhan_vien_nhan_moi_id
     LEFT JOIN kho kt ON kt.id = p.tu_kho_id
     LEFT JOIN kho kd ON kd.id = p.den_kho_id
     WHERE p.id = ?`,
  )
    .bind(id)
    .first();
  if (!phieu) return c.json({ error: "NOT_FOUND" }, 404);

  const { results: items } = await c.env.DB.prepare(
    `SELECT ct.id, ct.ccdc_id, c.ten_ccdc, ct.tinh_trang_ghi_nhan, ct.ghi_chu
     FROM phieu_giao_nhan_ct ct JOIN ccdc c ON c.id = ct.ccdc_id
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

// Giao nhan TAI SAN CO DINH (hieu luc ngay, ben nhan xac nhan sau - co che giu nguyen tu Phase 1).
// Quyen (ke hoach Giai doan 1.5 muc 1), kiem tra o server - khong tin client:
//   Cap phat    (kho -> NV) : thu kho nguon; kho QL chi cap cho nhom cua chu kho.
//   Thu hoi     (NV -> kho) : thu kho dich; kho QL chi thu tu nhom cua chu kho.
//   Dieu chuyen (NV -> NV)  : HCNS/Admin/thu kho HCNS-Mien bat ky ai; QL chi khi CA 2 nguoi trong nhom minh.
//   Chuyen kho  (kho -> kho): thu kho nguon.
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

  if (loai === "Cap phat" || loai === "Chuyen kho") {
    const tu = await getKho(db, Number(body.tu_kho_id));
    if (!tu || !tu.bat_tat || tu.loai === "Mua hang") return c.json({ error: "TU_KHO_NOT_FOUND" }, 400);
    if (!(await laThuKho(db, user, tu.id))) return c.json({ error: "KHONG_PHU_TRACH_KHO_NGUON" }, 403);
    tuKhoId = tu.id;
    if (loai === "Cap phat") {
      if (!(await nvTonTai(db, body.nhan_vien_id))) return c.json({ error: "NHAN_VIEN_NOT_FOUND" }, 400);
      if (tu.loai === "Quan ly" && !(await trongNhom(db, tu.nhan_vien_id!, body.nhan_vien_id!))) {
        return c.json({ error: "NGOAI_NHOM_QUAN_LY" }, 403);
      }
      nvId = body.nhan_vien_id!;
    } else {
      const den = await getKho(db, Number(body.den_kho_id));
      if (!den || !den.bat_tat || den.loai === "Mua hang") return c.json({ error: "DEN_KHO_NOT_FOUND" }, 400);
      if (den.id === tu.id) return c.json({ error: "TRUNG_KHO" }, 400);
      denKhoId = den.id;
    }
  } else if (loai === "Thu hoi") {
    const den = await getKho(db, Number(body.den_kho_id));
    if (!den || !den.bat_tat || den.loai === "Mua hang") return c.json({ error: "DEN_KHO_NOT_FOUND" }, 400);
    if (!(await laThuKho(db, user, den.id))) return c.json({ error: "KHONG_PHU_TRACH_KHO_DICH" }, 403);
    if (!body.nhan_vien_id) return c.json({ error: "MISSING_FIELDS" }, 400);
    if (den.loai === "Quan ly" && !(await trongNhom(db, den.nhan_vien_id!, body.nhan_vien_id))) {
      return c.json({ error: "NGOAI_NHOM_QUAN_LY" }, 403);
    }
    denKhoId = den.id;
    nvId = body.nhan_vien_id;
  } else if (loai === "Dieu chuyen") {
    if (!body.nhan_vien_id || !(await nvTonTai(db, body.nhan_vien_nhan_moi_id))) return c.json({ error: "MISSING_NHAN_VIEN_NHAN_MOI" }, 400);
    if (body.nhan_vien_id === body.nhan_vien_nhan_moi_id) return c.json({ error: "TRUNG_NGUOI" }, 400);
    const toanQuyen = laHcns(user) || (await khoPhuTrach(db, user)).some((k) => k.loai === "HCNS" || k.loai === "Mien");
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
    .prepare(`SELECT id, trang_thai_hien_tai, nguoi_dang_giu, kho_id FROM ccdc WHERE vo_hieu_hoa = 0 AND id IN (SELECT value FROM json_each(?))`)
    .bind(JSON.stringify(ccdcIds))
    .all<{ id: string; trang_thai_hien_tai: string; nguoi_dang_giu: string | null; kho_id: number | null }>();
  if (ccdcRows.length !== ccdcIds.length) return c.json({ error: "CCDC_NOT_FOUND" }, 400);

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
        `INSERT INTO phieu_giao_nhan (id, loai_phieu, nhan_vien_id, nhan_vien_nhan_moi_id, tu_kho_id, den_kho_id, nguoi_lap, ngay_lap, ghi_chu, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(phieuId, loai, nvId, nvMoiId, tuKhoId, denKhoId, user.email, ngay, body.ghi_chu ?? null, nowVN()),
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
    } else {
      statements.push(db.prepare(`UPDATE ccdc SET kho_id = ?, updated_at = ? WHERE id = ?`).bind(denKhoId, ngay, ccdcId));
    }
  }

  await db.batch(statements);
  return c.json({ ok: true, id: phieuId });
});

// POST /:id/xac-nhan - CHI ben nhan dung phieu moi duoc xac nhan (chong IDOR): NV nhan (Cap phat /
// Dieu chuyen, qua email_dang_nhap) hoac thu kho cua kho nhan (Thu hoi / Chuyen kho).
phieuGiaoNhan.post("/:id/xac-nhan", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const phieu = await c.env.DB.prepare("SELECT nhan_vien_id, nhan_vien_nhan_moi_id, den_kho_id, loai_phieu FROM phieu_giao_nhan WHERE id = ?")
    .bind(id)
    .first<{ nhan_vien_id: string | null; nhan_vien_nhan_moi_id: string | null; den_kho_id: number | null; loai_phieu: string }>();
  if (!phieu) return c.json({ error: "NOT_FOUND" }, 404);

  let ok = false;
  if (phieu.loai_phieu === "Cap phat" || phieu.loai_phieu === "Dieu chuyen") {
    const target = phieu.loai_phieu === "Dieu chuyen" ? phieu.nhan_vien_nhan_moi_id : phieu.nhan_vien_id;
    ok = !!user.ma_nv && user.ma_nv === target;
  } else if (phieu.den_kho_id) {
    ok = await laThuKho(c.env.DB, user, phieu.den_kho_id);
  }
  if (!ok) return c.json({ error: "FORBIDDEN" }, 403);

  await c.env.DB.prepare("UPDATE phieu_giao_nhan SET da_xac_nhan = 1, xac_nhan_luc = ?, nguoi_xac_nhan = ? WHERE id = ?")
    .bind(nowVN(), user.email, id)
    .run();
  return c.json({ ok: true });
});

export default phieuGiaoNhan;
