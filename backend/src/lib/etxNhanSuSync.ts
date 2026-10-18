import type { Env } from "../types";
import { fetchEtxNhanSuAll, type EtxNhanSuItem } from "./etxNhanSuClient";
import { nowVN } from "./vnTime";
import { tuDongTaiKhoanTuEtx } from "./etxTuDongTaiKhoan";
import { lenhTaoKhoQl } from "./nvCongTy";

// Dong bo danh ba nhan_vien tu ETX (PULL 1 chieu, full-refresh + DIFF - chi ghi dong thuc su khac,
// giong linh-kien-app lib/etxNhanSuSync.ts). Chay qua cron hang ngay (index.ts scheduled()) hoac
// nut "Dong bo ngay" (routes/etxSync.ts). ETX quyet dinh: ho ten, chuc vu, gmail, dang lam viec,
// quan ly truc tiep. Cac cot con lai (bo_phan, sdt, email_dang_nhap, ghi_chu) do HCNS quan ly tay.
//
// Khop 1 nguoi ETX voi dong nhan_vien co san theo thu tu: ma_etx -> ma_nv trung maNhanSu -> gmail
// trung (dong cu tu Excel chua co ma_etx). Khong khop -> them moi (ma_nv = maNhanSu), tru nguoi da
// OFF chua tung co trong he thong (khong can dua vao).

interface NvRow {
  ma_nv: string;
  ten_nv: string;
  chuc_vu: string | null;
  gmail: string | null;
  ma_etx: string | null;
  dang_lam_viec: number;
  quan_ly_id: string | null;
  email_dang_nhap: string | null;
}

export interface EtxSyncResult {
  total: number;
  inserted: number;
  updated: number;
  quanLyUpdated: number;
  khoaTaiKhoan: number;
}

const CHUNK = 400;

async function runInChunks(db: D1Database, stmts: D1PreparedStatement[]) {
  for (let i = 0; i < stmts.length; i += CHUNK) await db.batch(stmts.slice(i, i + CHUNK));
}

const lower = (s: string | null | undefined) => (s ? s.trim().toLowerCase() : null);

export async function runEtxNhanSuSync(env: Env, db: D1Database): Promise<EtxSyncResult> {
  const items = (await fetchEtxNhanSuAll(env)).filter((i) => i.maNhanSu?.trim());

  const { results: rows } = await db
    .prepare("SELECT ma_nv, ten_nv, chuc_vu, gmail, ma_etx, dang_lam_viec, quan_ly_id, email_dang_nhap FROM nhan_vien")
    .all<NvRow>();
  const byEtx = new Map(rows.filter((r) => r.ma_etx).map((r) => [r.ma_etx!, r]));
  const byMaNv = new Map(rows.map((r) => [r.ma_nv, r]));
  const byGmail = new Map<string, NvRow>();
  for (const r of rows) if (!r.ma_etx && r.gmail) byGmail.set(lower(r.gmail)!, r);

  const now = nowVN();
  const writes: D1PreparedStatement[] = [];
  const lockToggles: D1PreparedStatement[] = [];
  const etxToMaNv = new Map<string, string>();
  const daDung = new Set<string>(); // ma_nv da gan cho 1 nguoi ETX (tranh 2 nguoi ETX nhan chung 1 dong)
  let inserted = 0;
  let updated = 0;

  for (const it of items) {
    const ma = it.maNhanSu.trim();
    const on = it.trangThaiLamViec === "on" ? 1 : 0;
    const gmail = lower(it.gmail);
    let row = byEtx.get(ma);
    if (!row) {
      const cand = byMaNv.get(ma);
      if (cand && !cand.ma_etx && !daDung.has(cand.ma_nv)) row = cand;
    }
    if (!row && gmail) {
      const cand = byGmail.get(gmail);
      if (cand && !daDung.has(cand.ma_nv)) row = cand;
    }

    if (!row) {
      if (!on || byMaNv.has(ma)) continue; // nguoi da nghi chua tung co / trung ma_nv voi dong khac
      writes.push(
        db
          .prepare(
            // ETX khong co thong tin cong ty -> cong ty mac dinh (cong_ty.mac_dinh), HCNS doi tay sau.
            `INSERT INTO nhan_vien (ma_nv, ten_nv, chuc_vu, gmail, ma_etx, dang_lam_viec, cong_ty_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 1, COALESCE((SELECT id FROM cong_ty WHERE mac_dinh = 1 AND bat_tat = 1 LIMIT 1), 1), ?, ?)`,
          )
          .bind(ma, it.hoTen, it.chucDanh, gmail, ma, now, now),
      );
      etxToMaNv.set(ma, ma);
      daDung.add(ma);
      inserted++;
      continue;
    }

    etxToMaNv.set(ma, row.ma_nv);
    daDung.add(row.ma_nv);
    if (row.ten_nv !== it.hoTen || row.chuc_vu !== it.chucDanh || lower(row.gmail) !== gmail || row.ma_etx !== ma || row.dang_lam_viec !== on) {
      writes.push(
        db
          .prepare(`UPDATE nhan_vien SET ten_nv = ?, chuc_vu = ?, gmail = ?, ma_etx = ?, dang_lam_viec = ?, updated_at = ? WHERE ma_nv = ?`)
          .bind(it.hoTen, it.chucDanh, gmail, ma, on, now, row.ma_nv),
      );
      updated++;
    }
    // Chuyen trang thai giua 2 lan dong bo -> khoa / mo khoa tai khoan da lien ket (giong linh-kien-app).
    if (row.dang_lam_viec !== on && row.email_dang_nhap) {
      lockToggles.push(db.prepare("UPDATE users SET bi_khoa = ?, updated_at = ? WHERE email = ?").bind(on ? 0 : 1, now, row.email_dang_nhap));
    }
  }

  // Danh ba ETX DAY DU (ca nguoi da nghi, migration 0011) - tra cuu "Gan ma ETX chuan" tai cho. Chi ghi dong khac.
  const { results: daCo } = await db
    .prepare("SELECT ma_nhan_su, ho_ten, chuc_danh, gmail, trang_thai_lam_viec FROM etx_nhan_su")
    .all<{ ma_nhan_su: string; ho_ten: string; chuc_danh: string | null; gmail: string | null; trang_thai_lam_viec: string }>();
  const cu = new Map(daCo.map((r) => [r.ma_nhan_su, r]));
  for (const it of items) {
    const ma = it.maNhanSu.trim();
    const r = cu.get(ma);
    const gmail = lower(it.gmail);
    const tt = it.trangThaiLamViec === "on" ? "on" : "off";
    if (r && r.ho_ten === it.hoTen && r.chuc_danh === it.chucDanh && r.gmail === gmail && r.trang_thai_lam_viec === tt) continue;
    writes.push(
      db
        .prepare(
          `INSERT INTO etx_nhan_su (ma_nhan_su, ho_ten, chuc_danh, gmail, trang_thai_lam_viec, updated_at) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(ma_nhan_su) DO UPDATE SET ho_ten = excluded.ho_ten, chuc_danh = excluded.chuc_danh, gmail = excluded.gmail,
             trang_thai_lam_viec = excluded.trang_thai_lam_viec, updated_at = excluded.updated_at`,
        )
        .bind(ma, it.hoTen, it.chucDanh, gmail, tt, now),
    );
  }

  await runInChunks(db, writes);

  // Luot 2: quan ly truc tiep (FK nhan_vien -> phai chay SAU khi moi dong da ton tai) + kho QL cho
  // moi quan ly co it nhat 1 cap duoi dang lam viec (chuoi kho ... -> KHO QL -> NV).
  const qlWrites: D1PreparedStatement[] = [];
  const quanLyCoCapDuoi = new Set<string>();
  let quanLyUpdated = 0;
  for (const it of items) {
    const maNv = etxToMaNv.get(it.maNhanSu.trim());
    if (!maNv) continue;
    const qlEtx = it.quanLyTrucTiep?.[0]?.maNhanSu?.trim();
    const qlMaNv = qlEtx ? (etxToMaNv.get(qlEtx) ?? null) : null;
    const cur = byMaNv.get(maNv);
    if ((cur?.quan_ly_id ?? null) !== qlMaNv && qlMaNv !== maNv) {
      qlWrites.push(db.prepare("UPDATE nhan_vien SET quan_ly_id = ?, updated_at = ? WHERE ma_nv = ?").bind(qlMaNv, now, maNv));
      quanLyUpdated++;
    }
    if (qlMaNv && it.trangThaiLamViec === "on") quanLyCoCapDuoi.add(qlMaNv);
  }
  // Kho QL o moi cong ty QL co cap duoi (nhan vien kiem nhiem - lib/nvCongTy.ts).
  for (const ql of quanLyCoCapDuoi) qlWrites.push(lenhTaoKhoQl(db, ql, now));
  await runInChunks(db, qlWrites);
  await runInChunks(db, lockToggles);

  return { total: items.length, inserted, updated, quanLyUpdated, khoaTaiKhoan: lockToggles.length };
}

// Wrapper dung chung cron + nut thu cong: boc try/catch de ETX loi khong lam crash cron, LUON ghi
// etx_sync_state de UI biet lan chay gan nhat the nao.
export async function runEtxNhanSuSyncWithState(env: Env, db: D1Database): Promise<void> {
  try {
    const r = await runEtxNhanSuSync(env, db);
    // Buoc 2 (2026-09-30): tu tao + duyet + lien ket tai khoan cho nhan su dang lam viec.
    const tk = await tuDongTaiKhoanTuEtx(db);
    await db
      .prepare(
        "UPDATE etx_sync_state SET last_run_at = ?, last_status = 'ok', changed_count = ?, tai_khoan_count = ?, last_error = NULL WHERE id = 1",
      )
      .bind(nowVN(), r.inserted + r.updated + r.quanLyUpdated, tk.tkTuTao + tk.tkTuDuyet + tk.lienKet)
      .run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[etxNhanSuSync]", message);
    await db
      .prepare("UPDATE etx_sync_state SET last_run_at = ?, last_status = 'error', last_error = ? WHERE id = 1")
      .bind(nowVN(), message.slice(0, 500))
      .run();
  }
}
