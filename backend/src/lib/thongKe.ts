import { dkPhieuKho, dkTaiSan, type PhamVi } from "./phamVi";
import { nowVN } from "./vnTime";

// Chi so "ton" (trang thai hien tai) cua tong quan + chup hang ngay vao thong_ke_ngay de tinh "% so voi
// ky truoc" (du lieu khong co lich su trang thai - migration 0008). Chi so "dong chay" (tieu hao da cap,
// phieu moi) tinh thang tu lich su phieu, KHONG can chup.

export type ChiSo = "tong_ts" | "trong_kho" | "dang_su_dung" | "cho_ke_toan";
export type BoChiSo = Record<ChiSo, { so_luong: number; gia_tri: number }>;

const TS_CON_QUAN_LY = `c.vo_hieu_hoa = 0 AND c.trang_thai_hien_tai NOT IN ('Da thanh ly', 'Da tieu huy', 'Cho duyet nhap')`;

type Dong = { sl: number | null; gt: number | null };

function cauLenh(db: D1Database, pv: PhamVi): D1PreparedStatement[] {
  const ts = dkTaiSan(pv);
  const pk = dkPhieuKho(pv);
  // Toan he thong: "Trong kho HCNS" dung nghia tren mau giao dien. Pham vi kho: trong kho cua pham vi.
  // Nhieu cong ty (congTyToan): kho HCNS cua cac cong ty do.
  const trongKho = pv.toanBo
    ? `c.kho_id IN (SELECT id FROM kho WHERE loai = 'HCNS')`
    : pv.congTyToan
      ? `c.kho_id IN (SELECT id FROM kho WHERE loai = 'HCNS' AND cong_ty_id IN (SELECT value FROM json_each(?)))`
      : ts.sql;
  const trongKhoBinds = pv.toanBo ? [] : pv.congTyToan ? [JSON.stringify(pv.congTyToan)] : ts.binds;
  return [
    db.prepare(`SELECT COUNT(*) AS sl, SUM(c.nguyen_gia) AS gt FROM ccdc c WHERE ${TS_CON_QUAN_LY} AND ${ts.sql}`).bind(...ts.binds),
    db
      .prepare(`SELECT COUNT(*) AS sl, SUM(c.nguyen_gia) AS gt FROM ccdc c WHERE c.vo_hieu_hoa = 0 AND c.trang_thai_hien_tai = 'Trong kho' AND ${trongKho}`)
      .bind(...trongKhoBinds),
    db
      .prepare(`SELECT COUNT(*) AS sl, SUM(c.nguyen_gia) AS gt FROM ccdc c WHERE c.vo_hieu_hoa = 0 AND c.trang_thai_hien_tai = 'Dang cap phat' AND ${ts.sql}`)
      .bind(...ts.binds),
    db
      .prepare(
        `SELECT COUNT(*) AS sl, COALESCE(SUM((SELECT SUM(ct.thanh_tien) FROM phieu_chuyen_kho_ct ct WHERE ct.phieu_id = p.id)), 0) AS gt
         FROM phieu_chuyen_kho p WHERE p.trang_thai = 'Cho ke toan duyet' AND ${pk.sql}`,
      )
      .bind(...pk.binds),
    db
      .prepare(
        `SELECT COUNT(DISTINCT x.id) AS sl, SUM(c.nguyen_gia) AS gt
         FROM phieu_xu_ly_ts x JOIN phieu_xu_ly_ts_ct ct ON ct.phieu_id = x.id JOIN ccdc c ON c.id = ct.ccdc_id
         WHERE x.trang_thai = 'Cho ke toan duyet' AND ${ts.sql}`,
      )
      .bind(...ts.binds),
  ];
}

function gop(rs: D1Result<Dong>[]): BoChiSo {
  const v = (i: number) => rs[i].results[0] ?? { sl: 0, gt: 0 };
  return {
    tong_ts: { so_luong: v(0).sl ?? 0, gia_tri: v(0).gt ?? 0 },
    trong_kho: { so_luong: v(1).sl ?? 0, gia_tri: v(1).gt ?? 0 },
    dang_su_dung: { so_luong: v(2).sl ?? 0, gia_tri: v(2).gt ?? 0 },
    cho_ke_toan: { so_luong: (v(3).sl ?? 0) + (v(4).sl ?? 0), gia_tri: (v(3).gt ?? 0) + (v(4).gt ?? 0) },
  };
}

export async function tinhChiSo(db: D1Database, pv: PhamVi): Promise<BoChiSo> {
  return gop((await db.batch<Dong>(cauLenh(db, pv))) as D1Result<Dong>[]);
}

/** Chup chi so toan he thong + tung cong ty + tung kho (UPSERT theo ngay - chay lai trong ngay chi ghi de). */
export async function chupSoLieu(db: D1Database, ngay: string): Promise<void> {
  const { results: khos } = await db
    .prepare("SELECT id, loai, nhan_vien_id, cong_ty_id FROM kho WHERE bat_tat = 1 AND loai NOT IN ('Mua hang', 'Tieu hao')")
    .all<{ id: number; loai: string; nhan_vien_id: string | null; cong_ty_id: number }>();
  const { results: congTys } = await db.prepare("SELECT id FROM cong_ty").all<{ id: number }>();
  const { results: capDuoi } = await db
    .prepare("SELECT ma_nv, quan_ly_id FROM nhan_vien WHERE quan_ly_id IS NOT NULL AND dang_lam_viec = 1")
    .all<{ ma_nv: string; quan_ly_id: string }>();

  const phamVis: { key: string; pv: PhamVi }[] = [{ key: "all", pv: { toanBo: true, khoIds: [], nhomMaNv: [], xemTongHop: true } }];
  for (const ct of congTys) {
    const khoIds = khos.filter((k) => k.cong_ty_id === ct.id).map((k) => k.id);
    phamVis.push({ key: `cong_ty:${ct.id}`, pv: { toanBo: false, khoIds, nhomMaNv: [], xemTongHop: true, congTyToan: [ct.id] } });
  }
  for (const k of khos) {
    const nhom =
      k.loai === "Quan ly" && k.nhan_vien_id
        ? [k.nhan_vien_id, ...capDuoi.filter((r) => r.quan_ly_id === k.nhan_vien_id).map((r) => r.ma_nv)]
        : [];
    phamVis.push({ key: `kho:${k.id}`, pv: { toanBo: false, khoIds: [k.id], nhomMaNv: nhom, xemTongHop: true } });
  }

  const upserts: D1PreparedStatement[] = [];
  for (const { key, pv } of phamVis) {
    const bo = await tinhChiSo(db, pv);
    for (const [chiSo, v] of Object.entries(bo)) {
      upserts.push(
        db
          .prepare(
            `INSERT INTO thong_ke_ngay (ngay, pham_vi, chi_so, so_luong, gia_tri) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(ngay, pham_vi, chi_so) DO UPDATE SET so_luong = excluded.so_luong, gia_tri = excluded.gia_tri`,
          )
          .bind(ngay, key, chiSo, v.so_luong, v.gia_tri),
      );
    }
  }
  for (let i = 0; i < upserts.length; i += 100) await db.batch(upserts.slice(i, i + 100));
}

/** Goi tu request dau tien trong ngay (waitUntil) - phong khi cron lo 1 ngay. */
export async function chupNeuChuaCo(db: D1Database): Promise<void> {
  const ngay = nowVN().slice(0, 10);
  const co = await db.prepare("SELECT 1 AS ok FROM thong_ke_ngay WHERE ngay = ? AND pham_vi = 'all' LIMIT 1").bind(ngay).first();
  if (!co) await chupSoLieu(db, ngay);
}

/**
 * Chi so da chup gan nhat <= ngayMoc cho pham vi (toan he thong: 'all'; con lai: cong cac kho).
 * null = chua co ban chup nao truoc moc -> giao dien ghi "Chua co so lieu ky truoc", KHONG bia.
 */
export async function soLieuDaChup(db: D1Database, pv: PhamVi, ngayMoc: string): Promise<{ ngay: string; bo: BoChiSo } | null> {
  const keys = pv.toanBo ? ["all"] : pv.congTyToan ? pv.congTyToan.map((id) => `cong_ty:${id}`) : pv.khoIds.map((id) => `kho:${id}`);
  if (!keys.length) return null;
  const q = keys.map(() => "?").join(",");
  const moc = await db
    .prepare(`SELECT MAX(ngay) AS ngay FROM thong_ke_ngay WHERE ngay <= ? AND pham_vi IN (${q})`)
    .bind(ngayMoc, ...keys)
    .first<{ ngay: string | null }>();
  if (!moc?.ngay) return null;
  const { results } = await db
    .prepare(`SELECT chi_so, SUM(so_luong) AS sl, SUM(gia_tri) AS gt FROM thong_ke_ngay WHERE ngay = ? AND pham_vi IN (${q}) GROUP BY chi_so`)
    .bind(moc.ngay, ...keys)
    .all<{ chi_so: ChiSo; sl: number; gt: number }>();
  const bo = { tong_ts: { so_luong: 0, gia_tri: 0 }, trong_kho: { so_luong: 0, gia_tri: 0 }, dang_su_dung: { so_luong: 0, gia_tri: 0 }, cho_ke_toan: { so_luong: 0, gia_tri: 0 } } as BoChiSo;
  for (const r of results) if (r.chi_so in bo) bo[r.chi_so] = { so_luong: r.sl, gia_tri: r.gt };
  return { ngay: moc.ngay, bo };
}
