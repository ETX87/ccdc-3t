import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ClipboardCheck, Clock, UserCheck } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { FilterTabs } from "../components/FilterTabs";
import { ViecTable } from "../components/ViecTable";
import { useDuLieuChung } from "../lib/duLieuChung";
import { useNav } from "../lib/navigation";
import { fmtSo, homNayVN } from "../lib/format";

type TabViec = "tat-ca" | "cho-duyet" | "cap-phat" | "ban-giao" | "khac";
const TABS: TabViec[] = ["tat-ca", "cho-duyet", "cap-phat", "ban-giao", "khac"];

// Viec can lam cua nguoi dang nhap (gop theo vai tro o server: KT duyet, thu kho nhan, HCNS hoan tat,
// nguoi nhan xac nhan...). Thao tac nhanh ngay tren dong; tu choi bat buoc nhap ly do.
export function ViecCanLamScreen() {
  const { params } = useNav();
  const { viec, loi, reload } = useDuLieuChung();
  const [tab, setTab] = useState<TabViec>(TABS.includes(params.tab as TabViec) ? (params.tab as TabViec) : "tat-ca");
  const [loai, setLoai] = useState("");
  const [thoiHan, setThoiHan] = useState<"" | "qua-han" | "hom-nay">("");
  const [dangTai, setDangTai] = useState(false);

  const all = viec?.rows ?? [];
  const homNay = homNayVN();
  const dsLoai = useMemo(() => [...new Set(all.map((r) => r.loai))].sort(), [all]);

  const rows = useMemo(() => {
    let ds = tab === "tat-ca" ? all : all.filter((r) => r.tab === tab);
    if (loai) ds = ds.filter((r) => r.loai === loai);
    if (thoiHan === "qua-han") ds = ds.filter((r) => r.qua_han);
    if (thoiHan === "hom-nay") ds = ds.filter((r) => r.thoi_gian.startsWith(homNay));
    return [...ds].sort((a, b) => Number(b.qua_han) - Number(a.qua_han) || a.thoi_gian.localeCompare(b.thoi_gian));
  }, [all, tab, loai, thoiHan, homNay]);

  const choDuyet = all.filter((r) => r.tab === "cho-duyet");
  const choNhan = all.filter((r) => r.tab === "ban-giao" || r.tab === "cap-phat");
  const moiHomNay = (ds: typeof all) => ds.filter((r) => r.thoi_gian.startsWith(homNay)).length;
  const quaHan = viec?.qua_han ?? 0;

  async function lamMoi() {
    setDangTai(true);
    await reload();
    setDangTai(false);
  }

  return (
    <div className="dashboard-container">
      <PageHeader
        title="Việc cần làm"
        filters={
          <>
            <label className="header-dropdown select-dropdown">
              <select value={loai} onChange={(e) => setLoai(e.target.value)} aria-label="Loại việc">
                <option value="">Tất cả loại việc</option>
                {dsLoai.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="dropdown-arrow" />
            </label>
            <label className="header-dropdown select-dropdown">
              <select value={thoiHan} onChange={(e) => setThoiHan(e.target.value as typeof thoiHan)} aria-label="Thời hạn">
                <option value="">Mọi thời hạn</option>
                <option value="qua-han">Quá hạn 48 giờ</option>
                <option value="hom-nay">Phát sinh hôm nay</option>
              </select>
              <ChevronDown size={13} className="dropdown-arrow" />
            </label>
          </>
        }
        capNhatLuc={viec?.cap_nhat_luc}
        onRefresh={lamMoi}
        dangTai={dangTai}
      />
      {loi && <div className="alert alert-error">Không tải được danh sách việc - thử làm mới.</div>}

      <div className="kpi-grid kpi-grid-4">
        <KpiCard
          tone="cyan"
          icon={<ClipboardCheck size={20} className="text-white" />}
          watermark={<ClipboardCheck size={52} />}
          label="Tổng việc cần làm"
          value={fmtSo(all.length)}
          trend={
            <div className="kpi-trend trend-up">
              <span className="trend-bold">{fmtSo(moiHomNay(all))}</span>
              <span className="trend-sub">việc phát sinh hôm nay</span>
            </div>
          }
          subtext={`${fmtSo(viec?.tabs.khac ?? 0)} việc khác (hoàn tất, kiểm kê, bị từ chối)`}
          onClick={() => setTab("tat-ca")}
        />
        <KpiCard
          tone="yellow"
          icon={<Clock size={20} className="text-white" />}
          watermark={<Clock size={52} />}
          label="Chờ Kế toán duyệt"
          value={fmtSo(choDuyet.length)}
          trend={
            <div className="kpi-trend trend-warning">
              <span className="trend-bold">{fmtSo(moiHomNay(choDuyet))}</span>
              <span className="trend-sub">phiếu mới tạo hôm nay</span>
            </div>
          }
          subtext={`${fmtSo(choDuyet.filter((r) => r.qua_han).length)} phiếu chờ quá 48 giờ`}
          onClick={() => setTab("cho-duyet")}
        />
        <KpiCard
          tone="blue"
          icon={<UserCheck size={20} className="text-white" />}
          watermark={<UserCheck size={52} />}
          label="Chờ bàn giao / nhận"
          value={fmtSo(choNhan.length)}
          trend={
            <div className="kpi-trend">
              <span className="trend-bold">{fmtSo(viec?.tabs["cap-phat"] ?? 0)}</span>
              <span className="trend-sub">cấp phát chờ xác nhận</span>
            </div>
          }
          subtext={`${fmtSo(viec?.tabs["ban-giao"] ?? 0)} phiếu chuyển / điều chuyển chờ nhận`}
          onClick={() => setTab("ban-giao")}
        />
        <KpiCard
          tone="red"
          icon={<AlertTriangle size={20} className="text-white" />}
          watermark={<AlertTriangle size={52} />}
          label="Quá hạn xử lý"
          value={fmtSo(quaHan)}
          trend={
            <div className="kpi-trend trend-danger">
              <span className="trend-bold">Quá 48 giờ</span>
              <span className="trend-sub">chưa xử lý</span>
            </div>
          }
          subtext={quaHan ? "Cần đôn đốc ngay" : "Không có việc quá hạn"}
          onClick={() => setThoiHan("qua-han")}
        />
      </div>

      <div className="content-card task-card task-card-full">
        <div className="card-header">
          <div className="card-title-wrap">
            <ClipboardCheck size={18} className="card-title-icon text-teal" />
            <h2 className="card-title">Danh sách công việc & phiếu cần xử lý</h2>
          </div>
          <FilterTabs<TabViec>
            value={tab}
            onChange={setTab}
            tabs={[
              { key: "tat-ca", label: "Tất cả", count: viec?.tabs["tat-ca"] ?? 0 },
              { key: "cho-duyet", label: "Chờ duyệt", count: viec?.tabs["cho-duyet"] ?? 0 },
              { key: "cap-phat", label: "Cấp phát", count: viec?.tabs["cap-phat"] ?? 0 },
              { key: "ban-giao", label: "Bàn giao", count: viec?.tabs["ban-giao"] ?? 0 },
              { key: "khac", label: "Khác", count: viec?.tabs.khac ?? 0 },
            ]}
          />
        </div>
        <ViecTable
          rows={rows}
          coThaoTac
          trong={!viec ? "Đang tải…" : loai || thoiHan ? "Không có việc khớp bộ lọc." : "Không có việc cần xử lý - bạn đã làm hết!"}
        />
      </div>
    </div>
  );
}
