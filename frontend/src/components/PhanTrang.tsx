import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fmtSo } from "../lib/format";

// Phan trang dung chung cho MOI bang (2026-09-30). Co dinh KICH_THUOC_TRANG dong/trang (khop
// backend lib/phanTrang.ts). 2 cach dung:
//   - server: bang lon (phieu tieu hao, tai san, nhan vien) - API tra { rows, total }, man giu `trang`.
//   - trinh duyet: bang nho / da tong hop - useTrangKhach(rows) cat san 1 trang de khong render het.
export const KICH_THUOC_TRANG = 50;

/** Cac so trang can hien: 1 … (hien tai ±1) … cuoi. */
function soTrangHien(trang: number, tong: number): (number | "…")[] {
  const s = new Set([1, tong, trang - 1, trang, trang + 1].filter((x) => x >= 1 && x <= tong));
  const ds = [...s].sort((a, b) => a - b);
  const kq: (number | "…")[] = [];
  ds.forEach((x, i) => {
    if (i > 0 && x - ds[i - 1] > 1) kq.push("…");
    kq.push(x);
  });
  return kq;
}

export function PhanTrang({
  trang,
  tong,
  onDoi,
  donVi = "dòng",
  ghiChu,
  kichThuoc = KICH_THUOC_TRANG,
}: {
  trang: number;
  tong: number;
  onDoi: (trang: number) => void;
  donVi?: string;
  ghiChu?: ReactNode;
  kichThuoc?: number;
}) {
  const soTrang = Math.max(1, Math.ceil(tong / kichThuoc));
  // Dang o trang vuot cuoi (vd sau khi xoa / loc lai o server) -> tu lui ve trang cuoi.
  useEffect(() => {
    if (tong > 0 && trang > soTrang) onDoi(soTrang);
  }, [tong, trang, soTrang, onDoi]);
  if (tong === 0 && !ghiChu) return null;
  const tu = tong === 0 ? 0 : (trang - 1) * kichThuoc + 1;
  const den = Math.min(trang * kichThuoc, tong);
  return (
    <div className="phan-trang">
      <span className="muted small">
        {soTrang > 1 ? `${fmtSo(tu)}–${fmtSo(den)} / ` : ""}
        {fmtSo(tong)} {donVi}
        {ghiChu}
      </span>
      {soTrang > 1 && (
        <div className="phan-trang-nut" role="navigation" aria-label="Phân trang">
          <button type="button" className="phan-trang-btn" disabled={trang <= 1} onClick={() => onDoi(trang - 1)} aria-label="Trang trước">
            <ChevronLeft size={14} />
          </button>
          {soTrangHien(trang, soTrang).map((x, i) =>
            x === "…" ? (
              <span key={`g${i}`} className="phan-trang-gap">
                …
              </span>
            ) : (
              <button key={x} type="button" className={`phan-trang-btn ${x === trang ? "active" : ""}`} onClick={() => onDoi(x)} aria-current={x === trang ? "page" : undefined}>
                {x}
              </button>
            ),
          )}
          <button type="button" className="phan-trang-btn" disabled={trang >= soTrang} onClick={() => onDoi(trang + 1)} aria-label="Trang sau">
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * So trang cho bang phan trang O SERVER: tu ve trang 1 ngay trong lan render doi `khoaLoc` (khong qua
 * useEffect -> khong goi API 2 lan: 1 lan trang cu + 1 lan trang 1).
 */
export function useTrangServer(khoaLoc: unknown) {
  const khoa = JSON.stringify(khoaLoc);
  const [st, setSt] = useState({ khoa, trang: 1 });
  const trang = st.khoa === khoa ? st.trang : 1;
  return { trang, setTrang: (t: number) => setSt({ khoa, trang: t }) };
}

/**
 * Phan trang phia trinh duyet: cat `rows` thanh trang hien tai. Tu ve trang 1 khi `khoaLoc` doi (bo loc /
 * tim kiem) va tu lui ve trang cuoi khi danh sach ngan lai (vd sau khi xoa / tai lai).
 */
export function useTrangKhach<T>(rows: T[] | null | undefined, khoaLoc: unknown = null, kichThuoc = KICH_THUOC_TRANG) {
  const [trang, setTrang] = useState(1);
  const khoa = JSON.stringify(khoaLoc);
  useEffect(() => setTrang(1), [khoa]);
  const tong = rows?.length ?? 0;
  const soTrang = Math.max(1, Math.ceil(tong / kichThuoc));
  const trangThat = Math.min(trang, soTrang);
  const dongTrang = useMemo(() => (rows ?? []).slice((trangThat - 1) * kichThuoc, trangThat * kichThuoc), [rows, trangThat, kichThuoc]);
  return { trang: trangThat, setTrang, tong, dongTrang };
}
