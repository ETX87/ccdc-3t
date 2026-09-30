import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Archive, BarChart2, Building2, ChevronDown, ClipboardList, Download, Package, Search, ShieldCheck, Trash2, Users } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { KhoFilter } from "../components/KhoFilter";
import { FilterTabs } from "../components/FilterTabs";
import { StatusBadge } from "../components/StatusBadge";
import { useChiTiet } from "../components/ChiTiet";
import { exportRowsToExcel } from "../lib/exportExcel";
import { fmtGiaTri, fmtGiaTriDong, fmtNgay, fmtNgayGio, fmtSo, homNayVN } from "../lib/format";
import { useNav } from "../lib/navigation";
import { useKhiThayDoi } from "../lib/suKien";
import { thongBaoLoi, TINH_TRANG_KIEM_KE, TRANG_THAI_TS } from "../lib/nhan";
import { PhanTrang, useTrangKhach } from "../components/PhanTrang";

type SubTab = "tong-quan" | "theo-nhan-vien" | "theo-bo-phan" | "sap-het-bao-hanh" | "kiem-ke-chenh-lech" | "da-thanh-ly";
const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "tong-quan", label: "Tổng hợp" },
  { key: "theo-nhan-vien", label: "Theo nhân viên" },
  { key: "theo-bo-phan", label: "Theo bộ phận" },
  { key: "sap-het-bao-hanh", label: "Sắp hết bảo hành" },
  { key: "kiem-ke-chenh-lech", label: "Chênh lệch kiểm kê" },
  { key: "da-thanh-ly", label: "Đã thanh lý / tiêu hủy" },
];

interface TongQuan {
  theo_trang_thai: { trang_thai: string; so_luong: number; gia_tri: number }[];
  tieu_hao: { so_mat_hang: number; gia_tri: number; so_ton_am: number };
  chuyen_kho_cho_kt: number;
  phieu_dang_chuyen: number;
  xu_ly_ts_cho_kt: number;
  dot_kiem_ke_dang_thuc_hien: number;
  cap_nhat_luc: string;
}
interface TheoKhoRow {
  id: number;
  ten_kho: string;
  loai: string;
  so_luong: number;
  gia_tri: number;
  so_hong: number;
}
interface TheoNhanVienRow {
  ma_nv: string;
  ten_nv: string;
  bo_phan: string | null;
  chuc_vu: string | null;
  dang_lam_viec: number;
  so_luong_ccdc: number;
  gia_tri: number;
  so_hong: number;
}
interface TheoBoPhanRow {
  bo_phan: string;
  so_nhan_vien: number;
  so_luong_ccdc: number;
  gia_tri: number;
}
interface BaoHanhRow {
  id: string;
  ten_ccdc: string;
  han_bao_hanh: string;
  trang_thai_hien_tai: string;
  nha_cung_cap: string | null;
  nguyen_gia: number | null;
  nguoi_dang_giu_ten: string | null;
  ten_kho: string | null;
  con_lai: number;
}
interface BaoHanhRes {
  rows: BaoHanhRow[];
  so_ngay: number;
  thong_ke: { tong: number; co_han: number; da_het: number };
}
interface ChenhLechRow {
  id: number;
  dot_kiem_ke_id: string;
  ten_dot: string;
  ma_dot: string | null;
  ccdc_id: string;
  ten_ccdc: string;
  nguyen_gia: number | null;
  tinh_trang_thuc_te: string;
  he_thong_nguoi_giu_ten: string | null;
  he_thong_kho: string | null;
  nguoi_dang_giu_thuc_te_ten: string | null;
  ghi_chu: string | null;
  kiem_ke_luc: string;
}
interface DaThanhLyRow {
  id: string;
  ma_phieu: string | null;
  loai: string;
  ly_do: string | null;
  ngay_de_xuat: string;
  nguoi_de_xuat: string;
  nguoi_de_xuat_ten: string | null;
  gia_tri_thu_hoi: number | null;
  so_luong_ccdc: number;
  nguyen_gia: number;
  tom_tat: string | null;
}
interface DotOpt {
  id: string;
  ma_phieu: string | null;
  ten_dot: string;
}

type DuLieu =
  | { tab: "tong-quan"; tq: TongQuan; kho: TheoKhoRow[] }
  | { tab: "theo-nhan-vien"; rows: TheoNhanVienRow[] }
  | { tab: "theo-bo-phan"; rows: TheoBoPhanRow[] }
  | { tab: "sap-het-bao-hanh"; res: BaoHanhRes }
  | { tab: "kiem-ke-chenh-lech"; rows: ChenhLechRow[] }
  | { tab: "da-thanh-ly"; rows: DaThanhLyRow[] };

const nowVNStr = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace("T", " ");
const coChua = (q: string, ...xs: (string | null | undefined)[]) => {
  const t = q.trim().toLowerCase();
  return !t || xs.some((x) => (x ?? "").toLowerCase().includes(t));
};

function TyLe({ phan, tong }: { phan: number; tong: number }) {
  const pct = tong > 0 ? (phan / tong) * 100 : 0;
  return (
    <div className="ty-le">
      <div className="ty-le-bar">
        <span style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="ty-le-so">{fmtSo(pct, 1)}%</span>
    </div>
  );
}

function Rong({ cot, children }: { cot: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={cot} className="task-empty">
        {children}
      </td>
    </tr>
  );
}

// Bao cao: 6 bao cao, moi bao cao = KPI that + bang (loc / tim / xuat Excel / bam dong de di tiep).
// Pham vi du lieu do server quyet (quan tri: toan he thong; QL / thu kho: kho + nhom minh).
export function BaoCaoScreen() {
  const { params, navigate } = useNav();
  const { moTaiSan, moPhieu } = useChiTiet();
  const [tab, setTab] = useState<SubTab>(SUB_TABS.some((t) => t.key === params.tab) ? (params.tab as SubTab) : "tong-quan");
  const [khoId, setKhoId] = useState(params.kho_id ?? "");
  const [tim, setTim] = useState(params.q ?? "");
  const [soNgay, setSoNgay] = useState("30");
  const [nam, setNam] = useState("");
  const [dotId, setDotId] = useState("");
  const [chiNghi, setChiNghi] = useState(false); // theo-nhan-vien: chi NV da nghi con giu TS
  const [dots, setDots] = useState<DotOpt[]>([]);
  const [data, setData] = useState<DuLieu | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const [capNhatLuc, setCapNhatLuc] = useState<string | null>(null);
  const [loi, setLoi] = useState<string | null>(null);

  const load = useCallback(async () => {
    setDangTai(true);
    setLoi(null);
    const p = new URLSearchParams();
    if (khoId) p.set("kho_id", khoId);
    try {
      let d: DuLieu;
      if (tab === "tong-quan") {
        const [tq, kho] = await Promise.all([api.get<TongQuan>(`/bao-cao/tong-quan?${p}`), api.get<{ rows: TheoKhoRow[] }>(`/bao-cao/ts-theo-kho?${p}`)]);
        d = { tab, tq, kho: kho.rows };
      } else if (tab === "sap-het-bao-hanh") {
        p.set("ngay", soNgay);
        d = { tab, res: await api.get<BaoHanhRes>(`/bao-cao/sap-het-bao-hanh?${p}`) };
      } else {
        if (tab === "kiem-ke-chenh-lech" && dotId) p.set("dot_id", dotId);
        if (tab === "da-thanh-ly" && nam) p.set("nam", nam);
        const r = await api.get<{ rows: never[] }>(`/bao-cao/${tab}?${p}`);
        d = { tab, rows: r.rows } as DuLieu;
      }
      setData(d);
      setCapNhatLuc(nowVNStr());
    } catch (e) {
      setLoi(thongBaoLoi(e, "Không tải được báo cáo."));
      setData(null);
    } finally {
      setDangTai(false);
    }
  }, [tab, khoId, soNgay, nam, dotId]);

  useEffect(() => {
    load();
  }, [load]);
  useKhiThayDoi(load);

  useEffect(() => {
    if (tab !== "kiem-ke-chenh-lech" || dots.length) return;
    api
      .get<{ rows: DotOpt[] }>("/dot-kiem-ke")
      .then((r) => setDots(r.rows))
      .catch(() => undefined);
  }, [tab, dots.length]);

  function doiTab(t: SubTab) {
    setTab(t);
    setTim("");
    setChiNghi(false);
    setData(null);
  }

  const namHienTai = Number(homNayVN().slice(0, 4));
  const d = data && data.tab === tab ? data : null;

  // ---------------------------------------------------------------- Xuat Excel theo bao cao dang xem
  async function xuatExcel() {
    if (!d) return;
    const ngay = homNayVN();
    if (d.tab === "tong-quan") {
      await exportRowsToExcel(
        [
          ...d.tq.theo_trang_thai.map((r) => ({ nhom: "Theo trạng thái", ten: TRANG_THAI_TS[r.trang_thai]?.label ?? r.trang_thai, so_luong: r.so_luong, gia_tri: r.gia_tri })),
          ...d.kho.map((r) => ({ nhom: "Theo kho", ten: r.ten_kho, so_luong: r.so_luong, gia_tri: r.gia_tri })),
          { nhom: "Tiêu hao", ten: "Tồn kho tiêu hao (theo đơn giá tham khảo)", so_luong: d.tq.tieu_hao.so_mat_hang, gia_tri: d.tq.tieu_hao.gia_tri },
        ],
        `Bao_cao_tong_hop_${ngay}.xlsx`,
        "Tong hop",
        { nhom: "Nhóm", ten: "Chỉ tiêu", so_luong: "Số lượng", gia_tri: "Giá trị (đ)" },
      );
    } else if (d.tab === "theo-nhan-vien") {
      await exportRowsToExcel(
        dsNv.map((r) => ({ ma_nv: r.ma_nv, ten_nv: r.ten_nv, bo_phan: r.bo_phan ?? "", so_luong: r.so_luong_ccdc, gia_tri: r.gia_tri, so_hong: r.so_hong })),
        `Bao_cao_theo_nhan_vien_${ngay}.xlsx`,
        "Theo nhan vien",
        { ma_nv: "Mã NV", ten_nv: "Họ tên", bo_phan: "Bộ phận", so_luong: "Số TS đang giữ", gia_tri: "Nguyên giá (đ)", so_hong: "Số TS hỏng" },
      );
    } else if (d.tab === "theo-bo-phan") {
      await exportRowsToExcel(
        dsBp.map((r) => ({ bo_phan: r.bo_phan, so_nv: r.so_nhan_vien, so_luong: r.so_luong_ccdc, gia_tri: r.gia_tri })),
        `Bao_cao_theo_bo_phan_${ngay}.xlsx`,
        "Theo bo phan",
        { bo_phan: "Bộ phận", so_nv: "Số NV giữ TS", so_luong: "Số TS", gia_tri: "Nguyên giá (đ)" },
      );
    } else if (d.tab === "sap-het-bao-hanh") {
      await exportRowsToExcel(
        dsBh.map((r) => ({ ma: r.id, ten: r.ten_ccdc, han: r.han_bao_hanh, con_lai: r.con_lai, ncc: r.nha_cung_cap ?? "", vi_tri: r.nguoi_dang_giu_ten ?? r.ten_kho ?? "" })),
        `Bao_cao_sap_het_bao_hanh_${ngay}.xlsx`,
        "Sap het BH",
        { ma: "Mã TS", ten: "Tên tài sản", han: "Hạn bảo hành", con_lai: "Còn (ngày)", ncc: "Nhà cung cấp", vi_tri: "Người giữ / kho" },
      );
    } else if (d.tab === "kiem-ke-chenh-lech") {
      await exportRowsToExcel(
        dsCl.map((r) => ({
          dot: r.ma_dot ?? r.ten_dot,
          ma: r.ccdc_id,
          ten: r.ten_ccdc,
          he_thong: r.he_thong_nguoi_giu_ten ?? r.he_thong_kho ?? "",
          thuc_te: TINH_TRANG_KIEM_KE[r.tinh_trang_thuc_te]?.label ?? r.tinh_trang_thuc_te,
          nguoi_giu: r.nguoi_dang_giu_thuc_te_ten ?? "",
          nguyen_gia: r.nguyen_gia ?? 0,
          ghi_chu: r.ghi_chu ?? "",
          luc: r.kiem_ke_luc,
        })),
        `Bao_cao_chenh_lech_kiem_ke_${ngay}.xlsx`,
        "Chenh lech",
        { dot: "Đợt", ma: "Mã TS", ten: "Tên tài sản", he_thong: "Hệ thống ghi nhận", thuc_te: "Thực tế", nguoi_giu: "Người giữ thực tế", nguyen_gia: "Nguyên giá (đ)", ghi_chu: "Ghi chú", luc: "Thời điểm" },
      );
    } else {
      await exportRowsToExcel(
        dsTl.map((r) => ({
          ma: r.ma_phieu ?? r.id,
          loai: r.loai === "Tieu huy" ? "Tiêu hủy" : "Thanh lý",
          ngay: r.ngay_de_xuat,
          so_ts: r.so_luong_ccdc,
          tai_san: r.tom_tat ?? "",
          nguyen_gia: r.nguyen_gia,
          thu_hoi: r.gia_tri_thu_hoi ?? 0,
          ly_do: r.ly_do ?? "",
        })),
        `Bao_cao_thanh_ly_tieu_huy_${ngay}.xlsx`,
        "Thanh ly",
        { ma: "Mã phiếu", loai: "Hình thức", ngay: "Ngày đề xuất", so_ts: "Số TS", tai_san: "Tài sản", nguyen_gia: "Nguyên giá (đ)", thu_hoi: "Thu hồi (đ)", ly_do: "Lý do" },
      );
    }
  }

  // ---------------------------------------------------------------- Danh sach da loc (tim kiem)
  const dsNv = useMemo(() => (d?.tab === "theo-nhan-vien" ? d.rows.filter((r) => (!chiNghi || !r.dang_lam_viec) && coChua(tim, r.ma_nv, r.ten_nv, r.bo_phan)) : []), [d, tim, chiNghi]);
  const dsBp = useMemo(() => (d?.tab === "theo-bo-phan" ? d.rows.filter((r) => coChua(tim, r.bo_phan)) : []), [d, tim]);
  const dsBh = useMemo(() => (d?.tab === "sap-het-bao-hanh" ? d.res.rows.filter((r) => coChua(tim, r.id, r.ten_ccdc, r.nha_cung_cap)) : []), [d, tim]);
  const dsCl = useMemo(() => (d?.tab === "kiem-ke-chenh-lech" ? d.rows.filter((r) => coChua(tim, r.ccdc_id, r.ten_ccdc)) : []), [d, tim]);
  const dsTl = useMemo(() => (d?.tab === "da-thanh-ly" ? d.rows.filter((r) => coChua(tim, r.ma_phieu, r.tom_tat, r.ly_do)) : []), [d, tim]);
  const tNv = useTrangKhach(dsNv, [tim, chiNghi]);
  const tBp = useTrangKhach(dsBp, [tim]);
  const tBh = useTrangKhach(dsBh, [tim]);
  const tCl = useTrangKhach(dsCl, [tim]);
  const tTl = useTrangKhach(dsTl, [tim]);

  // ---------------------------------------------------------------- Bo loc rieng tung bao cao
  const locRieng =
    tab === "sap-het-bao-hanh" ? (
      <label className="header-dropdown select-dropdown">
        <select value={soNgay} onChange={(e) => setSoNgay(e.target.value)} aria-label="Khoảng thời gian">
          {["30", "60", "90", "180", "365"].map((n) => (
            <option key={n} value={n}>
              Trong {n} ngày tới
            </option>
          ))}
        </select>
        <ChevronDown size={13} className="dropdown-arrow" />
      </label>
    ) : tab === "da-thanh-ly" ? (
      <label className="header-dropdown select-dropdown">
        <select value={nam} onChange={(e) => setNam(e.target.value)} aria-label="Năm">
          <option value="">Mọi năm</option>
          {[0, 1, 2, 3].map((i) => (
            <option key={i} value={String(namHienTai - i)}>
              Năm {namHienTai - i}
            </option>
          ))}
        </select>
        <ChevronDown size={13} className="dropdown-arrow" />
      </label>
    ) : tab === "kiem-ke-chenh-lech" ? (
      <label className="header-dropdown select-dropdown">
        <select value={dotId} onChange={(e) => setDotId(e.target.value)} aria-label="Đợt kiểm kê">
          <option value="">Mọi đợt kiểm kê</option>
          {dots.map((o) => (
            <option key={o.id} value={o.id}>
              {o.ma_phieu ? `${o.ma_phieu} · ` : ""}
              {o.ten_dot}
            </option>
          ))}
        </select>
        <ChevronDown size={13} className="dropdown-arrow" />
      </label>
    ) : null;

  return (
    <div className="dashboard-container">
      <PageHeader
        title="Báo cáo"
        filters={
          <>
            <KhoFilter value={khoId} onChange={setKhoId} />
            {locRieng}
          </>
        }
        actions={
          <button className="btn btn-outline" onClick={xuatExcel} disabled={!d}>
            <Download size={14} /> Xuất Excel
          </button>
        }
        capNhatLuc={capNhatLuc}
        onRefresh={load}
        dangTai={dangTai}
      />
      {loi && <div className="alert alert-error">{loi}</div>}

      <FilterTabs<SubTab> value={tab} onChange={doiTab} tabs={SUB_TABS} />

      {!d && !loi && <div className="content-card task-empty">Đang tải báo cáo…</div>}

      {/* ================================================================ TONG HOP */}
      {d?.tab === "tong-quan" &&
        (() => {
          const conQl = d.tq.theo_trang_thai.filter((r) => !["Da thanh ly", "Da tieu huy"].includes(r.trang_thai));
          const tongSl = conQl.reduce((s, r) => s + r.so_luong, 0);
          const tongGt = conQl.reduce((s, r) => s + r.gia_tri, 0);
          const dangDung = conQl.find((r) => r.trang_thai === "Dang cap phat");
          const hong = conQl.find((r) => r.trang_thai === "Hong");
          const choXl = d.tq.chuyen_kho_cho_kt + d.tq.xu_ly_ts_cho_kt;
          return (
            <>
              <div className="kpi-grid kpi-grid-4">
                <KpiCard
                  tone="cyan"
                  icon={<Package size={20} className="text-white" />}
                  watermark={<Package size={52} />}
                  label="Tài sản đang quản lý"
                  value={fmtSo(tongSl)}
                  trend={<div className="kpi-trend"><span className="trend-sub">{fmtGiaTriDong(tongGt)}</span></div>}
                  onClick={() => navigate("tai-san", khoId ? { kho_id: khoId } : {})}
                />
                <KpiCard
                  tone="blue-light"
                  icon={<Users size={20} className="text-white" />}
                  watermark={<Users size={52} />}
                  label="Đang cấp phát sử dụng"
                  value={fmtSo(dangDung?.so_luong ?? 0)}
                  trend={
                    <div className="kpi-trend trend-up">
                      <span className="trend-bold">{tongSl ? fmtSo(((dangDung?.so_luong ?? 0) / tongSl) * 100, 1) : 0}%</span>
                      <span className="trend-sub">· {fmtGiaTri(dangDung?.gia_tri ?? 0)}</span>
                    </div>
                  }
                  subtext={hong ? `${fmtSo(hong.so_luong)} tài sản hỏng (${fmtGiaTri(hong.gia_tri)})` : "Không có tài sản hỏng"}
                  onClick={() => navigate("tai-san", { trang_thai: "Dang cap phat" })}
                />
                <KpiCard
                  tone="purple"
                  icon={<Archive size={20} className="text-white" />}
                  watermark={<Archive size={52} />}
                  label="Tồn kho tiêu hao"
                  value={fmtGiaTri(d.tq.tieu_hao.gia_tri)}
                  trend={<div className="kpi-trend"><span className="trend-sub">{fmtSo(d.tq.tieu_hao.so_mat_hang)} mặt hàng còn tồn</span></div>}
                  subtext={d.tq.tieu_hao.so_ton_am ? `${fmtSo(d.tq.tieu_hao.so_ton_am)} cặp kho–vật tư tồn âm` : "Không có tồn âm"}
                  onClick={() => navigate("cap-phat", { tab: "ton-kho", ...(khoId ? { kho_id: khoId } : {}) })}
                />
                <KpiCard
                  tone={choXl ? "yellow" : "blue"}
                  icon={<ClipboardList size={20} className="text-white" />}
                  watermark={<ClipboardList size={52} />}
                  label="Phiếu chờ kế toán duyệt"
                  value={fmtSo(choXl)}
                  trend={
                    <div className="kpi-trend">
                      <span className="trend-sub">
                        {fmtSo(d.tq.chuyen_kho_cho_kt)} nhập/chuyển kho · {fmtSo(d.tq.xu_ly_ts_cho_kt)} TSCĐ
                      </span>
                    </div>
                  }
                  subtext={`${fmtSo(d.tq.phieu_dang_chuyen)} phiếu đang chuyển · ${fmtSo(d.tq.dot_kiem_ke_dang_thuc_hien)} đợt kiểm kê mở`}
                  onClick={() => navigate("viec-can-lam")}
                />
              </div>

              <div className="split-grid">
                <div className="content-card">
                  <div className="card-header">
                    <div className="card-title-wrap">
                      <BarChart2 size={17} className="card-title-icon text-teal" />
                      <h2 className="card-title">Tài sản theo trạng thái</h2>
                    </div>
                  </div>
                  <div className="task-table-wrapper">
                    <table className="task-table">
                      <thead>
                        <tr>
                          <th>Trạng thái</th>
                          <th style={{ textAlign: "right" }}>Số lượng</th>
                          <th style={{ width: "30%" }}>Tỷ lệ</th>
                          <th style={{ textAlign: "right" }}>Nguyên giá</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.tq.theo_trang_thai.length === 0 && <Rong cot={4}>Không có tài sản trong phạm vi.</Rong>}
                        {d.tq.theo_trang_thai.map((r) => (
                          <tr key={r.trang_thai} className="row-clickable" onClick={() => navigate("tai-san", { trang_thai: r.trang_thai, ...(khoId ? { kho_id: khoId } : {}) })}>
                            <td data-label="Trạng thái">
                              <StatusBadge label={TRANG_THAI_TS[r.trang_thai]?.label ?? r.trang_thai} tone={TRANG_THAI_TS[r.trang_thai]?.tone ?? "neutral"} />
                            </td>
                            <td data-label="Số lượng" style={{ textAlign: "right" }} className="strong">
                              {fmtSo(r.so_luong)}
                            </td>
                            <td data-label="Tỷ lệ">
                              <TyLe phan={r.so_luong} tong={tongSl} />
                            </td>
                            <td data-label="Nguyên giá" style={{ textAlign: "right" }}>
                              {fmtGiaTri(r.gia_tri)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="content-card">
                  <div className="card-header">
                    <div className="card-title-wrap">
                      <Building2 size={17} className="card-title-icon text-teal" />
                      <h2 className="card-title">Tài sản đang nằm tại kho</h2>
                    </div>
                  </div>
                  <div className="task-table-wrapper">
                    <table className="task-table">
                      <thead>
                        <tr>
                          <th>Kho</th>
                          <th style={{ textAlign: "right" }}>Số TS</th>
                          <th style={{ textAlign: "right" }}>Hỏng</th>
                          <th style={{ textAlign: "right" }}>Nguyên giá</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.kho.length === 0 && <Rong cot={4}>Không có tài sản nằm tại kho trong phạm vi.</Rong>}
                        {d.kho.map((r) => (
                          <tr key={r.id} className="row-clickable" onClick={() => navigate("tai-san", { kho_id: String(r.id) })}>
                            <td data-label="Kho" className="strong">
                              {r.ten_kho}
                            </td>
                            <td data-label="Số TS" style={{ textAlign: "right" }}>
                              {fmtSo(r.so_luong)}
                            </td>
                            <td data-label="Hỏng" style={{ textAlign: "right" }} className={r.so_hong ? "text-danger" : undefined}>
                              {fmtSo(r.so_hong)}
                            </td>
                            <td data-label="Nguyên giá" style={{ textAlign: "right" }}>
                              {fmtGiaTri(r.gia_tri)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="chart-note">Tài sản đang cấp phát cho nhân viên không tính vào kho - xem báo cáo “Theo nhân viên”.</p>
                </div>
              </div>
            </>
          );
        })()}

      {/* ================================================================ THEO NHAN VIEN */}
      {d?.tab === "theo-nhan-vien" &&
        (() => {
          const tongTs = d.rows.reduce((s, r) => s + r.so_luong_ccdc, 0);
          const tongGt = d.rows.reduce((s, r) => s + r.gia_tri, 0);
          const nghi = d.rows.filter((r) => !r.dang_lam_viec);
          const top = d.rows[0];
          return (
            <>
              <div className="kpi-grid kpi-grid-4">
                <KpiCard tone="cyan" icon={<Users size={20} className="text-white" />} watermark={<Users size={52} />} label="Nhân viên đang giữ tài sản" value={fmtSo(d.rows.length)} />
                <KpiCard
                  tone="blue-light"
                  icon={<Package size={20} className="text-white" />}
                  watermark={<Package size={52} />}
                  label="Tài sản đang giữ"
                  value={fmtSo(tongTs)}
                  trend={<div className="kpi-trend"><span className="trend-sub">{fmtGiaTriDong(tongGt)}</span></div>}
                />
                <KpiCard
                  tone="purple"
                  icon={<BarChart2 size={20} className="text-white" />}
                  watermark={<BarChart2 size={52} />}
                  label="Giữ nhiều nhất"
                  value={top ? fmtSo(top.so_luong_ccdc) : "0"}
                  trend={<div className="kpi-trend"><span className="trend-sub">{top?.ten_nv ?? "-"}</span></div>}
                  onClick={top ? () => navigate("tai-san", { nguoi_dang_giu: top.ma_nv, ten: top.ten_nv }) : undefined}
                />
                <KpiCard
                  tone={nghi.length ? "red" : "blue"}
                  icon={<AlertTriangle size={20} className="text-white" />}
                  watermark={<AlertTriangle size={52} />}
                  label="NV đã nghỉ còn giữ TS"
                  value={fmtSo(nghi.length)}
                  tangLaXau
                  trend={
                    <div className={`kpi-trend ${nghi.length ? "trend-danger" : ""}`}>
                      <span className="trend-sub">{fmtSo(nghi.reduce((s, r) => s + r.so_luong_ccdc, 0))} tài sản cần thu hồi</span>
                    </div>
                  }
                  onClick={nghi.length ? () => setChiNghi(!chiNghi) : undefined}
                />
              </div>
              <div className="content-card task-card-full">
                <div className="card-header">
                  <div className="card-title-wrap">
                    <Users size={17} className="card-title-icon text-teal" />
                    <h2 className="card-title">Tài sản theo nhân viên</h2>
                  </div>
                  <div className="icon-text">
                    {chiNghi && (
                      <span className="chip">
                        Chỉ NV đã nghỉ
                        <button type="button" className="chip-remove" aria-label="Bỏ lọc" onClick={() => setChiNghi(false)}>
                          ×
                        </button>
                      </span>
                    )}
                    <TimKiem value={tim} onChange={setTim} placeholder="Tìm mã NV, họ tên, bộ phận..." />
                  </div>
                </div>
                <div className="task-table-wrapper">
                  <table className="task-table">
                    <thead>
                      <tr>
                        <th style={{ width: "13%" }}>Mã NV</th>
                        <th>Họ tên</th>
                        <th style={{ width: "22%" }}>Bộ phận</th>
                        <th style={{ width: "10%", textAlign: "right" }}>Số TS</th>
                        <th style={{ width: "8%", textAlign: "right" }}>Hỏng</th>
                        <th style={{ width: "14%", textAlign: "right" }}>Nguyên giá</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dsNv.length === 0 && <Rong cot={6}>{tim ? "Không tìm thấy nhân viên phù hợp." : "Không có nhân viên nào đang giữ tài sản trong phạm vi."}</Rong>}
                      {tNv.dongTrang.map((r) => (
                        <tr key={r.ma_nv} className="row-clickable" onClick={() => navigate("tai-san", { nguoi_dang_giu: r.ma_nv, ten: r.ten_nv })}>
                          <td data-label="Mã NV" className="code-text">
                            {r.ma_nv}
                          </td>
                          <td data-label="Họ tên" className="strong">
                            {r.ten_nv}
                            {!r.dang_lam_viec && <StatusBadge label="Đã nghỉ" tone="danger" />}
                          </td>
                          <td data-label="Bộ phận" className="text-secondary">
                            {r.bo_phan ?? "-"}
                          </td>
                          <td data-label="Số TS" style={{ textAlign: "right" }} className="strong">
                            {fmtSo(r.so_luong_ccdc)}
                          </td>
                          <td data-label="Hỏng" style={{ textAlign: "right" }} className={r.so_hong ? "text-danger" : undefined}>
                            {fmtSo(r.so_hong)}
                          </td>
                          <td data-label="Nguyên giá" style={{ textAlign: "right" }}>
                            {fmtGiaTri(r.gia_tri)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <PhanTrang trang={tNv.trang} tong={tNv.tong} onDoi={tNv.setTrang} donVi="nhân viên" />
              </div>
            </>
          );
        })()}

      {/* ================================================================ THEO BO PHAN */}
      {d?.tab === "theo-bo-phan" &&
        (() => {
          const tongTs = d.rows.reduce((s, r) => s + r.so_luong_ccdc, 0);
          const tongGt = d.rows.reduce((s, r) => s + r.gia_tri, 0);
          const top = d.rows[0];
          const chuaRo = d.rows.find((r) => r.bo_phan === "Chưa rõ bộ phận");
          return (
            <>
              <div className="kpi-grid kpi-grid-4">
                <KpiCard tone="cyan" icon={<Building2 size={20} className="text-white" />} watermark={<Building2 size={52} />} label="Bộ phận đang giữ tài sản" value={fmtSo(d.rows.length)} />
                <KpiCard
                  tone="blue-light"
                  icon={<Package size={20} className="text-white" />}
                  watermark={<Package size={52} />}
                  label="Tài sản đang cấp phát"
                  value={fmtSo(tongTs)}
                  trend={<div className="kpi-trend"><span className="trend-sub">{fmtGiaTriDong(tongGt)}</span></div>}
                />
                <KpiCard
                  tone="purple"
                  icon={<BarChart2 size={20} className="text-white" />}
                  watermark={<BarChart2 size={52} />}
                  label="Bộ phận nhiều nhất"
                  value={top ? fmtSo(top.so_luong_ccdc) : "0"}
                  trend={<div className="kpi-trend"><span className="trend-sub">{top?.bo_phan ?? "-"}</span></div>}
                />
                <KpiCard
                  tone={chuaRo ? "yellow" : "blue"}
                  icon={<AlertTriangle size={20} className="text-white" />}
                  watermark={<AlertTriangle size={52} />}
                  label="TS của NV chưa rõ bộ phận"
                  value={fmtSo(chuaRo?.so_luong_ccdc ?? 0)}
                  trend={<div className="kpi-trend"><span className="trend-sub">{chuaRo ? `${fmtSo(chuaRo.so_nhan_vien)} NV chưa có bộ phận (đồng bộ ETX)` : "Dữ liệu bộ phận đầy đủ"}</span></div>}
                />
              </div>
              <div className="content-card task-card-full">
                <div className="card-header">
                  <div className="card-title-wrap">
                    <Building2 size={17} className="card-title-icon text-teal" />
                    <h2 className="card-title">Tài sản theo bộ phận</h2>
                  </div>
                  <TimKiem value={tim} onChange={setTim} placeholder="Tìm bộ phận..." />
                </div>
                <div className="task-table-wrapper">
                  <table className="task-table">
                    <thead>
                      <tr>
                        <th>Bộ phận</th>
                        <th style={{ width: "12%", textAlign: "right" }}>Số NV</th>
                        <th style={{ width: "12%", textAlign: "right" }}>Số TS</th>
                        <th style={{ width: "24%" }}>Tỷ lệ</th>
                        <th style={{ width: "14%", textAlign: "right" }}>Nguyên giá</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dsBp.length === 0 && <Rong cot={5}>Không có dữ liệu.</Rong>}
                      {tBp.dongTrang.map((r) => (
                        <tr
                          key={r.bo_phan}
                          className="row-clickable"
                          title="Xem nhân viên của bộ phận"
                          onClick={() => {
                            doiTab("theo-nhan-vien");
                            setTim(r.bo_phan === "Chưa rõ bộ phận" ? "" : r.bo_phan);
                          }}
                        >
                          <td data-label="Bộ phận" className="strong">
                            {r.bo_phan}
                          </td>
                          <td data-label="Số NV" style={{ textAlign: "right" }}>
                            {fmtSo(r.so_nhan_vien)}
                          </td>
                          <td data-label="Số TS" style={{ textAlign: "right" }} className="strong">
                            {fmtSo(r.so_luong_ccdc)}
                          </td>
                          <td data-label="Tỷ lệ">
                            <TyLe phan={r.so_luong_ccdc} tong={tongTs} />
                          </td>
                          <td data-label="Nguyên giá" style={{ textAlign: "right" }}>
                            {fmtGiaTri(r.gia_tri)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <PhanTrang trang={tBp.trang} tong={tBp.tong} onDoi={tBp.setTrang} donVi="bộ phận" />
              </div>
            </>
          );
        })()}

      {/* ================================================================ SAP HET BAO HANH */}
      {d?.tab === "sap-het-bao-hanh" &&
        (() => {
          const tk = d.res.thong_ke;
          const gap7 = d.res.rows.filter((r) => r.con_lai <= 7).length;
          return (
            <>
              <div className="kpi-grid kpi-grid-4">
                <KpiCard
                  tone={d.res.rows.length ? "yellow" : "cyan"}
                  icon={<ShieldCheck size={20} className="text-white" />}
                  watermark={<ShieldCheck size={52} />}
                  label={`Hết bảo hành trong ${d.res.so_ngay} ngày`}
                  value={fmtSo(d.res.rows.length)}
                  trend={<div className="kpi-trend"><span className="trend-sub">{fmtSo(gap7)} tài sản còn ≤ 7 ngày</span></div>}
                />
                <KpiCard
                  tone={tk.da_het ? "red" : "blue-light"}
                  icon={<AlertTriangle size={20} className="text-white" />}
                  watermark={<AlertTriangle size={52} />}
                  label="Đã hết hạn bảo hành"
                  value={fmtSo(tk.da_het)}
                  tangLaXau
                />
                <KpiCard
                  tone="blue"
                  icon={<Package size={20} className="text-white" />}
                  watermark={<Package size={52} />}
                  label="TS có dữ liệu bảo hành"
                  value={`${fmtSo(tk.co_han)}/${fmtSo(tk.tong)}`}
                  trend={
                    <div className="kpi-trend">
                      <span className="trend-bold">{tk.tong ? fmtSo((tk.co_han / tk.tong) * 100, 1) : 0}%</span>
                      <span className="trend-sub">tài sản đang quản lý</span>
                    </div>
                  }
                />
                <KpiCard
                  tone={tk.tong - tk.co_han ? "purple" : "blue"}
                  icon={<ClipboardList size={20} className="text-white" />}
                  watermark={<ClipboardList size={52} />}
                  label="Chưa nhập hạn bảo hành"
                  value={fmtSo(tk.tong - tk.co_han)}
                  trend={<div className="kpi-trend"><span className="trend-sub">Cập nhật ở Danh mục tài sản</span></div>}
                  onClick={() => navigate("tai-san")}
                />
              </div>
              <div className="content-card task-card-full">
                <div className="card-header">
                  <div className="card-title-wrap">
                    <ShieldCheck size={17} className="card-title-icon text-teal" />
                    <h2 className="card-title">Tài sản sắp hết bảo hành</h2>
                  </div>
                  <TimKiem value={tim} onChange={setTim} placeholder="Tìm mã, tên, nhà cung cấp..." />
                </div>
                <div className="task-table-wrapper">
                  <table className="task-table">
                    <thead>
                      <tr>
                        <th style={{ width: "15%" }}>Mã tài sản</th>
                        <th>Tên tài sản</th>
                        <th style={{ width: "13%" }}>Hạn bảo hành</th>
                        <th style={{ width: "10%", textAlign: "right" }}>Còn lại</th>
                        <th style={{ width: "16%" }}>Nhà cung cấp</th>
                        <th style={{ width: "18%" }}>Người giữ / kho</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dsBh.length === 0 && (
                        <Rong cot={6}>
                          {tk.co_han === 0
                            ? "Chưa có tài sản nào được nhập hạn bảo hành - báo cáo sẽ có số liệu khi cập nhật hạn bảo hành trong Danh mục tài sản."
                            : `Không có tài sản nào hết bảo hành trong ${d.res.so_ngay} ngày tới.`}
                        </Rong>
                      )}
                      {tBh.dongTrang.map((r) => (
                        <tr key={r.id} className={r.con_lai <= 7 ? "row-overdue" : undefined}>
                          <td data-label="Mã tài sản">
                            <span className="code-link" onClick={() => moTaiSan(r.id)}>
                              {r.id}
                            </span>
                          </td>
                          <td data-label="Tên tài sản">{r.ten_ccdc}</td>
                          <td data-label="Hạn bảo hành">{fmtNgay(r.han_bao_hanh)}</td>
                          <td data-label="Còn lại" style={{ textAlign: "right" }} className={r.con_lai <= 7 ? "text-danger strong" : undefined}>
                            {fmtSo(r.con_lai)} ngày
                          </td>
                          <td data-label="Nhà cung cấp" className="text-secondary">
                            {r.nha_cung_cap ?? "-"}
                          </td>
                          <td data-label="Người giữ / kho">{r.nguoi_dang_giu_ten ?? r.ten_kho ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <PhanTrang trang={tBh.trang} tong={tBh.tong} onDoi={tBh.setTrang} donVi="tài sản" />
              </div>
            </>
          );
        })()}

      {/* ================================================================ CHENH LECH KIEM KE */}
      {d?.tab === "kiem-ke-chenh-lech" &&
        (() => {
          const dem = (k: string) => d.rows.filter((r) => r.tinh_trang_thuc_te === k);
          const thieu = dem("Thieu");
          return (
            <>
              <div className="kpi-grid kpi-grid-4">
                <KpiCard
                  tone={d.rows.length ? "red" : "cyan"}
                  icon={<AlertTriangle size={20} className="text-white" />}
                  watermark={<AlertTriangle size={52} />}
                  label="Tổng chênh lệch"
                  value={fmtSo(d.rows.length)}
                  tangLaXau
                  trend={<div className="kpi-trend"><span className="trend-sub">{fmtSo(new Set(d.rows.map((r) => r.dot_kiem_ke_id)).size)} đợt kiểm kê</span></div>}
                  onClick={() => navigate("kiem-ke")}
                />
                <KpiCard
                  tone={thieu.length ? "yellow" : "blue-light"}
                  icon={<Package size={20} className="text-white" />}
                  watermark={<Package size={52} />}
                  label="Thiếu (không tìm thấy)"
                  value={fmtSo(thieu.length)}
                  trend={<div className="kpi-trend"><span className="trend-sub">Nguyên giá {fmtGiaTri(thieu.reduce((s, r) => s + (r.nguyen_gia ?? 0), 0))}</span></div>}
                />
                <KpiCard
                  tone="purple"
                  icon={<Trash2 size={20} className="text-white" />}
                  watermark={<Trash2 size={52} />}
                  label="Phát hiện hỏng"
                  value={fmtSo(dem("Hong").length)}
                  trend={<div className="kpi-trend"><span className="trend-sub">Cần lập phiếu báo hỏng</span></div>}
                />
                <KpiCard
                  tone="blue"
                  icon={<Users size={20} className="text-white" />}
                  watermark={<Users size={52} />}
                  label="Sai người giữ / thừa"
                  value={fmtSo(dem("Sai nguoi giu").length + dem("Thua").length)}
                  trend={<div className="kpi-trend"><span className="trend-sub">Điều chỉnh qua phiếu điều chuyển</span></div>}
                  onClick={() => navigate("giao-nhan")}
                />
              </div>
              <div className="content-card task-card-full">
                <div className="card-header">
                  <div className="card-title-wrap">
                    <ClipboardList size={17} className="card-title-icon text-teal" />
                    <h2 className="card-title">Chênh lệch kiểm kê</h2>
                  </div>
                  <TimKiem value={tim} onChange={setTim} placeholder="Tìm mã, tên tài sản..." />
                </div>
                <div className="task-table-wrapper">
                  <table className="task-table">
                    <thead>
                      <tr>
                        <th style={{ width: "13%" }}>Đợt</th>
                        <th style={{ width: "14%" }}>Mã tài sản</th>
                        <th>Tên tài sản</th>
                        <th style={{ width: "16%" }}>Hệ thống ghi nhận</th>
                        <th style={{ width: "11%", textAlign: "center" }}>Thực tế</th>
                        <th style={{ width: "15%" }}>Người giữ thực tế / ghi chú</th>
                        <th style={{ width: "11%" }}>Thời điểm</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dsCl.length === 0 && <Rong cot={7}>Không có chênh lệch nào được ghi nhận.</Rong>}
                      {tCl.dongTrang.map((r) => {
                        const tt = TINH_TRANG_KIEM_KE[r.tinh_trang_thuc_te];
                        return (
                          <tr key={r.id}>
                            <td data-label="Đợt">
                              <span className="code-link" title={r.ten_dot} onClick={() => navigate("kiem-ke", { dot: r.dot_kiem_ke_id })}>
                                {r.ma_dot ?? r.ten_dot}
                              </span>
                            </td>
                            <td data-label="Mã tài sản">
                              <span className="code-link" onClick={() => moTaiSan(r.ccdc_id)}>
                                {r.ccdc_id}
                              </span>
                            </td>
                            <td data-label="Tên tài sản">{r.ten_ccdc}</td>
                            <td data-label="Hệ thống" className="text-secondary">
                              {r.he_thong_nguoi_giu_ten ?? r.he_thong_kho ?? "-"}
                            </td>
                            <td data-label="Thực tế" style={{ textAlign: "center" }}>
                              <StatusBadge label={tt?.label ?? r.tinh_trang_thuc_te} tone={tt?.tone ?? "danger"} />
                            </td>
                            <td data-label="Người giữ thực tế">
                              <div className="cell-stack">
                                <span>{r.nguoi_dang_giu_thuc_te_ten ?? "-"}</span>
                                {r.ghi_chu && <span className="small text-secondary">{r.ghi_chu}</span>}
                              </div>
                            </td>
                            <td data-label="Thời điểm">{fmtNgayGio(r.kiem_ke_luc)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <PhanTrang trang={tCl.trang} tong={tCl.tong} onDoi={tCl.setTrang} donVi="tài sản" />
              </div>
            </>
          );
        })()}

      {/* ================================================================ DA THANH LY / TIEU HUY */}
      {d?.tab === "da-thanh-ly" &&
        (() => {
          const soTs = d.rows.reduce((s, r) => s + r.so_luong_ccdc, 0);
          const ng = d.rows.reduce((s, r) => s + r.nguyen_gia, 0);
          const thuHoi = d.rows.reduce((s, r) => s + (r.gia_tri_thu_hoi ?? 0), 0);
          return (
            <>
              <div className="kpi-grid kpi-grid-4">
                <KpiCard
                  tone="cyan"
                  icon={<ClipboardList size={20} className="text-white" />}
                  watermark={<ClipboardList size={52} />}
                  label="Phiếu đã hoàn tất"
                  value={fmtSo(d.rows.length)}
                  trend={
                    <div className="kpi-trend">
                      <span className="trend-sub">
                        {fmtSo(d.rows.filter((r) => r.loai === "Thanh ly").length)} thanh lý · {fmtSo(d.rows.filter((r) => r.loai === "Tieu huy").length)} tiêu hủy
                      </span>
                    </div>
                  }
                  onClick={() => navigate("thanh-ly")}
                />
                <KpiCard tone="blue-light" icon={<Package size={20} className="text-white" />} watermark={<Package size={52} />} label="Tài sản đã xử lý" value={fmtSo(soTs)} />
                <KpiCard
                  tone="purple"
                  icon={<Trash2 size={20} className="text-white" />}
                  watermark={<Trash2 size={52} />}
                  label="Nguyên giá đã ghi giảm"
                  value={fmtGiaTri(ng)}
                />
                <KpiCard
                  tone="blue"
                  icon={<BarChart2 size={20} className="text-white" />}
                  watermark={<BarChart2 size={52} />}
                  label="Giá trị thu hồi"
                  value={fmtGiaTri(thuHoi)}
                  trend={<div className="kpi-trend"><span className="trend-sub">{ng ? `${fmtSo((thuHoi / ng) * 100, 1)}% nguyên giá` : "Chưa có phát sinh"}</span></div>}
                />
              </div>
              <div className="content-card task-card-full">
                <div className="card-header">
                  <div className="card-title-wrap">
                    <Trash2 size={17} className="card-title-icon text-teal" />
                    <h2 className="card-title">Tài sản đã thanh lý / tiêu hủy</h2>
                  </div>
                  <TimKiem value={tim} onChange={setTim} placeholder="Tìm mã phiếu, tài sản, lý do..." />
                </div>
                <div className="task-table-wrapper">
                  <table className="task-table">
                    <thead>
                      <tr>
                        <th style={{ width: "14%" }}>Mã phiếu</th>
                        <th style={{ width: "10%" }}>Hình thức</th>
                        <th>Tài sản</th>
                        <th style={{ width: "11%" }}>Ngày đề xuất</th>
                        <th style={{ width: "12%", textAlign: "right" }}>Nguyên giá</th>
                        <th style={{ width: "12%", textAlign: "right" }}>Thu hồi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dsTl.length === 0 && <Rong cot={6}>Chưa có tài sản nào đã thanh lý / tiêu hủy{nam ? ` trong năm ${nam}` : ""}.</Rong>}
                      {tTl.dongTrang.map((r) => (
                        <tr key={r.id}>
                          <td data-label="Mã phiếu">
                            <span className="code-link" onClick={() => moPhieu("xu_ly", r.id)}>
                              {r.ma_phieu ?? r.id.slice(0, 8)}
                            </span>
                          </td>
                          <td data-label="Hình thức">
                            <StatusBadge label={r.loai === "Tieu huy" ? "Tiêu hủy" : "Thanh lý"} tone={r.loai === "Tieu huy" ? "danger" : "warning"} />
                          </td>
                          <td data-label="Tài sản">
                            <div className="cell-stack">
                              <span>
                                {fmtSo(r.so_luong_ccdc)} TS: {r.tom_tat ?? "-"}
                              </span>
                              {r.ly_do && <span className="small text-secondary">Lý do: {r.ly_do}</span>}
                            </div>
                          </td>
                          <td data-label="Ngày đề xuất">{fmtNgay(r.ngay_de_xuat)}</td>
                          <td data-label="Nguyên giá" style={{ textAlign: "right" }}>
                            {fmtGiaTri(r.nguyen_gia)}
                          </td>
                          <td data-label="Thu hồi" style={{ textAlign: "right" }}>
                            {r.gia_tri_thu_hoi != null ? fmtGiaTri(r.gia_tri_thu_hoi) : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <PhanTrang trang={tTl.trang} tong={tTl.tong} onDoi={tTl.setTrang} donVi="phiếu" />
              </div>
            </>
          );
        })()}
    </div>
  );
}

function TimKiem({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="topbar-search filter-search">
      <Search size={15} className="search-icon" />
      <input className="search-input" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
