import { t, tS } from "../lib/i18n";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart2,
  Box,
  ClipboardCheck,
  Clock,
  FileText,
  GitBranch,
  PieChart,
  ShoppingCart,
  Store,
  Tag,
  Trash2,
  User,
  UserCheck,
  Users,
} from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { DateRangeFilter, khoangMacDinh, type KhoangNgay } from "../components/DateRangeFilter";
import { KhoFilter } from "../components/KhoFilter";
import { KpiCard, type XuHuong } from "../components/KpiCard";
import { FilterTabs } from "../components/FilterTabs";
import { ViecTable } from "../components/ViecTable";
import { CanhBaoRow, type CanhBao } from "../components/CanhBaoRow";
import { useDuLieuChung, type ViecRow } from "../lib/duLieuChung";
import { useNav, type NavParams, type TabKey } from "../lib/navigation";
import { duocMoTab } from "../lib/menu";
import { useKhiThayDoi } from "../lib/suKien";
import { fmtGiaTri, fmtGiaTriDong, fmtSo, fmtThang } from "../lib/format";
import { thongBaoLoi } from "../lib/nhan";
import { ChonLoc } from "../components/ChonLoc";

// Tong quan tai san - moi phan tu lay tu /api/dashboard/tong-quan + /viec-can-lam + /canh-bao (loc theo
// quyen o server). Bo cuc/kieu dang giu nguyen mau giao dien.png.

interface ChiSo {
  so_luong: number;
  gia_tri: number;
  xu_huong: XuHuong;
}
interface TongQuan {
  cap_nhat_luc: string;
  tu: string;
  den: string;
  ky_truoc: { tu: string; den: string; ngay_chup: string | null };
  toan_bo: boolean;
  kpi: {
    tong_ts: ChiSo;
    trong_kho: ChiSo & { nhan: string };
    dang_su_dung: ChiSo;
    tieu_hao_da_cap: ChiSo & { so_phieu: number };
    cho_ke_toan: ChiSo;
  };
  theo_thang: { thang: string; tong_gia_tri: number; chi_phi_mua: number }[];
  ts_thieu_ngay_mua: number;
  theo_nhom: { ten: string; gia_tri: number; so_luong: number; loai: "nhom" | "khac" | "tieu_hao"; nhom_id?: number | null }[];
  luong: Record<"nhap_hang" | "cho_ke_toan" | "kho_hcns" | "ban_giao" | "dang_su_dung" | "xu_ly" | "bao_hong", number>;
}

type TabViec = "tat-ca" | "cho-duyet" | "cap-phat" | "ban-giao" | "khac";

const MAU_NHOM = [
  { mau: "#00A2B4", dot: "dot-teal" },
  { mau: "#1D70B8", dot: "dot-blue" },
  { mau: "#7952CC", dot: "dot-purple" },
  { mau: "#F59E0B", dot: "dot-amber" },
  { mau: "#94A3B8", dot: "dot-gray" },
];
const MAU_TIEU_HAO = { mau: "#10B981", dot: "dot-green" };

// ---------------------------------------------------------------------------------------------
// Bieu do cot (chi phi mua sam - truc phai) + duong (tong gia tri - truc trai), ve tu du lieu that.
function mocDep(max: number): number {
  if (max <= 0) return 1;
  const mu = Math.pow(10, Math.floor(Math.log10(max)));
  const buoc = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((b) => b * mu >= max) ?? 10;
  return buoc * mu;
}
function donVi(max: number): { chia: number; ten: string } {
  return max >= 1e9 ? { chia: 1e9, ten: t("Tỷ đồng") } : { chia: 1e6, ten: t("Triệu đồng") };
}
function duongCong(pts: { x: number; y: number }[]): string {
  if (!pts.length) return "";
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${p2.x},${p2.y}`;
  }
  return d;
}

function BieuDoThang({ data }: { data: TongQuan["theo_thang"] }) {
  const X0 = 30;
  const X1 = 426;
  const Y0 = 20;
  const Y1 = 128;
  const buoc = data.length > 1 ? (X1 - X0 - 16) / (data.length - 1) : 0;
  const maxTong = mocDep(Math.max(...data.map((d) => d.tong_gia_tri), 0));
  const maxMua = mocDep(Math.max(...data.map((d) => d.chi_phi_mua), 0));
  const dvTrai = donVi(maxTong);
  const dvPhai = donVi(maxMua);
  const y = (v: number, max: number) => Y1 - (v / max) * (Y1 - Y0);
  const pts = data.map((d, i) => ({ x: X0 + 8 + i * buoc, y: +y(d.tong_gia_tri, maxTong).toFixed(1) }));
  const nhan = (v: number, dv: { chia: number }) => fmtSo(v / dv.chia, v / dv.chia < 10 && v % dv.chia ? 1 : 0);

  return (
    <div className="monthly-chart-wrap">
      <div className="y-axis-label">{dvTrai.ten}</div>
      <div className="y-axis-label y-axis-label-right">{dvPhai.ten}</div>
      <svg className="monthly-chart-svg" viewBox="0 0 460 160" preserveAspectRatio="none">
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9BE3EA" />
            <stop offset="100%" stopColor="#D5F4F7" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => {
          const yy = Y0 + (i * (Y1 - Y0)) / 3;
          return (
            <g key={i}>
              <line x1={X0} y1={yy} x2={X1} y2={yy} stroke={i === 3 ? "#E2E8F0" : "#F1F5F9"} strokeWidth="1" strokeDasharray={i === 3 ? undefined : "3 3"} />
              <text x={X0 - 6} y={yy + 3} fontSize="9" fill="#94A3B8" textAnchor="end">
                {nhan((maxTong * (3 - i)) / 3, dvTrai)}
              </text>
              <text x={X1 + 5} y={yy + 3} fontSize="9" fill="#94A3B8" textAnchor="start">
                {nhan((maxMua * (3 - i)) / 3, dvPhai)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = Y1 - y(d.chi_phi_mua, maxMua);
          return (
            <rect key={d.thang} x={pts[i].x - 6.5} y={Y1 - h} width="13" height={Math.max(h, d.chi_phi_mua > 0 ? 1 : 0)} rx="1.5" fill="url(#barGrad)">
              <title>{t("{x} - Chi phí mua sắm: {x2}", { x: fmtThang(d.thang), x2: fmtGiaTri(d.chi_phi_mua) })}</title>
            </rect>
          );
        })}
        <path d={duongCong(pts)} fill="none" stroke="#00A2B4" strokeWidth="2.2" strokeLinecap="round" />
        {data.map((d, i) => (
          <circle key={d.thang} cx={pts[i].x} cy={pts[i].y} r="3.2" fill="#00A2B4" stroke="#FFFFFF" strokeWidth="1.5">
            <title>{t("{x} - Tổng giá trị: {x2}", { x: fmtThang(d.thang), x2: fmtGiaTri(d.tong_gia_tri) })}</title>
          </circle>
        ))}
        {data.map((d, i) => (
          <text key={d.thang} x={pts[i].x} y="144" fontSize="8.5" fill="#94A3B8" textAnchor="middle">
            {fmtThang(d.thang)}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
function Donut({ nhom, onChon }: { nhom: TongQuan["theo_nhom"]; onChon: (n: TongQuan["theo_nhom"][number]) => void }) {
  const tong = nhom.reduce((s, n) => s + n.gia_tri, 0);
  const C = 2 * Math.PI * 54;
  let daVe = 0;
  const mauCua = (n: TongQuan["theo_nhom"][number], i: number) => (n.loai === "tieu_hao" ? MAU_TIEU_HAO : MAU_NHOM[Math.min(i, MAU_NHOM.length - 1)]);
  return (
    <div className="donut-content-layout">
      <div className="donut-svg-wrapper">
        <svg viewBox="0 0 160 160" className="donut-svg">
          {tong === 0 && <circle cx="80" cy="80" r="54" fill="none" stroke="#E2E8F0" strokeWidth="24" />}
          {tong > 0 &&
            nhom.map((n, i) => {
              const dai = (n.gia_tri / tong) * C;
              const el = (
                <circle
                  key={n.ten}
                  cx="80"
                  cy="80"
                  r="54"
                  fill="none"
                  stroke={mauCua(n, i).mau}
                  strokeWidth="24"
                  strokeDasharray={`${dai.toFixed(2)} ${(C - dai).toFixed(2)}`}
                  strokeDashoffset={(-daVe).toFixed(2)}
                  className="donut-slice"
                  onClick={() => onChon(n)}
                >
                  <title>{`${tS(n.ten)}: ${fmtGiaTri(n.gia_tri)} (${fmtSo(n.so_luong)} ${n.loai === "tieu_hao" ? t("đơn vị") : t("tài sản")})`}</title>
                </circle>
              );
              daVe += dai;
              return el;
            })}
        </svg>
        <div className="donut-center-info">
          <div className="donut-center-label">{t("Tổng giá trị")}</div>
          <div className="donut-center-val">{fmtGiaTri(tong)}</div>
        </div>
      </div>
      <div className="donut-legend-list">
        {nhom.length === 0 && <div className="muted small">{t("Chưa có tài sản.")}</div>}
        {nhom.map((n, i) => (
          <div key={n.ten} className="donut-legend-row legend-clickable" onClick={() => onChon(n)} role="button" tabIndex={0}>
            <div className="legend-left">
              <span className={`dot ${mauCua(n, i).dot}`}></span>
              <div className="legend-text-col">
                <span className="legend-title" title={tS(n.ten)}>
                  {tS(n.ten)}
                </span>
                <span className="legend-pct">{tong ? Math.round((n.gia_tri / tong) * 100) : 0}%</span>
              </div>
            </div>
            <div className="legend-val">{fmtGiaTri(n.gia_tri)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
function NutLuong({
  children,
  so,
  onClick,
  className = "flow-node",
}: {
  children: ReactNode;
  so: number;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <div
      className={`${className} ${onClick ? "flow-clickable" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
    >
      {children}
      <span className="flow-node-count">{fmtSo(so)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
export function TongQuanScreen() {
  const auth = useAuth();
  const { params, navigate } = useNav();
  const { viec, reload: reloadViec } = useDuLieuChung();
  const [khoang, setKhoang] = useState<KhoangNgay>(() => khoangMacDinh("nam-nay"));
  const [khoId, setKhoId] = useState(params.kho_id ?? "");
  const [data, setData] = useState<TongQuan | null>(null);
  const [canhBao, setCanhBao] = useState<CanhBao[] | null>(null);
  const [soThang, setSoThang] = useState(12);
  const [tabViec, setTabViec] = useState<TabViec>("tat-ca");
  const [dangTai, setDangTai] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  const load = useCallback(async () => {
    setDangTai(true);
    setLoi(null);
    const qs = new URLSearchParams({ tu: khoang.tu, den: khoang.den });
    if (khoId) qs.set("kho_id", khoId);
    const qsCb = khoId ? `?kho_id=${khoId}` : "";
    try {
      const [tq, cb] = await Promise.all([
        api.get<TongQuan>(`/dashboard/tong-quan?${qs}`),
        api.get<{ rows: CanhBao[] }>(`/dashboard/canh-bao${qsCb}`),
        reloadViec(),
      ]);
      setData(tq);
      setCanhBao(cb.rows);
    } catch (e) {
      setLoi(thongBaoLoi(e, t("Không tải được số liệu tổng quan.")));
    } finally {
      setDangTai(false);
    }
  }, [khoang, khoId, reloadViec]);

  useEffect(() => {
    load();
  }, [load]);
  useKhiThayDoi(load);

  const user = auth.status === "authenticated" ? auth.user : null;
  /** Chuyen man neu nguoi dung duoc mo (nut/the khong co quyen thi khong bam duoc). */
  const diToi = (tab: TabKey, p?: NavParams) => (user && duocMoTab(user, tab) ? () => navigate(tab, p) : undefined);

  const viecRows: ViecRow[] = useMemo(() => {
    const all = viec?.rows ?? [];
    const loc = tabViec === "tat-ca" ? all : all.filter((r) => r.tab === tabViec);
    return [...loc].sort((a, b) => Number(b.qua_han) - Number(a.qua_han) || a.thoi_gian.localeCompare(b.thoi_gian)).slice(0, 5);
  }, [viec, tabViec]);

  const k = data?.kpi;
  const thang = data ? data.theo_thang.slice(-soThang) : [];
  const moTaKy = data ? t("so với kỳ trước") : "";

  return (
    <div className="dashboard-container">
      <PageHeader
        title={t("Tổng quan tài sản")}
        filters={
          <>
            <DateRangeFilter value={khoang} onChange={setKhoang} />
            <KhoFilter value={khoId} onChange={setKhoId} />
          </>
        }
        capNhatLuc={data?.cap_nhat_luc}
        onRefresh={load}
        dangTai={dangTai}
      />
      {loi && <div className="alert alert-error">{loi}</div>}

      {/* Tang 2: 5 KPI */}
      <div className="kpi-grid">
        <KpiCard
          tone="cyan"
          icon={<Box size={20} className="text-white" />}
          watermark={
            <div className="watermark-bars">
              <span className="bar b1"></span>
              <span className="bar b2"></span>
              <span className="bar b3"></span>
              <span className="bar b4"></span>
            </div>
          }
          label={t("Tổng tài sản")}
          value={k ? fmtSo(k.tong_ts.so_luong) : "…"}
          xuHuong={k?.tong_ts.xu_huong}
          moTaXuHuong={moTaKy}
          subtext={k ? t("Giá trị: {x}", { x: fmtGiaTriDong(k.tong_ts.gia_tri) }) : undefined}
          onClick={diToi("tai-san")}
        />
        <KpiCard
          tone="blue-light"
          icon={<Store size={20} className="text-white" />}
          watermark={<Store size={52} />}
          label={k ? tS(k.trong_kho.nhan) : t("Trong kho HCNS")}
          value={k ? fmtSo(k.trong_kho.so_luong) : "…"}
          xuHuong={k?.trong_kho.xu_huong}
          moTaXuHuong={moTaKy}
          subtext={k ? t("Giá trị: {x}", { x: fmtGiaTriDong(k.trong_kho.gia_tri) }) : undefined}
          onClick={diToi("tai-san", { trang_thai: "Trong kho" })}
        />
        <KpiCard
          tone="blue"
          icon={<User size={20} className="text-white" />}
          watermark={<Users size={52} />}
          label={t("Đang sử dụng")}
          value={k ? fmtSo(k.dang_su_dung.so_luong) : "…"}
          xuHuong={k?.dang_su_dung.xu_huong}
          moTaXuHuong={moTaKy}
          subtext={k ? t("Giá trị: {x}", { x: fmtGiaTriDong(k.dang_su_dung.gia_tri) }) : undefined}
          onClick={diToi("tai-san", { trang_thai: "Dang cap phat" })}
        />
        <KpiCard
          tone="purple"
          icon={<Tag size={20} className="text-white" />}
          watermark={<Box size={52} />}
          label={t("Tài sản tiêu hao đã cấp")}
          value={k ? fmtSo(k.tieu_hao_da_cap.so_luong) : "…"}
          xuHuong={k?.tieu_hao_da_cap.xu_huong}
          moTaXuHuong={moTaKy}
          subtext={k ? t("Giá trị: {x} · {x2} phiếu", { x: fmtGiaTriDong(k.tieu_hao_da_cap.gia_tri), x2: fmtSo(k.tieu_hao_da_cap.so_phieu) }) : undefined}
          onClick={diToi("cap-phat", { tab: "phieu" })}
        />
        <KpiCard
          tone="yellow"
          icon={<Clock size={20} className="text-white" />}
          watermark={<Clock size={52} />}
          label={t("Chờ kế toán duyệt")}
          value={k ? fmtSo(k.cho_ke_toan.so_luong) : "…"}
          xuHuong={k?.cho_ke_toan.xu_huong}
          moTaXuHuong={moTaKy}
          tangLaXau
          subtext={k ? t("Giá trị: {x}", { x: fmtGiaTriDong(k.cho_ke_toan.gia_tri) }) : undefined}
          onClick={diToi("viec-can-lam", { tab: "cho-duyet" })}
        />
      </div>

      {/* Tang 3: bieu do + luong */}
      <div className="middle-grid">
        <div className="content-card chart-monthly-card">
          <div className="card-header">
            <div className="card-title-wrap">
              <BarChart2 size={17} className="card-title-icon text-teal" />
              <h2 className="card-title">{t("Giá trị tài sản theo tháng")}</h2>
            </div>
            <div className="chart-legend-group">
              <div className="legend-item">
                <span className="legend-line-dot"></span>
                <span className="legend-label">{t("Tổng giá trị")}</span>
              </div>
              <div className="legend-item">
                <span className="legend-bar-square"></span>
                <span className="legend-label">{t("Chi phí mua sắm")}</span>
              </div>
              <ChonLoc className="chart-dropdown" value={soThang} onChange={(e) => setSoThang(Number(e.target.value))} aria-label={t("Số tháng")}>
                <option value={12}>{t("12 tháng")}</option>
                <option value={6}>{t("6 tháng")}</option>
              </ChonLoc>
            </div>
          </div>
          {data ? <BieuDoThang data={thang} /> : <div className="monthly-chart-wrap" />}
          {data && data.ts_thieu_ngay_mua > 0 && (
            <div className="chart-note" title={t("Tài sản nhập từ dữ liệu cũ không có ngày mua được tính vào giá trị đầu kỳ, không tính vào chi phí mua sắm theo tháng.")}>
              * {fmtSo(data.ts_thieu_ngay_mua)} {t("tài sản thiếu ngày mua - tính vào giá trị đầu kỳ")}
            </div>
          )}
        </div>

        <div className="content-card donut-card">
          <div className="card-header">
            <div className="card-title-wrap">
              <PieChart size={17} className="card-title-icon text-teal" />
              <h2 className="card-title">{t("Phân bổ theo nhóm tài sản")}</h2>
            </div>
          </div>
          <Donut
            nhom={data?.theo_nhom ?? []}
            onChon={(n) => {
              if (n.loai === "tieu_hao") diToi("cap-phat", { tab: "ton-kho" })?.();
              else if (n.loai === "nhom" && n.nhom_id != null) diToi("tai-san", { nhom_id: String(n.nhom_id) })?.();
              else diToi("tai-san")?.();
            }}
          />
        </div>

        <div className="content-card flow-card">
          <div className="card-header">
            <div className="card-title-wrap">
              <GitBranch size={17} className="card-title-icon text-teal" />
              <h2 className="card-title">{t("Luồng tài sản")}</h2>
            </div>
          </div>
          <div className="flow-content-layout">
            <div className="flow-top-row">
              <NutLuong so={data?.luong.nhap_hang ?? 0} onClick={diToi("cap-phat", { tab: "phieu" })}>
                <div className="flow-icon-circle bg-cyan-light">
                  <ShoppingCart size={17} className="text-teal" />
                </div>
                <div className="flow-node-title">{t("Nhập hàng")}</div>
                <div className="flow-node-desc">{t("(từ bên ngoài)")}</div>
              </NutLuong>
              <div className="flow-arrow-horizontal">→</div>
              <NutLuong so={data?.luong.cho_ke_toan ?? 0} onClick={diToi("viec-can-lam", { tab: "cho-duyet" })}>
                <div className="flow-icon-circle bg-cyan-light">
                  <FileText size={17} className="text-teal" />
                </div>
                <div className="flow-node-title">{t("Chờ KT")}</div>
                <div className="flow-node-desc">{t("duyệt")}</div>
              </NutLuong>
              <div className="flow-arrow-horizontal">→</div>
              <NutLuong so={data?.luong.kho_hcns ?? 0} onClick={diToi("tai-san", { trang_thai: "Trong kho" })}>
                <div className="flow-icon-circle bg-cyan-light">
                  <Store size={17} className="text-teal" />
                </div>
                <div className="flow-node-title">{data && !data.toan_bo ? t("Trong kho") : t("Kho HCNS")}</div>
              </NutLuong>
              <div className="flow-arrow-horizontal">→</div>
              <NutLuong so={data?.luong.ban_giao ?? 0} onClick={diToi("canh-bao", { loai: "cho-ban-giao" })}>
                <div className="flow-icon-circle bg-cyan-light">
                  <UserCheck size={17} className="text-teal" />
                </div>
                <div className="flow-node-title">{t("Bàn giao")}</div>
              </NutLuong>
            </div>
            <div className="flow-down-connector">
              <span className="flow-arrow-down">↓</span>
            </div>
            <div className="flow-bottom-row">
              <NutLuong so={data?.luong.bao_hong ?? 0} onClick={diToi("bao-hong")}>
                <div className="flow-icon-circle bg-red-light">
                  <AlertTriangle size={17} className="text-red" />
                </div>
                <div className="flow-node-title">{t("Thu hồi /")}</div>
                <div className="flow-node-desc">{t("Báo hỏng")}</div>
              </NutLuong>
              <div className="flow-arrow-horizontal">←</div>
              <NutLuong so={data?.luong.xu_ly ?? 0} onClick={diToi("thanh-ly")}>
                <div className="flow-icon-circle bg-cyan-light">
                  <Trash2 size={17} className="text-teal" />
                </div>
                <div className="flow-node-title">{t("Thanh lý /")}</div>
                <div className="flow-node-desc">{t("Tiêu hủy")}</div>
              </NutLuong>
              <div className="flow-arrow-horizontal">←</div>
              <NutLuong className="flow-pill-active" so={data?.luong.dang_su_dung ?? 0} onClick={diToi("tai-san", { trang_thai: "Dang cap phat" })}>
                <User size={15} className="text-teal" />
                <div className="flow-pill-text">
                  <span>{t("Đang sử dụng /")}</span>
                  <span>{t("Đã tiêu hao")}</span>
                </div>
              </NutLuong>
            </div>
          </div>
        </div>
      </div>

      {/* Tang 4: viec can xu ly + canh bao */}
      <div className="bottom-grid">
        <div className="content-card task-card">
          <div className="card-header">
            <div className="card-title-wrap">
              <ClipboardCheck size={17} className="card-title-icon text-teal" />
              <h2 className="card-title">{t("Việc cần xử lý")}</h2>
            </div>
            <button type="button" className="card-header-link" onClick={() => navigate("viec-can-lam", { tab: tabViec })}>
              <span>{t("Xem tất cả")}</span>
              <ArrowRight size={13} />
            </button>
          </div>
          <FilterTabs<TabViec>
            value={tabViec}
            onChange={setTabViec}
            tabs={[
              { key: "tat-ca", label: t("Tất cả"), count: viec?.tabs["tat-ca"] ?? 0 },
              { key: "cho-duyet", label: t("Chờ duyệt"), count: viec?.tabs["cho-duyet"] ?? 0 },
              { key: "cap-phat", label: t("Cấp phát"), count: viec?.tabs["cap-phat"] ?? 0 },
              { key: "ban-giao", label: t("Bàn giao"), count: viec?.tabs["ban-giao"] ?? 0 },
              { key: "khac", label: t("Khác"), count: viec?.tabs.khac ?? 0 },
            ]}
          />
          <ViecTable rows={viecRows} trong={viec ? t("Không có việc cần xử lý.") : t("Đang tải…")} />
          <div className="table-footer-link-wrap">
            <button type="button" className="card-header-link" onClick={() => navigate("viec-can-lam", { tab: tabViec })}>
              <span>{t("Xem tất cả việc cần xử lý")}</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>

        <div className="content-card alert-card">
          <div className="card-header">
            <div className="card-title-wrap">
              <AlertTriangle size={17} className="card-title-icon text-red" />
              <h2 className="card-title">{t("Cảnh báo")}</h2>
            </div>
            <button type="button" className="card-header-link" onClick={() => navigate("canh-bao", khoId ? { kho_id: khoId } : undefined)}>
              <span>{t("Xem tất cả")}</span>
              <ArrowRight size={13} />
            </button>
          </div>
          <div className="alert-list">
            {!canhBao && <div className="muted small">{t("Đang tải…")}</div>}
            {canhBao?.slice(0, 5).map((cb) => (
              <CanhBaoRow key={cb.loai} cb={cb} onClick={() => navigate("canh-bao", { loai: cb.loai, ...(khoId ? { kho_id: khoId } : {}) })} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
