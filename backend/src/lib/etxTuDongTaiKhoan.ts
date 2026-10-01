import { nowVN } from "./vnTime";

// Tu dong TAO + DUYET tai khoan dang nhap tu danh ba ETX (user chot 2026-09-30: "đồng bộ danh sách
// tài khoản tự động hàng ngày về từ ETX nhân sự, giống linh-kien-app" - port lib/etxTuDongKtv.ts).
// Chay CUOI moi lan dong bo ETX (cron hang ngay + nut "Đồng bộ ETX"), SAU runEtxNhanSuSync (can
// nhan_vien.gmail / dang_lam_viec moi nhat).
//
// Khac linh-kien-app (chi KTV/CTV): o CCDC moi nhan su deu la nguoi nhan CCDC (vai tro Nhan vien =
// vai_tro NULL) -> ap dung cho MOI nguoi: ho so co ma_etx + dang_lam_viec = 1 + gmail hop le.
//   - users: chua co -> tao 'Da duyet' (vai_tro NULL); dang 'Cho duyet' -> 'Da duyet'. 'Tu choi' /
//     'Da duyet' giu nguyen (khong ghi de quyet dinh cua Admin, khong dung vai tro da gan).
//   - nhan_vien.email_dang_nhap = gmail neu dong do chua lien ket va gmail chua lien ket dong khac
//     -> ETX 'off' ve sau tu khoa tai khoan qua co che lockToggles san co trong etxNhanSuSync.ts.
// BO QUA gmail trung tren >1 ho so dang lam viec (khong biet tai khoan thuoc ai - HCNS xu ly tay).

export interface EtxTuDongTaiKhoanResult {
  tkTuTao: number;
  tkTuDuyet: number;
  lienKet: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CHUNK = 300;

export async function tuDongTaiKhoanTuEtx(db: D1Database): Promise<EtxTuDongTaiKhoanResult> {
  const [{ results: nvs }, { results: users }, { results: daLienKet }] = await Promise.all([
    db
      .prepare(
        `SELECT ma_nv, ten_nv, LOWER(TRIM(gmail)) AS gmail, email_dang_nhap FROM nhan_vien
         WHERE ma_etx IS NOT NULL AND dang_lam_viec = 1 AND gmail IS NOT NULL AND TRIM(gmail) != ''
         ORDER BY ma_nv`,
      )
      .all<{ ma_nv: string; ten_nv: string; gmail: string; email_dang_nhap: string | null }>(),
    db.prepare("SELECT email, trang_thai_duyet FROM users").all<{ email: string; trang_thai_duyet: string }>(),
    db.prepare("SELECT LOWER(email_dang_nhap) AS e FROM nhan_vien WHERE email_dang_nhap IS NOT NULL").all<{ e: string }>(),
  ]);

  const soHoSo = new Map<string, number>();
  for (const r of nvs) soHoSo.set(r.gmail, (soHoSo.get(r.gmail) ?? 0) + 1);
  const trangThai = new Map(users.map((u) => [u.email.trim().toLowerCase(), u.trang_thai_duyet]));
  const emailDaLienKet = new Set(daLienKet.map((r) => r.e));

  const now = nowVN();
  const stmts: D1PreparedStatement[] = [];
  let tkTuTao = 0;
  let tkTuDuyet = 0;
  let lienKet = 0;

  for (const r of nvs) {
    const email = r.gmail;
    if (!EMAIL_RE.test(email) || soHoSo.get(email) !== 1) continue;
    // Ho so da lien ket email khac (HCNS gan tay) / gmail dang lien ket ho so khac -> khong dung cham.
    const lk = r.email_dang_nhap?.trim().toLowerCase() ?? null;
    if (lk ? lk !== email : emailDaLienKet.has(email)) continue;
    const tt = trangThai.get(email);
    if (tt === "Tu choi") continue;

    if (!tt) {
      stmts.push(
        db
          .prepare("INSERT INTO users (email, ten, vai_tro, trang_thai_duyet, created_at, updated_at) VALUES (?, ?, NULL, 'Da duyet', ?, ?) ON CONFLICT(email) DO NOTHING")
          .bind(email, r.ten_nv, now, now),
      );
      tkTuTao++;
    } else if (tt === "Cho duyet") {
      stmts.push(
        db
          .prepare("UPDATE users SET trang_thai_duyet = 'Da duyet', ten = COALESCE(ten, ?), updated_at = ? WHERE email = ? AND trang_thai_duyet = 'Cho duyet'")
          .bind(r.ten_nv, now, email),
      );
      tkTuDuyet++;
    }

    if (!lk) {
      stmts.push(
        db.prepare("UPDATE nhan_vien SET email_dang_nhap = ?, updated_at = ? WHERE ma_nv = ? AND email_dang_nhap IS NULL").bind(email, now, r.ma_nv),
      );
      emailDaLienKet.add(email);
      lienKet++;
    }
  }

  // Thu tu trong mang giu nguyen qua cac chunk -> INSERT users luon chay truoc UPDATE nhan_vien
  // (FK email_dang_nhap -> users).
  for (let i = 0; i < stmts.length; i += CHUNK) await db.batch(stmts.slice(i, i + CHUNK));
  return { tkTuTao, tkTuDuyet, lienKet };
}
