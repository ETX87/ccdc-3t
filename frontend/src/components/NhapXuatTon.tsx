import { t } from "../lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { api } from "../api/client";
import { Modal } from "./Modal";
import { ChonLoc, boDau } from "./ChonLoc";
import { SoTon, TienTe } from "./NoiBat";
import { TheKhoModal } from "./TheKho";
import { PhanTrang, useTrangKhach } from "./PhanTrang";
import { fmtGiaTri, fmtNgay, fmtSo, homNayVN } from "../lib/format";
import { thongBaoLoi } from "../lib/nhan";
import { exportRowsToExcel } from "../lib/exportExcel";

// Nhap - xuat - ton tieu hao theo ky (2026-10-14, user: "o moi kho can xem SL nhap, SL xuat, ton; chon theo ngay /
// thang / nam"). So lieu: GET /kho/nhap-xuat-ton (cung quy tac v_ton_kho - ky ket thuc hom nay thi ton cuoi = ton hien tai).

export type KieuKy = "ngay" | "thang" | "nam";
export interface Ky {
  kieu: KieuKy;
  gia_tri: string; // YYYY-MM-DD | YYYY-MM | YYYY
}

export interface DongNxt {
  ton_dau: number;
  nhap: number;
  xuat: number;
  ton_cuoi: number;
  gt_dau: number;
  gt_nhap: number;
  gt_xuat: number;
  gt_cuoi: number;
  so_mat_hang_ps: number;
}
export interface DongNxtKho extends DongNxt {
  kho_id: number;
}
interface DongNxtVt extends DongNxt {
  vt_id: string;
  ten_vt: string;
  don_vi_tinh: string | null;
}

export function kyMacDinh(kieu: KieuKy = "thang"): Ky {
  const h = homNayVN();
  return { kieu, gia_tri: kieu === "ngay" ? h : kieu === "thang" ? h.slice(0, 7) : h.slice(0, 4) };
}

/** Ky -> khoang ngay (den toi da hom nay - ky dang chay tinh toi hien tai). */
export function khoangKyNxt(k: Ky): { tu: string; den: string } {
  const h = homNayVN();
  let tu: string;
  let den: string;
  if (k.kieu === "ngay") {
    tu = den = k.gia_tri || h;
  } else if (k.kieu === "thang") {
    const [y, m] = (k.gia_tri || h.slice(0, 7)).split("-").map(Number);
    tu = `${y}-${String(m).padStart(2, "0")}-01`;
    den = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  } else {
    const y = k.gia_tri || h.slice(0, 4);
    tu = `${y}-01-01`;
    den = `${y}-12-31`;
  }
  return { tu, den: den > h ? h : den };
}

export function nhanKy(k: Ky): string {
  const { tu, den } = khoangKyNxt(k);
  return tu === den ? fmtNgay(tu) : t("{tu} → {den}", { tu: fmtNgay(tu), den: fmtNgay(den) });
}

/** O chon ky: Ngay / Thang / Nam + o nhap tuong ung. */
export function ChonKyNxt({ value, onChange }: { value: Ky; onChange: (k: Ky) => void }) {
  const namNay = Number(homNayVN().slice(0, 4));
  const dsNam = Array.from({ length: namNay - 2023 }, (_, i) => String(namNay - i));
  return (
    <>
      <ChonLoc value={value.kieu} onChange={(e) => onChange(kyMacDinh(e.target.value as KieuKy))} aria-label={t("Xem theo")}>
        <option value="ngay">{t("Theo ngày")}</option>
        <option value="thang">{t("Theo tháng")}</option>
        <option value="nam">{t("Theo năm")}</option>
      </ChonLoc>
      {value.kieu === "ngay" && (
        <input type="date" value={value.gia_tri} max={homNayVN()} onChange={(e) => e.target.value && onChange({ ...value, gia_tri: e.target.value })} aria-label={t("Ngày")} />
      )}
      {value.kieu === "thang" && (
        <input type="month" value={value.gia_tri} max={homNayVN().slice(0, 7)} onChange={(e) => e.target.value && onChange({ ...value, gia_tri: e.target.value })} aria-label={t("Tháng")} />
      )}
      {value.kieu === "nam" && (
        <ChonLoc value={value.gia_tri} onChange={(e) => onChange({ ...value, gia_tri: e.target.value })} aria-label={t("Năm")}>
          {dsNam.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </ChonLoc>
      )}
    </>
  );
}

/** O so luong nhap / xuat: 0 -> xam, con lai mau (nhap xanh +, xuat cam -), kem gia tri. */
export function SoPhatSinh({ so, gt, dau, onClick }: { so: number; gt: number; dau: "+" | "-"; onClick?: () => void }) {
  if (!so) return <span className="muted">0</span>;
  const noiDung = (
    <span className={dau === "+" ? "nb-nhap" : "nb-xuat"}>
      {dau}
      {fmtSo(so, 2)}
    </span>
  );
  return (
    <>
      {onClick ? (
        <button type="button" className="so-link" onClick={onClick} title={t("Xem chi tiết theo mặt hàng")}>
          {noiDung}
        </button>
      ) : (
        noiDung
      )}
      {gt > 0 && <div className="muted small">{fmtGiaTri(gt)}</div>}
    </>
  );
}

/** Popup nhap - xuat - ton tung mat hang cua 1 kho trong ky; bam dong -> the kho. */
export function NxtKhoModal({ kho, ky, onClose }: { kho: { id: number; ten_kho: string }; ky: Ky; onClose: () => void }) {
  const { tu, den } = khoangKyNxt(ky);
  const [rows, setRows] = useState<DongNxtVt[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [tim, setTim] = useState("");
  const [chiPhatSinh, setChiPhatSinh] = useState(false);
  const [theKho, setTheKho] = useState<DongNxtVt | null>(null);

  useEffect(() => {
    api
      .get<{ rows: DongNxtVt[] }>(`/kho/nhap-xuat-ton?tu=${tu}&den=${den}&kho_id=${kho.id}`)
      .then((r) => setRows(r.rows))
      .catch((e) => setLoi(thongBaoLoi(e, t("Không tải được số liệu nhập xuất tồn."))));
  }, [tu, den, kho.id]);

  const loc = useMemo(() => {
    const q = boDau(tim.trim());
    return (rows ?? []).filter((r) => (!q || boDau(r.ten_vt).includes(q) || boDau(r.vt_id).includes(q)) && (!chiPhatSinh || r.nhap || r.xuat));
  }, [rows, tim, chiPhatSinh]);
  const tr = useTrangKhach(loc, [tim, chiPhatSinh]);
  const tong = loc.reduce((a, r) => ({ dau: a.dau + r.gt_dau, nhap: a.nhap + r.gt_nhap, xuat: a.xuat + r.gt_xuat, cuoi: a.cuoi + r.gt_cuoi }), { dau: 0, nhap: 0, xuat: 0, cuoi: 0 });

  function xuatExcel() {
    exportRowsToExcel(
      loc.map((r) => ({
        ma: r.vt_id,
        ten: r.ten_vt,
        dvt: r.don_vi_tinh ?? "",
        ton_dau: r.ton_dau,
        nhap: r.nhap,
        xuat: r.xuat,
        ton_cuoi: r.ton_cuoi,
        gt_cuoi: r.gt_cuoi,
      })),
      `NXT_${kho.ten_kho.replace(/[^\w-]+/g, "_")}_${tu}_${den}.xlsx`,
      "NXT",
      { ma: t("Mã"), ten: t("Mặt hàng"), dvt: t("ĐVT"), ton_dau: t("Tồn đầu kỳ"), nhap: t("Nhập"), xuat: t("Xuất"), ton_cuoi: t("Tồn cuối kỳ"), gt_cuoi: t("Giá trị tồn cuối") },
    );
  }

  return (
    <Modal size="lg" title={t("Nhập xuất tồn: {kho} · {ky}", { kho: kho.ten_kho, ky: nhanKy(ky) })} onClose={onClose}>
      {loi && <div className="alert alert-error">{loi}</div>}
      <div className="filter-bar">
        <div className="topbar-search filter-search">
          <Search size={15} className="search-icon" />
          <input className="search-input" placeholder={t("Tìm mặt hàng...")} value={tim} onChange={(e) => setTim(e.target.value)} />
        </div>
        <label className="check-label">
          <input type="checkbox" checked={chiPhatSinh} onChange={(e) => setChiPhatSinh(e.target.checked)} />
          {t("Chỉ mặt hàng có phát sinh trong kỳ")}
        </label>
        <button type="button" className="btn btn-outline btn-sm" onClick={xuatExcel} disabled={!loc.length}>
          {t("Xuất Excel")}
        </button>
      </div>
      <div className="task-table-wrapper">
        <table className="task-table">
          <thead>
            <tr>
              <th>{t("Mặt hàng")}</th>
              <th style={{ textAlign: "right" }}>{t("Tồn đầu kỳ")}</th>
              <th style={{ textAlign: "right" }}>{t("Nhập")}</th>
              <th style={{ textAlign: "right" }}>{t("Xuất")}</th>
              <th style={{ textAlign: "right" }}>{t("Tồn cuối kỳ")}</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && !loi && (
              <tr>
                <td colSpan={5} className="task-empty">
                  {t("Đang tải…")}
                </td>
              </tr>
            )}
            {rows !== null && loc.length === 0 && (
              <tr>
                <td colSpan={5} className="task-empty">
                  {t("Không có mặt hàng nào trong kỳ.")}
                </td>
              </tr>
            )}
            {tr.dongTrang.map((r) => (
              <tr key={r.vt_id} className={`row-clickable${r.ton_cuoi < 0 ? " row-canh-bao" : ""}`} onClick={() => setTheKho(r)} title={t("Xem thẻ kho")}>
                <td data-label={t("Mặt hàng")}>
                  <div className="strong">{r.ten_vt}</div>
                  <div className="muted small">{r.vt_id}</div>
                </td>
                <td data-label={t("Tồn đầu kỳ")} style={{ textAlign: "right" }}>
                  <SoTon so={r.ton_dau} dvt={r.don_vi_tinh} />
                </td>
                <td data-label={t("Nhập")} style={{ textAlign: "right" }}>
                  <SoPhatSinh so={r.nhap} gt={r.gt_nhap} dau="+" />
                </td>
                <td data-label={t("Xuất")} style={{ textAlign: "right" }}>
                  <SoPhatSinh so={r.xuat} gt={r.gt_xuat} dau="-" />
                </td>
                <td data-label={t("Tồn cuối kỳ")} style={{ textAlign: "right" }}>
                  <SoTon so={r.ton_cuoi} dvt={r.don_vi_tinh} />
                  {r.gt_cuoi > 0 && (
                    <div className="muted small">
                      <TienTe so={r.gt_cuoi} />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {loc.length > 0 && (
            <tfoot>
              <tr className="nb-tong">
                <td>{t("Tổng giá trị ({n} mặt hàng)", { n: loc.length })}</td>
                <td style={{ textAlign: "right" }}>
                  <TienTe so={tong.dau} />
                </td>
                <td style={{ textAlign: "right" }}>
                  <TienTe so={tong.nhap} />
                </td>
                <td style={{ textAlign: "right" }}>
                  <TienTe so={tong.xuat} />
                </td>
                <td style={{ textAlign: "right" }}>
                  <TienTe so={tong.cuoi} />
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <PhanTrang trang={tr.trang} tong={tr.tong} onDoi={tr.setTrang} donVi={t("mặt hàng")} />
      <div className="field-hint">{t("Giá trị tính theo giá tham khảo hiện tại của mặt hàng. Bấm 1 dòng để xem thẻ kho (từng phiếu).")}</div>
      {theKho && (
        <TheKhoModal khoId={kho.id} tenKho={kho.ten_kho} vt={{ id: theKho.vt_id, ten_vt: theKho.ten_vt, don_vi_tinh: theKho.don_vi_tinh }} onClose={() => setTheKho(null)} />
      )}
    </Modal>
  );
}
