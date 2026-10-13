import { t } from "../lib/i18n";
import { useMemo, useState } from "react";
import { BarChart2, Building2, Clock, Package, Search, Users, Wallet } from "lucide-react";
import { KpiCard } from "./KpiCard";
import { Modal } from "./Modal";
import { PhanTrang, useTrangKhach } from "./PhanTrang";
import { NguoiTag, TienTe } from "./NoiBat";
import { boDau } from "./ChonLoc";
import { exportRowsToExcel } from "../lib/exportExcel";
import { fmtGiaTri, fmtNgay, fmtSo, homNayVN } from "../lib/format";

// Bao cao "Tieu hao cap cho nhan vien" (GET /bao-cao/tieu-hao-nv): vat tu tieu hao da cap thang cho nguoi (phieu
// Cap phat NV - he thong tinh la DA TIEU HAO, khong con ton). 3 goc nhin: phong ban / nhan vien / vat tu, kem tan suat
// (lan nhan / thang), trung binh, khoang cach TB giua 2 lan nhan. So lieu tinh o client tu dong (nguoi x vat tu).

export interface DongTh {
  nguoi_key: string;
  vt_id: string;
  ten_vt: string;
  don_vi_tinh: string | null;
  ten_nhom: string | null;
  so_luong: number;
  so_phieu: number;
  gia_tri: number;
}
export interface NguoiTh {
  nguoi_key: string;
  ma_nv: string | null;
  ten_nv: string;
  bo_phan: string | null;
  chuc_vu: string | null;
  so_phieu: number;
  lan_dau: string;
  lan_cuoi: string;
  chua_xac_nhan: number;
  kho_xuat: string | null;
}
export interface TieuHaoNvRes {
  tu: string;
  den: string;
  dong: DongTh[];
  nguoi: NguoiTh[];
}
export type CheDoTh = "bo-phan" | "nhan-vien" | "vat-tu";

// ---------------------------------------------------------------------------------------------- ky xem
/** "m:YYYY-MM" (1 thang) | "3" / "6" / "12" (N thang gan nhat, tinh ca thang nay) | "nam" (tu dau nam). */
export function khoangKy(ky: string): { tu: string; den: string; soThang: number } {
  const homNay = homNayVN();
  const [y, m] = homNay.slice(0, 7).split("-").map(Number);
  const thang = (yy: number, mm: number) => new Date(Date.UTC(yy, mm - 1, 1)).toISOString().slice(0, 7);
  if (ky.startsWith("m:")) {
    const v = ky.slice(2);
    const [yy, mm] = v.split("-").map(Number);
    const cuoi = String(new Date(Date.UTC(yy, mm, 0)).getUTCDate()).padStart(2, "0");
    return { tu: `${v}-01`, den: `${v}-${cuoi}`, soThang: 1 };
  }
  if (ky === "nam") return { tu: `${y}-01-01`, den: homNay, soThang: m };
  const n = Number(ky) || 3;
  return { tu: `${thang(y, m - n + 1)}-01`, den: homNay, soThang: n };
}

export function luaChonKy(): { value: string; label: string }[] {
  const [y, m] = homNayVN().slice(0, 7).split("-").map(Number);
  return [
    { value: "3", label: t("3 tháng gần nhất") },
    { value: "6", label: t("6 tháng gần nhất") },
    { value: "12", label: t("12 tháng gần nhất") },
    { value: "nam", label: t("Từ đầu năm {x}", { x: y }) },
    ...Array.from({ length: 12 }, (_, i) => {
      const v = new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7);
      return { value: `m:${v}`, label: t("Tháng {x}", { x: `${v.slice(5)}/${v.slice(0, 4)}` }) };
    }),
  ];
}

// ---------------------------------------------------------------------------------------------- tong hop
const NGOAI_DANH_BA = () => t("Ngoài danh bạ (KTV/CTV)");
const CHUA_BO_PHAN = () => t("(Chưa có bộ phận)");
const boPhanCua = (n: NguoiTh) => n.bo_phan?.trim() || (n.ma_nv ? CHUA_BO_PHAN() : NGOAI_DANH_BA());
const ngayGiua = (a: string, b: string) => (Date.parse(b.replace(" ", "T")) - Date.parse(a.replace(" ", "T"))) / 86_400_000;

interface HangNv extends NguoiTh {
  bo_phan_hien: string;
  so_mat_hang: number;
  so_luong: number;
  gia_tri: number;
  tb_lan: number; // gia tri TB moi lan nhan
  tan_suat: number; // lan / thang
  cach_tb: number | null; // so ngay TB giua 2 lan nhan
}
interface HangBp {
  bo_phan: string;
  so_nv: number;
  so_phieu: number;
  so_luong: number;
  gia_tri: number;
  tb_nv: number;
  tan_suat: number; // lan / NV / thang
  top_vt: string;
}
interface HangVt {
  vt_id: string;
  ten_vt: string;
  don_vi_tinh: string | null;
  ten_nhom: string | null;
  so_nguoi: number;
  so_phieu: number;
  so_luong: number;
  tb_nguoi: number;
  gia_tri: number;
  top_bp: string;
}

function tongHop(res: TieuHaoNvRes, soThang: number) {
  const theoNguoi = new Map<string, DongTh[]>();
  for (const d of res.dong) theoNguoi.set(d.nguoi_key, [...(theoNguoi.get(d.nguoi_key) ?? []), d]);
  const nv: HangNv[] = res.nguoi.map((n) => {
    const ds = theoNguoi.get(n.nguoi_key) ?? [];
    const gt = ds.reduce((s, d) => s + Number(d.gia_tri), 0);
    return {
      ...n,
      bo_phan_hien: boPhanCua(n),
      so_mat_hang: ds.length,
      so_luong: ds.reduce((s, d) => s + Number(d.so_luong), 0),
      gia_tri: gt,
      tb_lan: n.so_phieu ? gt / n.so_phieu : 0,
      tan_suat: n.so_phieu / soThang,
      cach_tb: n.so_phieu > 1 ? ngayGiua(n.lan_dau, n.lan_cuoi) / (n.so_phieu - 1) : null,
    };
  });
  nv.sort((a, b) => b.gia_tri - a.gia_tri);

  const bpMap = new Map<string, HangNv[]>();
  for (const n of nv) bpMap.set(n.bo_phan_hien, [...(bpMap.get(n.bo_phan_hien) ?? []), n]);
  const bp: HangBp[] = [...bpMap.entries()].map(([ten, ds]) => {
    const keys = new Set(ds.map((x) => x.nguoi_key));
    const vtGt = new Map<string, number>();
    for (const d of res.dong) if (keys.has(d.nguoi_key)) vtGt.set(d.ten_vt, (vtGt.get(d.ten_vt) ?? 0) + Number(d.gia_tri));
    const gt = ds.reduce((s, x) => s + x.gia_tri, 0);
    const soPhieu = ds.reduce((s, x) => s + x.so_phieu, 0);
    return {
      bo_phan: ten,
      so_nv: ds.length,
      so_phieu: soPhieu,
      so_luong: ds.reduce((s, x) => s + x.so_luong, 0),
      gia_tri: gt,
      tb_nv: gt / ds.length,
      tan_suat: soPhieu / ds.length / soThang,
      top_vt: [...vtGt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-",
    };
  });
  bp.sort((a, b) => b.gia_tri - a.gia_tri);

  const bpCuaNguoi = new Map(nv.map((n) => [n.nguoi_key, n.bo_phan_hien]));
  const vtMap = new Map<string, DongTh[]>();
  for (const d of res.dong) vtMap.set(d.vt_id, [...(vtMap.get(d.vt_id) ?? []), d]);
  const vt: HangVt[] = [...vtMap.values()].map((ds) => {
    const bpGt = new Map<string, number>();
    for (const d of ds) {
      const b = bpCuaNguoi.get(d.nguoi_key) ?? "-";
      bpGt.set(b, (bpGt.get(b) ?? 0) + Number(d.so_luong));
    }
    const sl = ds.reduce((s, d) => s + Number(d.so_luong), 0);
    return {
      vt_id: ds[0].vt_id,
      ten_vt: ds[0].ten_vt,
      don_vi_tinh: ds[0].don_vi_tinh,
      ten_nhom: ds[0].ten_nhom,
      so_nguoi: ds.length,
      so_phieu: ds.reduce((s, d) => s + Number(d.so_phieu), 0),
      so_luong: sl,
      tb_nguoi: sl / ds.length,
      gia_tri: ds.reduce((s, d) => s + Number(d.gia_tri), 0),
      top_bp: [...bpGt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-",
    };
  });
  vt.sort((a, b) => b.gia_tri - a.gia_tri);
  return { nv, bp, vt };
}

const tanSuat = (x: number) => t("{x} lần/tháng", { x: fmtSo(x, 1) });

// ---------------------------------------------------------------------------------------------- xuat Excel
export async function xuatExcelTieuHaoNv(res: TieuHaoNvRes, cheDo: CheDoTh, soThang: number) {
  const { nv, bp, vt } = tongHop(res, soThang);
  const ky = `${res.tu}_${res.den}`;
  if (cheDo === "bo-phan")
    return exportRowsToExcel(
      bp.map((r) => ({ ...r, tan_suat: Math.round(r.tan_suat * 100) / 100, tb_nv: Math.round(r.tb_nv) })),
      `Tieu_hao_theo_phong_ban_${ky}.xlsx`,
      "Theo phong ban",
      { bo_phan: t("Phòng ban"), so_nv: t("Số NV nhận"), so_phieu: t("Số lần cấp"), so_luong: t("Tổng số lượng"), gia_tri: t("Giá trị (đ)"), tb_nv: t("TB / nhân viên (đ)"), tan_suat: t("Lần / NV / tháng"), top_vt: t("Vật tư dùng nhiều nhất") },
    );
  if (cheDo === "vat-tu")
    return exportRowsToExcel(
      vt.map((r) => ({ ...r, tb_nguoi: Math.round(r.tb_nguoi * 100) / 100 })),
      `Tieu_hao_theo_vat_tu_${ky}.xlsx`,
      "Theo vat tu",
      { vt_id: t("Mã vật tư"), ten_vt: t("Tên vật tư"), ten_nhom: t("Nhóm"), don_vi_tinh: t("ĐVT"), so_nguoi: t("Số người nhận"), so_phieu: t("Số lần cấp"), so_luong: t("Tổng số lượng"), tb_nguoi: t("TB / người"), gia_tri: t("Giá trị (đ)"), top_bp: t("Phòng ban nhận nhiều nhất") },
    );
  return exportRowsToExcel(
    nv.map((r) => ({
      ma_nv: r.ma_nv ?? "",
      ten_nv: r.ten_nv,
      bo_phan: r.bo_phan_hien,
      chuc_vu: r.chuc_vu ?? "",
      so_phieu: r.so_phieu,
      so_mat_hang: r.so_mat_hang,
      so_luong: r.so_luong,
      gia_tri: r.gia_tri,
      tb_lan: Math.round(r.tb_lan),
      tan_suat: Math.round(r.tan_suat * 100) / 100,
      cach_tb: r.cach_tb == null ? "" : Math.round(r.cach_tb),
      lan_cuoi: r.lan_cuoi,
      chua_xac_nhan: r.chua_xac_nhan,
      kho_xuat: r.kho_xuat ?? "",
    })),
    `Tieu_hao_theo_nhan_vien_${ky}.xlsx`,
    "Theo nhan vien",
    {
      ma_nv: t("Mã NV"),
      ten_nv: t("Họ tên"),
      bo_phan: t("Phòng ban"),
      chuc_vu: t("Chức vụ"),
      so_phieu: t("Số lần nhận"),
      so_mat_hang: t("Số mặt hàng"),
      so_luong: t("Tổng số lượng"),
      gia_tri: t("Giá trị (đ)"),
      tb_lan: t("TB mỗi lần (đ)"),
      tan_suat: t("Lần / tháng"),
      cach_tb: t("Cách TB giữa 2 lần (ngày)"),
      lan_cuoi: t("Lần nhận gần nhất"),
      chua_xac_nhan: t("Phiếu chưa xác nhận"),
      kho_xuat: t("Kho xuất"),
    },
  );
}

// ---------------------------------------------------------------------------------------------- giao dien
export function BaoCaoTieuHaoNv({ res, soThang, cheDo, onCheDo }: { res: TieuHaoNvRes; soThang: number; cheDo: CheDoTh; onCheDo: (c: CheDoTh) => void }) {
  const { nv, bp, vt } = useMemo(() => tongHop(res, soThang), [res, soThang]);
  const [tim, setTim] = useState("");
  const [chiTiet, setChiTiet] = useState<HangNv | null>(null);
  const [locBp, setLocBp] = useState<string | null>(null);
  const q = boDau(tim.trim());
  const co = (...xs: (string | null | undefined)[]) => !q || xs.some((x) => x && boDau(x).includes(q));

  const dsNv = useMemo(() => nv.filter((r) => (!locBp || r.bo_phan_hien === locBp) && co(r.ten_nv, r.ma_nv, r.bo_phan_hien, r.chuc_vu)), [nv, locBp, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const dsBp = useMemo(() => bp.filter((r) => co(r.bo_phan, r.top_vt)), [bp, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const dsVt = useMemo(() => vt.filter((r) => co(r.ten_vt, r.vt_id, r.ten_nhom)), [vt, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const tNv = useTrangKhach(dsNv, [q, locBp]);
  const tBp = useTrangKhach(dsBp, [q]);
  const tVt = useTrangKhach(dsVt, [q]);

  const tongGt = nv.reduce((s, r) => s + r.gia_tri, 0);
  const tongLan = nv.reduce((s, r) => s + r.so_phieu, 0);
  const chuaXn = nv.reduce((s, r) => s + Number(r.chua_xac_nhan), 0);
  const maxGtNv = Math.max(1, ...nv.map((r) => r.gia_tri));
  const maxGtBp = Math.max(1, ...bp.map((r) => r.gia_tri));
  // Nhan nhieu bat thuong: gia tri > 3 lan trung binh moi nguoi (de soat nhanh).
  const tbNguoi = nv.length ? tongGt / nv.length : 0;
  const batThuong = (gt: number) => nv.length >= 5 && gt > tbNguoi * 3;

  return (
    <>
      <div className="kpi-grid kpi-grid-4">
        <KpiCard
          tone="purple"
          icon={<Wallet size={20} className="text-white" />}
          watermark={<Wallet size={52} />}
          label={t("Giá trị đã cấp cho nhân viên")}
          value={fmtGiaTri(tongGt)}
          trend={<div className="kpi-trend"><span className="trend-sub">{t("TB {x} / tháng", { x: fmtGiaTri(tongGt / soThang) })}</span></div>}
        />
        <KpiCard
          tone="cyan"
          icon={<Users size={20} className="text-white" />}
          watermark={<Users size={52} />}
          label={t("Nhân viên đã nhận")}
          value={fmtSo(nv.length)}
          trend={<div className="kpi-trend"><span className="trend-sub">{t("{x} phòng ban · {y} lần cấp", { x: bp.length, y: fmtSo(tongLan) })}</span></div>}
          onClick={() => onCheDo("nhan-vien")}
        />
        <KpiCard
          tone="blue-light"
          icon={<BarChart2 size={20} className="text-white" />}
          watermark={<BarChart2 size={52} />}
          label={t("Trung bình mỗi nhân viên")}
          value={fmtGiaTri(tbNguoi)}
          trend={<div className="kpi-trend"><span className="trend-sub">{tanSuat(nv.length ? tongLan / nv.length / soThang : 0)}</span></div>}
          onClick={() => onCheDo("bo-phan")}
        />
        <KpiCard
          tone={chuaXn ? "yellow" : "cyan"}
          icon={<Clock size={20} className="text-white" />}
          watermark={<Clock size={52} />}
          label={t("Phiếu NV chưa xác nhận nhận")}
          value={fmtSo(chuaXn)}
          trend={<div className="kpi-trend"><span className="trend-sub">{t("{x} mặt hàng khác nhau", { x: vt.length })}</span></div>}
        />
      </div>

      <div className="content-card task-card-full">
        <div className="card-header">
          <div className="card-title-wrap">
            <Package size={17} className="card-title-icon text-teal" />
            <h2 className="card-title">{t("Tiêu hao cấp cho nhân viên · {tu} – {den}", { tu: fmtNgay(res.tu), den: fmtNgay(res.den) })}</h2>
          </div>
          <div className="topbar-search filter-search">
            <Search size={15} className="search-icon" />
            <input className="search-input" placeholder={t("Tìm nhân viên, phòng ban, vật tư...")} value={tim} onChange={(e) => setTim(e.target.value)} />
          </div>
          <div className="task-filter-tabs">
            {(
              [
                ["bo-phan", t("Theo phòng ban")],
                ["nhan-vien", t("Theo nhân viên")],
                ["vat-tu", t("Theo vật tư")],
              ] as [CheDoTh, string][]
            ).map(([k, nhan]) => (
              <button key={k} type="button" className={`task-tab-btn${cheDo === k ? " active" : ""}`} onClick={() => onCheDo(k)}>
                {nhan}
              </button>
            ))}
          </div>
        </div>
        <p className="muted small" style={{ margin: "0 0 10px" }}>
          {t("Hàng cấp thẳng cho người (phiếu Cấp phát NV) - hệ thống tính là ĐÃ TIÊU HAO, không còn tồn. Tần suất = số lần nhận / số tháng của kỳ ({x} tháng).", { x: soThang })}
        </p>

        {cheDo === "bo-phan" && (
          <>
            <div className="task-table-wrapper">
              <table className="task-table">
                <thead>
                  <tr>
                    <th>{t("Phòng ban")}</th>
                    <th style={{ textAlign: "right" }}>{t("NV nhận")}</th>
                    <th style={{ textAlign: "right" }}>{t("Lần cấp")}</th>
                    <th style={{ textAlign: "right" }}>{t("Số lượng")}</th>
                    <th style={{ width: "22%" }}>{t("Giá trị")}</th>
                    <th style={{ textAlign: "right" }}>{t("TB / nhân viên")}</th>
                    <th style={{ textAlign: "right" }}>{t("Tần suất / NV")}</th>
                    <th>{t("Dùng nhiều nhất")}</th>
                  </tr>
                </thead>
                <tbody>
                  {dsBp.length === 0 && (
                    <tr>
                      <td colSpan={8} className="task-empty">
                        {t("Chưa có cấp phát cho nhân viên trong kỳ.")}
                      </td>
                    </tr>
                  )}
                  {tBp.dongTrang.map((r) => (
                    <tr
                      key={r.bo_phan}
                      className="row-clickable"
                      title={t("Xem nhân viên của phòng ban")}
                      onClick={() => {
                        setLocBp(r.bo_phan);
                        onCheDo("nhan-vien");
                      }}
                    >
                      <td data-label={t("Phòng ban")}>
                        <span className="nb-tag">
                          <span className="nb-tag-icon nb-cyan">
                            <Building2 size={11} strokeWidth={2.4} />
                          </span>
                          <span className="strong">{r.bo_phan}</span>
                        </span>
                      </td>
                      <td data-label={t("NV nhận")} style={{ textAlign: "right" }}>
                        <span className="so-link">{fmtSo(r.so_nv)}</span>
                      </td>
                      <td data-label={t("Lần cấp")} style={{ textAlign: "right" }}>
                        {fmtSo(r.so_phieu)}
                      </td>
                      <td data-label={t("Số lượng")} style={{ textAlign: "right" }}>
                        {fmtSo(r.so_luong, 2)}
                      </td>
                      <td data-label={t("Giá trị")}>
                        <ThanhGiaTri gt={r.gia_tri} max={maxGtBp} />
                      </td>
                      <td data-label={t("TB / nhân viên")} style={{ textAlign: "right" }}>
                        <TienTe so={Math.round(r.tb_nv)} />
                      </td>
                      <td data-label={t("Tần suất / NV")} style={{ textAlign: "right" }}>
                        {tanSuat(r.tan_suat)}
                      </td>
                      <td data-label={t("Dùng nhiều nhất")} className="text-secondary">
                        {r.top_vt}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PhanTrang trang={tBp.trang} tong={tBp.tong} onDoi={tBp.setTrang} donVi={t("phòng ban")} />
          </>
        )}

        {cheDo === "nhan-vien" && (
          <>
            {locBp && (
              <div className="filter-bar">
                <span className="chip">
                  {t("Phòng ban: {x}", { x: locBp })}
                  <button type="button" className="chip-remove" onClick={() => setLocBp(null)} title={t("Bỏ lọc")}>
                    ×
                  </button>
                </span>
              </div>
            )}
            <div className="task-table-wrapper">
              <table className="task-table">
                <thead>
                  <tr>
                    <th>{t("Nhân viên")}</th>
                    <th>{t("Phòng ban")}</th>
                    <th style={{ textAlign: "right" }}>{t("Lần nhận")}</th>
                    <th style={{ textAlign: "right" }}>{t("Mặt hàng")}</th>
                    <th style={{ width: "18%" }}>{t("Giá trị")}</th>
                    <th style={{ textAlign: "right" }}>{t("TB mỗi lần")}</th>
                    <th style={{ textAlign: "right" }}>{t("Tần suất")}</th>
                    <th>{t("Lần gần nhất")}</th>
                  </tr>
                </thead>
                <tbody>
                  {dsNv.length === 0 && (
                    <tr>
                      <td colSpan={8} className="task-empty">
                        {t("Không có nhân viên khớp bộ lọc.")}
                      </td>
                    </tr>
                  )}
                  {tNv.dongTrang.map((r) => (
                    <tr key={r.nguoi_key} className={`row-clickable${batThuong(r.gia_tri) ? " row-chu-y" : ""}`} title={t("Xem chi tiết vật tư đã nhận")} onClick={() => setChiTiet(r)}>
                      <td data-label={t("Nhân viên")}>
                        <NguoiTag ten={r.ten_nv} />
                        <div className="muted small">
                          {r.ma_nv ?? t("Ngoài danh bạ")}
                          {r.chuc_vu ? ` · ${r.chuc_vu}` : ""}
                        </div>
                      </td>
                      <td data-label={t("Phòng ban")} className="text-secondary">
                        {r.bo_phan_hien}
                      </td>
                      <td data-label={t("Lần nhận")} style={{ textAlign: "right" }}>
                        <span className="strong">{fmtSo(r.so_phieu)}</span>
                        {r.chua_xac_nhan > 0 && (
                          <div>
                            <span className="nb-tuoi nb-amber">{t("{x} chưa xác nhận", { x: r.chua_xac_nhan })}</span>
                          </div>
                        )}
                      </td>
                      <td data-label={t("Mặt hàng")} style={{ textAlign: "right" }}>
                        <span className="so-link">{fmtSo(r.so_mat_hang)}</span>
                      </td>
                      <td data-label={t("Giá trị")}>
                        <ThanhGiaTri gt={r.gia_tri} max={maxGtNv} canhBao={batThuong(r.gia_tri)} />
                      </td>
                      <td data-label={t("TB mỗi lần")} style={{ textAlign: "right" }}>
                        <TienTe so={Math.round(r.tb_lan)} />
                      </td>
                      <td data-label={t("Tần suất")} style={{ textAlign: "right" }}>
                        <div className="strong">{tanSuat(r.tan_suat)}</div>
                        {r.cach_tb != null && <div className="muted small">{t("~{x} ngày/lần", { x: fmtSo(r.cach_tb, 0) })}</div>}
                      </td>
                      <td data-label={t("Lần gần nhất")} className="text-secondary">
                        {fmtNgay(r.lan_cuoi)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PhanTrang trang={tNv.trang} tong={tNv.tong} onDoi={tNv.setTrang} donVi={t("nhân viên")} />
            {nv.length >= 5 && <p className="muted small">{t("Dòng viền vàng: giá trị nhận cao hơn 3 lần mức trung bình mỗi người ({x}) - nên soát lại.", { x: fmtGiaTri(tbNguoi) })}</p>}
          </>
        )}

        {cheDo === "vat-tu" && (
          <>
            <div className="task-table-wrapper">
              <table className="task-table">
                <thead>
                  <tr>
                    <th>{t("Vật tư")}</th>
                    <th>{t("Nhóm")}</th>
                    <th style={{ textAlign: "right" }}>{t("Người nhận")}</th>
                    <th style={{ textAlign: "right" }}>{t("Lần cấp")}</th>
                    <th style={{ textAlign: "right" }}>{t("Tổng số lượng")}</th>
                    <th style={{ textAlign: "right" }}>{t("TB / người")}</th>
                    <th style={{ textAlign: "right" }}>{t("Giá trị")}</th>
                    <th>{t("Phòng ban nhận nhiều nhất")}</th>
                  </tr>
                </thead>
                <tbody>
                  {dsVt.length === 0 && (
                    <tr>
                      <td colSpan={8} className="task-empty">
                        {t("Không có vật tư khớp bộ lọc.")}
                      </td>
                    </tr>
                  )}
                  {tVt.dongTrang.map((r) => (
                    <tr key={r.vt_id}>
                      <td data-label={t("Vật tư")}>
                        <div className="strong">{r.ten_vt}</div>
                        <div className="muted small">{r.vt_id}</div>
                      </td>
                      <td data-label={t("Nhóm")} className="text-secondary">
                        {r.ten_nhom ?? "-"}
                      </td>
                      <td data-label={t("Người nhận")} style={{ textAlign: "right" }}>
                        {fmtSo(r.so_nguoi)}
                      </td>
                      <td data-label={t("Lần cấp")} style={{ textAlign: "right" }}>
                        {fmtSo(r.so_phieu)}
                      </td>
                      <td data-label={t("Tổng số lượng")} style={{ textAlign: "right" }}>
                        <span className="nb-so">
                          {fmtSo(r.so_luong, 2)}
                          {r.don_vi_tinh && <span className="nb-dvt">{r.don_vi_tinh}</span>}
                        </span>
                      </td>
                      <td data-label={t("TB / người")} style={{ textAlign: "right" }}>
                        {fmtSo(r.tb_nguoi, 1)}
                      </td>
                      <td data-label={t("Giá trị")} style={{ textAlign: "right" }}>
                        <TienTe so={r.gia_tri} />
                      </td>
                      <td data-label={t("Phòng ban nhận nhiều nhất")} className="text-secondary">
                        {r.top_bp}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PhanTrang trang={tVt.trang} tong={tVt.tong} onDoi={tVt.setTrang} donVi={t("vật tư")} />
          </>
        )}
      </div>

      {chiTiet && (
        <Modal size="lg" title={t("Vật tư đã nhận · {x}", { x: chiTiet.ten_nv })} onClose={() => setChiTiet(null)}>
          <div className="info-grid">
            <div className="info-item">
              <div className="info-label">{t("Phòng ban")}</div>
              <div className="info-value">{chiTiet.bo_phan_hien}</div>
            </div>
            <div className="info-item">
              <div className="info-label">{t("Số lần nhận")}</div>
              <div className="info-value">
                {fmtSo(chiTiet.so_phieu)} · {tanSuat(chiTiet.tan_suat)}
              </div>
            </div>
            <div className="info-item">
              <div className="info-label">{t("Tổng giá trị")}</div>
              <div className="info-value strong">{fmtGiaTri(chiTiet.gia_tri)}</div>
            </div>
            <div className="info-item">
              <div className="info-label">{t("Lần đầu / gần nhất")}</div>
              <div className="info-value">
                {fmtNgay(chiTiet.lan_dau)} – {fmtNgay(chiTiet.lan_cuoi)}
              </div>
            </div>
            <div className="info-item">
              <div className="info-label">{t("Kho xuất")}</div>
              <div className="info-value">{chiTiet.kho_xuat ?? "-"}</div>
            </div>
          </div>
          <div className="table-scroll" style={{ marginTop: 12 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("Vật tư")}</th>
                  <th className="num">{t("Số lượng")}</th>
                  <th className="num">{t("Số lần")}</th>
                  <th className="num">{t("Giá trị")}</th>
                </tr>
              </thead>
              <tbody>
                {res.dong
                  .filter((d) => d.nguoi_key === chiTiet.nguoi_key)
                  .sort((a, b) => Number(b.gia_tri) - Number(a.gia_tri))
                  .map((d) => (
                    <tr key={d.vt_id}>
                      <td>
                        <div className="strong">{d.ten_vt}</div>
                        <div className="muted small">
                          {d.vt_id}
                          {d.ten_nhom ? ` · ${d.ten_nhom}` : ""}
                        </div>
                      </td>
                      <td className="num">
                        {fmtSo(Number(d.so_luong), 2)} {d.don_vi_tinh ?? ""}
                      </td>
                      <td className="num">{fmtSo(d.so_phieu)}</td>
                      <td className="num strong">{fmtSo(Number(d.gia_tri))}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </>
  );
}

/** Gia tri + thanh ngang ty le so voi dong lon nhat (nhin la thay ai / phong nao dung nhieu). */
function ThanhGiaTri({ gt, max, canhBao }: { gt: number; max: number; canhBao?: boolean }) {
  return (
    <div className="nb-thanh">
      <span className={`nb-tien${canhBao ? " text-orange" : ""}`}>{fmtSo(Math.round(gt))}</span>
      <span className="nb-thanh-nen">
        <span className={canhBao ? "nb-thanh-canh-bao" : undefined} style={{ width: `${Math.max(2, (gt / max) * 100)}%` }} />
      </span>
    </div>
  );
}
