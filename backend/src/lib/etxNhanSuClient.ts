import type { Env } from "../types";

// Client API "ETX nhan su" - port nguyen tu linh-kien-app/backend/src/lib/etxNhanSuClient.ts. Domain
// la Google Cloud Function (khong phai Worker cung tai khoan Cloudflare) nen fetch() thang la du
// (khong dinh loi 1042). Key cap theo TUNG doi tac, co tran so lan goi/ngay - sync 1 lan/ngay (~1 request/lan, <1000 nhan su).
export interface EtxNhanSuItem {
  maNhanSu: string;
  hoTen: string;
  chucDanh: string | null;
  maChucDanh: string[];
  gmail: string | null;
  trangThaiLamViec: "on" | "off";
  taiKhoanLada: { maLada: string; tenLada: string } | null;
  quanLyTrucTiep: { maNhanSu: string; hoTen: string; gmail: string; chucDanhCuaToi: string }[];
}

interface EtxHrApiResponse {
  soTrang: number;
  nhanSu: EtxNhanSuItem[];
}

const PAGE_SIZE = 1000;

// trangThai=all de bat ca nhan su da OFF (phat hien chuyen ON->OFF giua 2 lan dong bo). Gom het cac
// trang TRUOC khi tra ve - 1 trang loi thi throw ngay, khong ghi DB do dang.
export async function fetchEtxNhanSuAll(env: Env): Promise<EtxNhanSuItem[]> {
  if (!env.ETX_HR_API_KEY) throw new Error("Chua cau hinh ETX_HR_API_KEY (wrangler secret put ETX_HR_API_KEY)");
  const base = env.ETX_HR_BASE_URL.replace(/\/$/, "");
  const items: EtxNhanSuItem[] = [];
  let trang = 1;
  let soTrang = 1;

  do {
    const res = await fetch(`${base}/hrApi?trangThai=all&co=${PAGE_SIZE}&trang=${trang}`, {
      headers: { Authorization: `Bearer ${env.ETX_HR_API_KEY}` },
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ETX HR API tra loi ${res.status} (trang ${trang}): ${text.slice(0, 200)}`);
    }
    const body = await res.json<EtxHrApiResponse>();
    items.push(...body.nhanSu);
    soTrang = body.soTrang;
    trang++;
  } while (trang <= soTrang);

  return items;
}
