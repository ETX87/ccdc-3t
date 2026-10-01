// Ghep nhan su du lieu cu DOT 2 (2026-10-01) - DUNG CHINH lib/gopNhanVien.ts (cung logic nut "Doi ma / gop"
// tren man Nhan vien) de sinh SQL ap len production, thay vi viet lai logic gop bang Python nhu dot 1.
//
//   npx esbuild scripts/ghep_dot2.ts --bundle --platform=node --format=esm --external:wrangler --outfile=<tmp>.mjs
//   node <tmp>.mjs <ops_dot2.json> <persist-dir/v3> <out.sql>
//
// Chay TUNG thao tac tren ban sao local cua production (getPlatformProxy -> D1 local): lap ke hoach -> lay danh
// sach lenh (ghi lai SQL + tham so) -> thuc thi luon tren ban sao de thao tac sau thay ket qua thao tac truoc.
// File SQL dau ra = noi cac lenh voi tham so da dien san (gom ca chot batch_guard cua tung thao tac) - chay
// bang `wrangler d1 execute --file` (D1 chay nguyen tu ca file: 1 chot lech -> rollback het).
import { readFileSync, writeFileSync } from "node:fs";
import { getPlatformProxy } from "wrangler";
import { LoiGop, lapKeHoach, lenhThucHien, type YeuCau } from "../backend/src/lib/gopNhanVien";

interface Ops {
  nv: { ma: string; yc: YeuCau; dong: string }[];
  phieu: { ten: string; chot: string; la_etx: boolean; ten_moi: string; dong: string }[];
}
type Lenh = { sql: string; args: unknown[] };

const [opsFile, persist, outFile] = process.argv.slice(2);
const ops: Ops = JSON.parse(readFileSync(opsFile, "utf-8"));
const { env, dispose } = await getPlatformProxy<{ DB: D1Database }>({ configPath: "wrangler.jsonc", environment: "local", persist: { path: persist } });
const db = env.DB;
const NGUOI = "Ghep du lieu cu dot 2 (2026-10-01)";

// D1 "ghi am": prepare().bind() tra ve { sql, args } thay vi chay.
// Lenh khong tham so (vd "DELETE FROM batch_guard") khong goi .bind() -> ban than ket qua prepare cung la 1 lenh.
const ghiAm = { prepare: (sql: string) => ({ sql, args: [], bind: (...args: unknown[]) => ({ sql, args }) }) } as unknown as D1Database;
const lit = (v: unknown) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
function render(l: Lenh) {
  let i = 0;
  return l.sql.replace(/\?/g, () => lit(l.args[i++])).replace(/\s*\n\s*/g, " ") + ";";
}
const out: string[] = [
  "-- Sinh boi scripts/ghep_dot2.ts (lib/gopNhanVien.ts) - ghep nhan su du lieu cu dot 2.",
  "-- KHONG BEGIN/COMMIT: wrangler d1 execute --file chay nguyen tu ca file.",
];
async function chay(lenh: Lenh[], ghiChu: string) {
  await db.batch(lenh.map((l) => db.prepare(l.sql).bind(...l.args)));
  out.push(`-- ${ghiChu}`, ...lenh.map(render));
}

const bc = { gop: 0, taiCho: 0, loi: [] as string[], phieu: 0, taoMoi: 0 };
for (const o of ops.nv) {
  try {
    const k = await lapKeHoach(db, o.ma, o.yc);
    await chay(lenhThucHien(ghiAm, k, NGUOI) as unknown as Lenh[], `${o.dong}: ${o.ma} -> ${k.maDich} (${k.taiCho ? "gan tai cho" : "gop"})`);
    k.taiCho ? bc.taiCho++ : bc.gop++;
  } catch (e) {
    bc.loi.push(`${o.dong} ${o.ma}: ${e instanceof LoiGop ? e.code : String(e)}`);
  }
}

const g = (dk: string, ...a: unknown[]): Lenh => ({ sql: `INSERT INTO batch_guard (x) SELECT CASE WHEN ${dk} THEN 1 ELSE 0 END`, args: a });
for (const p of ops.phieu) {
  const lenh: Lenh[] = [];
  let dich: string | null;
  if (p.la_etx) {
    dich = (await db.prepare("SELECT ma_nv FROM nhan_vien WHERE ma_etx = ?").bind(p.chot).first<{ ma_nv: string }>())?.ma_nv ?? null;
    if (!dich) {
      const e = await db
        .prepare("SELECT ma_nhan_su, ho_ten, chuc_danh, gmail, trang_thai_lam_viec FROM etx_nhan_su WHERE ma_nhan_su = ?")
        .bind(p.chot)
        .first<{ ma_nhan_su: string; ho_ten: string; chuc_danh: string | null; gmail: string | null; trang_thai_lam_viec: string }>();
      if (!e) {
        bc.loi.push(`${p.dong} ${p.ten}: ma ETX ${p.chot} khong co`);
        continue;
      }
      lenh.push(
        g("NOT EXISTS (SELECT 1 FROM nhan_vien WHERE ma_nv = ? OR ma_etx = ?)", e.ma_nhan_su, e.ma_nhan_su),
        {
          sql: "INSERT INTO nhan_vien (ma_nv, ten_nv, chuc_vu, gmail, ma_etx, dang_lam_viec, ghi_chu, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'Them khi ghep du lieu cu dot 2', datetime('now', '+7 hours'), datetime('now', '+7 hours'))",
          args: [e.ma_nhan_su, e.ho_ten, e.chuc_danh, e.gmail, e.ma_nhan_su, e.trang_thai_lam_viec === "on" ? 1 : 0],
        },
      );
      dich = e.ma_nhan_su;
      bc.taoMoi++;
    } else lenh.push(g("EXISTS (SELECT 1 FROM nhan_vien WHERE ma_nv = ? AND ma_etx = ?)", dich, p.chot));
  } else {
    dich = (await db.prepare("SELECT ma_nv FROM nhan_vien WHERE ma_nv = ?").bind(p.chot).first<{ ma_nv: string }>())?.ma_nv ?? null;
    if (!dich) {
      lenh.push(g("NOT EXISTS (SELECT 1 FROM nhan_vien WHERE ma_nv = ?)", p.chot), {
        sql: "INSERT INTO nhan_vien (ma_nv, ten_nv, dang_lam_viec, ghi_chu, created_at, updated_at) VALUES (?, ?, 1, 'Ma tam (khong co tren ETX) - them khi ghep du lieu cu dot 2', datetime('now', '+7 hours'), datetime('now', '+7 hours'))",
        args: [p.chot, p.ten_moi],
      });
      dich = p.chot;
      bc.taoMoi++;
    } else lenh.push(g("EXISTS (SELECT 1 FROM nhan_vien WHERE ma_nv = ?)", dich));
  }
  lenh.push(
    {
      sql: "UPDATE phieu_chuyen_kho SET den_nhan_vien_id = ?, updated_at = datetime('now', '+7 hours') WHERE loai = 'Cap phat NV' AND den_nhan_vien_id IS NULL AND nguoi_nhan_ten_tu_do = ?",
      args: [dich, p.ten],
    },
    { sql: "DELETE FROM batch_guard", args: [] },
  );
  await chay(lenh, `${p.dong}: phieu ten tu do "${p.ten}" -> ${dich}`);
  bc.phieu++;
}

writeFileSync(outFile, out.join("\n") + "\n", "utf-8");
console.log(JSON.stringify(bc, null, 1));
await dispose();
