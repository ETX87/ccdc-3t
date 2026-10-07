import { nowVN } from "./vnTime";

// Chuyen kho GIUA 2 CONG TY (da phap nhan, migration 0014): danh muc vat tu rieng tung cong ty -> moi dong
// phieu can ma vat tu BEN NHAN (phieu_chuyen_kho_ct.vt_id_den). Ghep theo ten + don vi tinh (khong phan biet
// hoa/thuong, khoang trang thua - so sanh o JS vi LOWER cua SQLite chi ASCII); ben nhan chua co -> tao ban sao
// (ma = ma goc + "-" + ma cong ty nhan, nhom ghep theo ten nhom). User chot 2026-10-07.

const chuan = (s: string | null | undefined) => (s ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

interface VtNguon {
  id: string;
  ten_vt: string;
  don_vi_tinh: string | null;
  don_gia_tham_khao: number | null;
  ten_nhom: string | null;
}

/**
 * Tra ve map vt nguon -> vt dich + cac lenh INSERT vat tu / nhom moi can chay TRONG CUNG batch voi
 * cap nhat phieu (de khong sinh danh muc rac neu batch loi).
 */
export async function ghepVatTu(
  db: D1Database,
  vtIds: string[],
  denCongTyId: number,
  email: string,
): Promise<{ map: Map<string, string>; lenh: D1PreparedStatement[] }> {
  const [nguon, dich, nhomDich, ct] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT v.id, v.ten_vt, v.don_vi_tinh, v.don_gia_tham_khao, n.ten_nhom
         FROM vt_tieu_hao v LEFT JOIN nhom_ccdc n ON n.id = v.nhom_id WHERE v.id IN (SELECT value FROM json_each(?))`,
      )
      .bind(JSON.stringify(vtIds)),
    db.prepare("SELECT id, ten_vt, don_vi_tinh FROM vt_tieu_hao WHERE cong_ty_id = ? AND vo_hieu_hoa = 0").bind(denCongTyId),
    db.prepare("SELECT id, ten_nhom FROM nhom_ccdc WHERE cong_ty_id = ? AND bat_tat = 1").bind(denCongTyId),
    db.prepare("SELECT ma FROM cong_ty WHERE id = ?").bind(denCongTyId),
  ]);
  const maCt = String(ct.results[0]?.ma ?? denCongTyId);
  const theoKhoa = new Map<string, string>();
  for (const r of dich.results as { id: string; ten_vt: string; don_vi_tinh: string | null }[]) {
    const k = `${chuan(r.ten_vt)}|${chuan(r.don_vi_tinh)}`;
    if (!theoKhoa.has(k)) theoKhoa.set(k, r.id);
  }
  const nhomTheoTen = new Map((nhomDich.results as { id: number; ten_nhom: string }[]).map((n) => [chuan(n.ten_nhom), n.id]));

  const map = new Map<string, string>();
  const lenh: D1PreparedStatement[] = [];
  const now = nowVN();
  for (const v of nguon.results as unknown as VtNguon[]) {
    const k = `${chuan(v.ten_vt)}|${chuan(v.don_vi_tinh)}`;
    let dichId = theoKhoa.get(k);
    if (!dichId) {
      // Ma moi: ma goc + "-" + ma cong ty; trung thi them so (vd ma goc da tung chuyen sang roi bi vo hieu).
      const goc = `${v.id}-${maCt}`;
      dichId = goc;
      for (let i = 2; await db.prepare("SELECT 1 AS ok FROM vt_tieu_hao WHERE id = ?").bind(dichId).first(); i++) dichId = `${goc}-${i}`;
      const nhomId = v.ten_nhom ? (nhomTheoTen.get(chuan(v.ten_nhom)) ?? null) : null;
      if (v.ten_nhom && nhomId == null) {
        // Nhom chua co ben nhan -> tao nhom cung ten (lay id qua ten trong lenh INSERT vat tu).
        lenh.push(db.prepare("INSERT INTO nhom_ccdc (ten_nhom, cong_ty_id) VALUES (?, ?)").bind(v.ten_nhom, denCongTyId));
        nhomTheoTen.set(chuan(v.ten_nhom), -1);
      }
      lenh.push(
        db
          .prepare(
            `INSERT INTO vt_tieu_hao (id, ten_vt, nhom_id, don_vi_tinh, don_gia_tham_khao, nguoi_tao, cong_ty_id, created_at, updated_at)
             VALUES (?, ?, ${v.ten_nhom ? "(SELECT id FROM nhom_ccdc WHERE cong_ty_id = ? AND ten_nhom = ? AND bat_tat = 1 ORDER BY id DESC LIMIT 1)" : "NULL"}, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(dichId, v.ten_vt, ...(v.ten_nhom ? [denCongTyId, v.ten_nhom] : []), v.don_vi_tinh, v.don_gia_tham_khao, email, denCongTyId, now, now),
      );
      theoKhoa.set(k, dichId);
    }
    map.set(v.id, dichId);
  }
  return { map, lenh };
}
