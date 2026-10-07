import { nowVN } from "./vnTime";

// Doi ma / gop ho so nhan vien AN TOAN voi ton kho (user chot 2026-10-01: "1 nhan su chi co 1 tai khoan, du
// phong doi ma tu ma sai sang ma chuan ma khong anh huong ton kho thuc te, cho phep doi ma ETX chuan, doi ten").
//
// 3 thao tac, cung 1 loi "gop ho so NGUON vao ho so DICH":
//   - gop     : dich = ho so co san (vd 2 ho so cua cung 1 nguoi).
//   - doi-ma  : doi ma_nv noi bo. Ma moi chua co -> tao ho so moi (chep thong tin) roi gop vao; ma moi da co
//               -> thanh gop vao ho so do.
//   - gan-etx : gan ma ETX chuan (phai co trong danh ba etx_nhan_su). Ma da thuoc ho so khac -> gop NGUON vao
//               ho so do (ETX la goc); chua thuoc ai -> gan tai cho + lay ho ten / chuc danh / gmail / trang
//               thai theo ETX (sync hang ngay se tu khop qua ma_etx tu nay).
// Ton kho tieu hao tinh theo KHO (v_ton_kho), TSCD theo ccdc.nguoi_dang_giu / kho_id - chuyen DU moi cot tham
// chieu (danh sach duoi, doi chieu PRAGMA foreign_key_list + cot khong khai FK) thi tong ton khong doi. Hai ho
// so cung co kho QL -> GOP KHO: chuyen moi tham chieu kho nguon sang kho dich roi xoa kho nguon (ton 2 kho cong
// lai, tong khong doi). Moi lenh trong 1 db.batch(), dau batch co chot batch_guard: du lieu doi giua luc xem
// truoc va luc thuc hien -> rollback ca batch.

export const COT_NHAN_VIEN: [string, string][] = [
  ["ccdc", "nguoi_dang_giu"],
  ["phieu_giao_nhan", "nhan_vien_id"],
  ["phieu_giao_nhan", "nhan_vien_nhan_moi_id"],
  ["phieu_chuyen_kho", "den_nhan_vien_id"],
  ["kiem_ke_ct", "nguoi_dang_giu_thuc_te"],
  ["phieu_xu_ly_ts_ct", "nguoi_giu_truoc"],
];
// + nhan_vien.quan_ly_id, kho.nhan_vien_id (xu ly rieng ben duoi).
export const COT_KHO: [string, string][] = [
  ["ccdc", "kho_id"],
  ["phieu_giao_nhan", "tu_kho_id"],
  ["phieu_giao_nhan", "den_kho_id"],
  ["phieu_chuyen_kho", "tu_kho_id"],
  ["phieu_chuyen_kho", "den_kho_id"],
  ["phieu_xu_ly_ts_ct", "kho_truoc"],
];
// + kho_thu_kho (PK kho_id, email - xu ly rieng).

const NHAN: Record<string, string> = {
  "ccdc.nguoi_dang_giu": "Tài sản đang giữ",
  "phieu_giao_nhan.nhan_vien_id": "Phiếu giao nhận TSCĐ",
  "phieu_giao_nhan.nhan_vien_nhan_moi_id": "Phiếu điều chuyển TSCĐ (người nhận mới)",
  "phieu_chuyen_kho.den_nhan_vien_id": "Phiếu cấp phát tiêu hao",
  "kiem_ke_ct.nguoi_dang_giu_thuc_te": "Dòng kiểm kê",
  "phieu_xu_ly_ts_ct.nguoi_giu_truoc": "Phiếu xử lý tài sản",
  "nhan_vien.quan_ly_id": "Nhân viên cấp dưới",
};

export interface NvRow {
  ma_nv: string;
  ten_nv: string;
  bo_phan: string | null;
  chuc_vu: string | null;
  sdt: string | null;
  email_dang_nhap: string | null;
  dang_lam_viec: number;
  ghi_chu: string | null;
  quan_ly_id: string | null;
  ma_etx: string | null;
  gmail: string | null;
  cong_ty_id: number;
}
interface EtxRow {
  ma_nhan_su: string;
  ho_ten: string;
  chuc_danh: string | null;
  gmail: string | null;
  trang_thai_lam_viec: string;
}
interface KhoRow {
  id: number;
  ten_kho: string;
}

export type YeuCau = { loai: "gop"; dich: string } | { loai: "doi-ma"; maMoi: string } | { loai: "gan-etx"; maEtx: string };
export type GiuEmail = "dich" | "nguon";

export interface KeHoach {
  thaoTac: "Gop ho so" | "Doi ma" | "Gan ma ETX";
  nguon: NvRow;
  dich: NvRow | null; // null = ho so dich se TAO MOI (doi-ma) hoac gan ETX TAI CHO (taiCho)
  maDich: string;
  taiCho: boolean; // gan-etx vao chinh ho so nguon, khong gop
  etx: EtxRow | null;
  ketQua: { ten_nv: string; ma_etx: string | null; email_dang_nhap: string | null; dang_lam_viec: number };
  chuyen: { nhan: string; so: number }[];
  khoNguon: (KhoRow & { ton: number }) | null;
  khoDich: KhoRow | null;
  gopKho: boolean;
  xungDotEmail: { nguon: string; dich: string } | null;
  canhBao: string[];
}

const COT_NV_SELECT = "ma_nv, ten_nv, bo_phan, chuc_vu, sdt, email_dang_nhap, dang_lam_viec, ghi_chu, quan_ly_id, ma_etx, gmail, cong_ty_id";
export const MA_NV_RE = /^[A-Za-z0-9._-]{2,40}$/;

export class LoiGop extends Error {
  constructor(public code: string, public extra?: Record<string, unknown>) {
    super(code);
  }
}

const docNv = (db: D1Database, ma: string) => db.prepare(`SELECT ${COT_NV_SELECT} FROM nhan_vien WHERE ma_nv = ?`).bind(ma).first<NvRow>();
const docKho = (db: D1Database, ma: string) => db.prepare("SELECT id, ten_kho FROM kho WHERE nhan_vien_id = ?").bind(ma).first<KhoRow>();

export async function lapKeHoach(db: D1Database, maNguon: string, yc: YeuCau, giu: GiuEmail = "dich"): Promise<KeHoach> {
  const nguon = await docNv(db, maNguon);
  if (!nguon) throw new LoiGop("NOT_FOUND");
  const canhBao: string[] = [];
  let thaoTac: KeHoach["thaoTac"];
  let dich: NvRow | null = null;
  let maDich: string;
  let taiCho = false;
  let etx: EtxRow | null = null;

  if (yc.loai === "gan-etx") {
    thaoTac = "Gan ma ETX";
    const ma = yc.maEtx.trim().toUpperCase();
    etx = await db.prepare("SELECT ma_nhan_su, ho_ten, chuc_danh, gmail, trang_thai_lam_viec FROM etx_nhan_su WHERE ma_nhan_su = ?").bind(ma).first<EtxRow>();
    if (!etx) {
      const co = await db.prepare("SELECT 1 FROM etx_nhan_su LIMIT 1").first();
      throw new LoiGop(co ? "MA_ETX_KHONG_CO" : "ETX_CHUA_DONG_BO");
    }
    if (nguon.ma_etx === ma) throw new LoiGop("DA_CO_MA_ETX_NAY");
    dich = await db.prepare(`SELECT ${COT_NV_SELECT} FROM nhan_vien WHERE ma_etx = ?`).bind(ma).first<NvRow>();
    if (dich) maDich = dich.ma_nv;
    else {
      taiCho = true;
      maDich = nguon.ma_nv;
    }
    if (nguon.ma_etx) canhBao.push(`Bỏ mã ETX cũ ${nguon.ma_etx} của hồ sơ này (mã sai).`);
  } else if (yc.loai === "doi-ma") {
    const ma = yc.maMoi.trim();
    if (!MA_NV_RE.test(ma)) throw new LoiGop("MA_MOI_KHONG_HOP_LE");
    if (ma === nguon.ma_nv) throw new LoiGop("TRUNG_MA");
    dich = await docNv(db, ma);
    thaoTac = dich ? "Gop ho so" : "Doi ma";
    maDich = ma;
  } else {
    if (yc.dich === nguon.ma_nv) throw new LoiGop("TRUNG_MA");
    dich = await docNv(db, yc.dich);
    if (!dich) throw new LoiGop("DICH_NOT_FOUND");
    thaoTac = "Gop ho so";
    maDich = dich.ma_nv;
  }

  // Da phap nhan: 2 ho so thuoc 2 cong ty khac nhau -> khong gop (tai san / kho moi cong ty doc lap) - doi cong ty
  // cho 1 ho so truoc (sua nhan vien) roi moi gop.
  if (dich && dich.cong_ty_id !== nguon.cong_ty_id) throw new LoiGop("KHAC_CONG_TY");

  // Hai ho so gan 2 ma ETX khac nhau = 2 nguoi that khac nhau -> khong gop (tru gan-etx: ma cua nguon la ma sai).
  if (dich && yc.loai !== "gan-etx" && nguon.ma_etx && dich.ma_etx && nguon.ma_etx !== dich.ma_etx) {
    throw new LoiGop("HAI_MA_ETX_KHAC_NHAU", { nguon: nguon.ma_etx, dich: dich.ma_etx });
  }

  // Email dang nhap: 1 nhan su - 1 tai khoan.
  const eN = nguon.email_dang_nhap?.toLowerCase() ?? null;
  const eD = dich?.email_dang_nhap?.toLowerCase() ?? null;
  const xungDotEmail = eN && eD && eN !== eD ? { nguon: eN, dich: eD } : null;
  let email = taiCho || !dich ? nguon.email_dang_nhap : (dich.email_dang_nhap ?? nguon.email_dang_nhap);
  if (xungDotEmail) {
    email = giu === "nguon" ? nguon.email_dang_nhap : dich!.email_dang_nhap;
    canhBao.push(`Hai hồ sơ gắn 2 tài khoản khác nhau - giữ ${email}, tài khoản ${giu === "nguon" ? eD : eN} sẽ không còn gắn hồ sơ nào.`);
  }

  const maEtxKq = etx ? etx.ma_nhan_su : (dich?.ma_etx ?? nguon.ma_etx);
  const ketQua = {
    ten_nv: etx ? etx.ho_ten : (dich?.ten_nv ?? nguon.ten_nv),
    ma_etx: maEtxKq,
    email_dang_nhap: email,
    dang_lam_viec: etx ? (etx.trang_thai_lam_viec === "on" ? 1 : 0) : dich?.ma_etx ? dich.dang_lam_viec : Math.max(nguon.dang_lam_viec, dich?.dang_lam_viec ?? 0),
  };

  // So dong se chuyen (xem truoc).
  const chuyen: KeHoach["chuyen"] = [];
  let khoNguon: KeHoach["khoNguon"] = null;
  let khoDich: KhoRow | null = null;
  let gopKho = false;
  if (!taiCho) {
    const cot = [...COT_NHAN_VIEN, ["nhan_vien", "quan_ly_id"] as [string, string]];
    const dem = await db
      .prepare(`SELECT ${cot.map(([b, c], i) => `(SELECT COUNT(*) FROM ${b} WHERE ${c} = ?1${b === "nhan_vien" ? " AND ma_nv != ?2" : ""}) AS c${i}`).join(", ")}`)
      .bind(nguon.ma_nv, maDich)
      .first<Record<string, number>>();
    cot.forEach(([b, c], i) => {
      const so = dem?.[`c${i}`] ?? 0;
      if (so) chuyen.push({ nhan: NHAN[`${b}.${c}`] ?? `${b}.${c}`, so });
    });
    const kN = await docKho(db, nguon.ma_nv);
    khoDich = dich ? await docKho(db, dich.ma_nv) : null;
    if (kN) {
      const t = await db.prepare("SELECT COALESCE(SUM(ton), 0) AS ton FROM v_ton_kho WHERE kho_id = ?").bind(kN.id).first<{ ton: number }>();
      khoNguon = { ...kN, ton: t?.ton ?? 0 };
      gopKho = !!khoDich;
      if (gopKho) canhBao.push(`Gộp kho "${kN.ten_kho}" vào "${khoDich!.ten_kho}" - tồn 2 kho cộng lại, tổng tồn không đổi.`);
    }
  }
  if (!ketQua.dang_lam_viec) canhBao.push("Hồ sơ sau khi xử lý ở trạng thái NGHỈ VIỆC.");

  return { thaoTac, nguon, dich, maDich, taiCho, etx, ketQua, chuyen, khoNguon, khoDich, gopKho, xungDotEmail, canhBao };
}

export function lenhThucHien(db: D1Database, k: KeHoach, nguoi: string): D1PreparedStatement[] {
  const now = nowVN();
  const n = k.nguon;
  const s: D1PreparedStatement[] = [];
  const guard = (dk: string, ...binds: unknown[]) =>
    s.push(db.prepare(`INSERT INTO batch_guard (x) SELECT CASE WHEN ${dk} THEN 1 ELSE 0 END`).bind(...binds));

  // 0. Chot: du lieu van y nhu luc lap ke hoach.
  guard("EXISTS (SELECT 1 FROM nhan_vien WHERE ma_nv = ? AND ma_etx IS ? AND email_dang_nhap IS ?)", n.ma_nv, n.ma_etx, n.email_dang_nhap);
  if (k.dich) guard("EXISTS (SELECT 1 FROM nhan_vien WHERE ma_nv = ? AND ma_etx IS ? AND email_dang_nhap IS ?)", k.dich.ma_nv, k.dich.ma_etx, k.dich.email_dang_nhap);
  else if (!k.taiCho) guard("NOT EXISTS (SELECT 1 FROM nhan_vien WHERE ma_nv = ?)", k.maDich);
  if (k.etx && !k.dich) guard("NOT EXISTS (SELECT 1 FROM nhan_vien WHERE ma_etx = ?)", k.etx.ma_nhan_su);
  if (!k.taiCho) {
    guard("(SELECT id FROM kho WHERE nhan_vien_id = ?) IS ?", n.ma_nv, k.khoNguon?.id ?? null);
    if (k.dich) guard("(SELECT id FROM kho WHERE nhan_vien_id = ?) IS ?", k.dich.ma_nv, k.khoDich?.id ?? null);
  }

  if (k.taiCho) {
    // Gan ma ETX tai cho - khong chuyen tham chieu nao.
    s.push(
      db
        .prepare("UPDATE nhan_vien SET ma_etx = ?, ten_nv = ?, chuc_vu = ?, gmail = ?, dang_lam_viec = ?, updated_at = ? WHERE ma_nv = ?")
        .bind(k.etx!.ma_nhan_su, k.etx!.ho_ten, k.etx!.chuc_danh, k.etx!.gmail?.trim().toLowerCase() ?? null, k.ketQua.dang_lam_viec, now, n.ma_nv),
    );
  } else {
    const d = k.maDich;
    // 1. Nha ma_etx cua nguon truoc (UNIQUE) neu no se sang dich.
    if (n.ma_etx) s.push(db.prepare("UPDATE nhan_vien SET ma_etx = NULL WHERE ma_nv = ?").bind(n.ma_nv));
    // 2. Doi ma: tao ho so dich (chep thong tin nguon).
    if (!k.dich) {
      s.push(
        db
          .prepare(
            `INSERT INTO nhan_vien (ma_nv, ten_nv, bo_phan, chuc_vu, sdt, email_dang_nhap, dang_lam_viec, ghi_chu, quan_ly_id, gmail, cong_ty_id, created_at, updated_at)
             SELECT ?, ten_nv, bo_phan, chuc_vu, sdt, email_dang_nhap, dang_lam_viec, ghi_chu, quan_ly_id, gmail, cong_ty_id, created_at, ? FROM nhan_vien WHERE ma_nv = ?`,
          )
          .bind(d, now, n.ma_nv),
      );
    }
    // 3. Chuyen moi tham chieu nhan vien.
    for (const [b, c] of COT_NHAN_VIEN) s.push(db.prepare(`UPDATE ${b} SET ${c} = ? WHERE ${c} = ?`).bind(d, n.ma_nv));
    s.push(db.prepare("UPDATE nhan_vien SET quan_ly_id = ? WHERE quan_ly_id = ? AND ma_nv != ?").bind(d, n.ma_nv, d));
    // 4. Kho QL.
    if (k.khoNguon && k.gopKho && k.khoDich) {
      const a = k.khoNguon.id;
      const b2 = k.khoDich.id;
      for (const [b, c] of COT_KHO) s.push(db.prepare(`UPDATE ${b} SET ${c} = ? WHERE ${c} = ?`).bind(b2, a));
      s.push(db.prepare("INSERT OR IGNORE INTO kho_thu_kho (kho_id, email, created_at) SELECT ?, email, created_at FROM kho_thu_kho WHERE kho_id = ?").bind(b2, a));
      s.push(db.prepare("DELETE FROM kho_thu_kho WHERE kho_id = ?").bind(a));
      s.push(db.prepare("DELETE FROM kho WHERE id = ?").bind(a));
    } else if (k.khoNguon) {
      s.push(
        db
          .prepare("UPDATE kho SET nhan_vien_id = ?, ten_kho = CASE WHEN ten_kho = 'Kho QL - ' || ? THEN 'Kho QL - ' || ? ELSE ten_kho END, updated_at = ? WHERE id = ?")
          .bind(d, n.ten_nv, k.ketQua.ten_nv, now, k.khoNguon.id),
      );
    }
    // 5. Cap nhat ho so dich: bu cot trong tu nguon, ket qua ten / ETX / email / trang thai / quan ly.
    const qlDich = k.dich ? (k.dich.quan_ly_id === n.ma_nv ? n.quan_ly_id : (k.dich.quan_ly_id ?? n.quan_ly_id)) : n.quan_ly_id;
    s.push(
      db
        .prepare(
          `UPDATE nhan_vien SET
             ten_nv = ?, ma_etx = ?, email_dang_nhap = ?, dang_lam_viec = ?, quan_ly_id = ?,
             bo_phan = COALESCE(bo_phan, ?), chuc_vu = COALESCE(?, chuc_vu, ?), sdt = COALESCE(sdt, ?),
             ghi_chu = COALESCE(ghi_chu, ?), gmail = COALESCE(?, gmail, ?), updated_at = ?
           WHERE ma_nv = ?`,
        )
        .bind(
          k.ketQua.ten_nv,
          k.ketQua.ma_etx,
          k.ketQua.email_dang_nhap,
          k.ketQua.dang_lam_viec,
          qlDich && qlDich !== d ? qlDich : null,
          n.bo_phan,
          k.etx?.chuc_danh ?? null,
          n.chuc_vu,
          n.sdt,
          n.ghi_chu,
          k.etx?.gmail?.trim().toLowerCase() ?? null,
          n.gmail,
          now,
          d,
        ),
    );
    // 6. Xoa ho so nguon.
    s.push(db.prepare("DELETE FROM nhan_vien WHERE ma_nv = ?").bind(n.ma_nv));
  }

  // 7. Nhat ky.
  s.push(
    db
      .prepare(
        "INSERT INTO nhan_vien_lich_su_ma (thao_tac, ma_nguon, ten_nguon, ma_dich, ma_etx, chi_tiet, nguoi_thuc_hien, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        k.thaoTac,
        n.ma_nv,
        n.ten_nv,
        k.maDich,
        k.ketQua.ma_etx,
        JSON.stringify({ chuyen: k.chuyen, gopKho: k.gopKho ? { tu: k.khoNguon, vao: k.khoDich } : null, maEtxCu: n.ma_etx, emailCu: n.email_dang_nhap, canhBao: k.canhBao }),
        nguoi,
        now,
      ),
  );
  s.push(db.prepare("DELETE FROM batch_guard"));
  return s;
}
