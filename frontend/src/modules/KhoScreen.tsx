import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Package, Plus, Search, Store, Truck, UserPlus, X } from "lucide-react";
import { api } from "../api/client";
import { useAuth, useRefreshUser } from "../auth/AuthContext";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { FilterTabs } from "../components/FilterTabs";
import { StatusBadge } from "../components/StatusBadge";
import { useNav } from "../lib/navigation";
import { duocMoTab } from "../lib/menu";
import { useKhiThayDoi } from "../lib/suKien";
import { fmtGiaTri, fmtGiaTriDong, fmtSo } from "../lib/format";
import { isHcns, LOAI_KHO, thongBaoLoi } from "../lib/nhan";
import type { LoaiKho } from "../types";

interface TongHopKho {
  id: number;
  ten_kho: string;
  loai: LoaiKho;
  bat_tat: number;
  nhan_vien_ten: string | null;
  ts_trong_kho: number;
  gt_ts: number;
  so_mat_hang: number;
  gt_tieu_hao: number;
  ton_am: number;
  cho_nhan: number;
  cho_nhan_qua_han: number;
}

interface KhoRow {
  id: number;
  ten_kho: string;
  loai: LoaiKho;
  nhan_vien_id: string | null;
  nhan_vien_ten: string | null;
  bat_tat: number;
  ghi_chu: string | null;
  thu_kho: string[];
}

type Tab = "ton" | "cau-hinh";

// Kho & ton: so lieu that tung kho (/kho/tong-hop, loc theo quyen) + cau hinh kho / thu kho (HCNS, Admin).
export function KhoScreen() {
  const auth = useAuth();
  const { params, navigate } = useNav();
  const user = auth.status === "authenticated" ? auth.user : null;
  const quanTriKho = !!user && isHcns(user);
  const [tab, setTab] = useState<Tab>(params.tab === "cau-hinh" && quanTriKho ? "cau-hinh" : "ton");
  const [tongHop, setTongHop] = useState<{ cap_nhat_luc: string; rows: TongHopKho[] } | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [loaiLoc, setLoaiLoc] = useState("");
  const [tim, setTim] = useState("");
  const [anKhoTrong, setAnKhoTrong] = useState(true);

  const load = useCallback(async () => {
    setDangTai(true);
    setLoi(null);
    try {
      setTongHop(await api.get<{ cap_nhat_luc: string; rows: TongHopKho[] }>("/kho/tong-hop"));
    } catch (e) {
      setLoi(thongBaoLoi(e, "Không tải được số liệu kho."));
    } finally {
      setDangTai(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useKhiThayDoi(load);

  const rows = tongHop?.rows ?? [];
  const hoatDong = rows.filter((k) => k.bat_tat);
  const tong = useMemo(
    () =>
      hoatDong.reduce(
        (a, k) => ({
          ts: a.ts + k.ts_trong_kho,
          gtTs: a.gtTs + k.gt_ts,
          mh: a.mh + k.so_mat_hang,
          gtTh: a.gtTh + k.gt_tieu_hao,
          am: a.am + k.ton_am,
          choNhan: a.choNhan + k.cho_nhan,
          quaHan: a.quaHan + k.cho_nhan_qua_han,
        }),
        { ts: 0, gtTs: 0, mh: 0, gtTh: 0, am: 0, choNhan: 0, quaHan: 0 },
      ),
    [hoatDong],
  );
  const demLoai = (l: LoaiKho) => hoatDong.filter((k) => k.loai === l).length;

  const khoConSoLieu = (k: TongHopKho) => k.ts_trong_kho || k.so_mat_hang || k.ton_am || k.cho_nhan;
  const hienThi = rows.filter(
    (k) =>
      (!loaiLoc || k.loai === loaiLoc) &&
      (!tim.trim() || k.ten_kho.toLowerCase().includes(tim.trim().toLowerCase())) &&
      (!anKhoTrong || khoConSoLieu(k) || k.loai !== "Quan ly"),
  );
  const soKhoTrongAn = rows.filter((k) => k.loai === "Quan ly" && !khoConSoLieu(k)).length;
  const coTab = (t: Parameters<typeof duocMoTab>[1]) => !!user && duocMoTab(user, t);

  return (
    <div className="dashboard-container">
      <PageHeader
        title="Kho & tồn"
        filters={
          quanTriKho ? (
            <FilterTabs<Tab>
              value={tab}
              onChange={setTab}
              tabs={[
                { key: "ton", label: "Tồn theo kho" },
                { key: "cau-hinh", label: "Cấu hình kho & thủ kho" },
              ]}
            />
          ) : undefined
        }
        capNhatLuc={tongHop?.cap_nhat_luc}
        onRefresh={load}
        dangTai={dangTai}
      />
      {loi && <div className="alert alert-error">{loi}</div>}

      <div className="kpi-grid kpi-grid-4">
        <KpiCard
          tone="cyan"
          icon={<Store size={20} className="text-white" />}
          watermark={<Store size={52} />}
          label={tongHop && !quanTriKho ? "Kho tôi phụ trách" : "Kho đang hoạt động"}
          value={fmtSo(hoatDong.length)}
          trend={
            <div className="kpi-trend">
              <span className="trend-sub">
                {demLoai("HCNS")} HCNS · {demLoai("Mien")} miền · {demLoai("Quan ly")} quản lý
              </span>
            </div>
          }
          subtext={rows.length > hoatDong.length ? `${rows.length - hoatDong.length} kho đã ngừng` : "Không có kho ngừng hoạt động"}
          onClick={() => setTab("ton")}
        />
        <KpiCard
          tone="blue-light"
          icon={<Package size={20} className="text-white" />}
          watermark={<Package size={52} />}
          label="Tài sản cố định trong kho"
          value={fmtSo(tong.ts)}
          trend={<div className="kpi-trend"><span className="trend-sub">Sẵn sàng cấp phát / điều chuyển</span></div>}
          subtext={`Giá trị: ${fmtGiaTriDong(tong.gtTs)}`}
          onClick={coTab("tai-san") ? () => navigate("tai-san", { trang_thai: "Trong kho" }) : undefined}
        />
        <KpiCard
          tone="purple"
          icon={<Store size={20} className="text-white" />}
          watermark={<Store size={52} />}
          label="Tồn tiêu hao (giá tham khảo)"
          value={fmtGiaTri(tong.gtTh)}
          trend={
            tong.am > 0 ? (
              <div className="kpi-trend trend-warning">
                <span className="trend-bold">{fmtSo(tong.am)}</span>
                <span className="trend-sub">vật tư tồn âm cần điều chỉnh</span>
              </div>
            ) : (
              <div className="kpi-trend trend-up">
                <span className="trend-sub">Không có vật tư tồn âm</span>
              </div>
            )
          }
          subtext={`${fmtSo(tong.mh)} dòng tồn (mặt hàng × kho)`}
          onClick={coTab("cap-phat") ? () => navigate("cap-phat", { tab: "ton-kho" }) : undefined}
        />
        <KpiCard
          tone={tong.quaHan ? "red" : "yellow"}
          icon={<Truck size={20} className="text-white" />}
          watermark={<Truck size={52} />}
          label="Phiếu chuyển kho chờ nhận"
          value={fmtSo(tong.choNhan)}
          tangLaXau
          trend={
            <div className={`kpi-trend ${tong.quaHan ? "trend-danger" : ""}`}>
              <span className="trend-bold">{fmtSo(tong.quaHan)}</span>
              <span className="trend-sub">phiếu quá 48 giờ</span>
            </div>
          }
          subtext="Kho nhận xác nhận ở Việc cần làm"
          onClick={() => navigate("viec-can-lam", { tab: "ban-giao" })}
        />
      </div>

      {tab === "ton" ? (
        <div className="content-card task-card-full">
          <div className="card-header">
            <div className="card-title-wrap">
              <Store size={18} className="card-title-icon text-teal" />
              <h2 className="card-title">Tồn theo kho</h2>
            </div>
          </div>
          <div className="filter-bar">
            <div className="topbar-search filter-search">
              <Search size={15} className="search-icon" />
              <input className="search-input" placeholder="Tìm tên kho..." value={tim} onChange={(e) => setTim(e.target.value)} />
            </div>
            <label className="header-dropdown select-dropdown">
              <select value={loaiLoc} onChange={(e) => setLoaiLoc(e.target.value)} aria-label="Loại kho">
                <option value="">Tất cả loại kho</option>
                <option value="HCNS">{LOAI_KHO.HCNS}</option>
                <option value="Mien">{LOAI_KHO.Mien}</option>
                <option value="Quan ly">{LOAI_KHO["Quan ly"]}</option>
              </select>
              <ChevronDown size={13} className="dropdown-arrow" />
            </label>
            {soKhoTrongAn > 0 && (
              <label className="check-label">
                <input type="checkbox" checked={anKhoTrong} onChange={(e) => setAnKhoTrong(e.target.checked)} />
                Ẩn {soKhoTrongAn} kho quản lý chưa có hàng
              </label>
            )}
          </div>
          <div className="task-table-wrapper">
            <table className="task-table">
              <thead>
                <tr>
                  <th style={{ width: "24%" }}>Kho</th>
                  <th style={{ width: "10%" }}>Loại</th>
                  <th style={{ width: "14%", textAlign: "right" }}>TSCĐ trong kho</th>
                  <th style={{ width: "14%", textAlign: "right" }}>Tồn tiêu hao</th>
                  <th style={{ width: "9%", textAlign: "center" }}>Tồn âm</th>
                  <th style={{ width: "11%", textAlign: "center" }}>Chờ nhận</th>
                  <th style={{ width: "18%", textAlign: "right" }}>Xem</th>
                </tr>
              </thead>
              <tbody>
                {!tongHop && (
                  <tr>
                    <td colSpan={7} className="task-empty">
                      Đang tải…
                    </td>
                  </tr>
                )}
                {tongHop && hienThi.length === 0 && (
                  <tr>
                    <td colSpan={7} className="task-empty">
                      Không có kho khớp bộ lọc.
                    </td>
                  </tr>
                )}
                {hienThi.map((k) => (
                  <tr key={k.id}>
                    <td data-label="Kho">
                      <span className="icon-text strong">
                        <span className="type-icon-dot bg-blue-circle">
                          <Store size={11} className="text-blue-icon" />
                        </span>
                        {k.ten_kho}
                      </span>
                      {!k.bat_tat && <span className="muted small"> (đã ngừng)</span>}
                    </td>
                    <td data-label="Loại" className="text-secondary">
                      {LOAI_KHO[k.loai]}
                    </td>
                    <td data-label="TSCĐ trong kho" style={{ textAlign: "right" }}>
                      <div className="strong">{fmtSo(k.ts_trong_kho)}</div>
                      {k.gt_ts > 0 && <div className="muted small">{fmtGiaTri(k.gt_ts)}</div>}
                    </td>
                    <td data-label="Tồn tiêu hao" style={{ textAlign: "right" }}>
                      <div className="strong">{fmtSo(k.so_mat_hang)} mặt hàng</div>
                      {k.gt_tieu_hao > 0 && <div className="muted small">{fmtGiaTri(k.gt_tieu_hao)}</div>}
                    </td>
                    <td data-label="Tồn âm" style={{ textAlign: "center" }}>
                      {k.ton_am ? <StatusBadge label={String(k.ton_am)} tone="danger" /> : <span className="muted">0</span>}
                    </td>
                    <td data-label="Chờ nhận" style={{ textAlign: "center" }}>
                      {k.cho_nhan ? (
                        <StatusBadge label={`${k.cho_nhan}${k.cho_nhan_qua_han ? ` (${k.cho_nhan_qua_han} quá hạn)` : ""}`} tone={k.cho_nhan_qua_han ? "danger" : "warning"} />
                      ) : (
                        <span className="muted">0</span>
                      )}
                    </td>
                    <td data-label="Xem" style={{ textAlign: "right" }}>
                      <div className="row-actions">
                        {coTab("tai-san") && k.ts_trong_kho > 0 && (
                          <button className="btn btn-outline btn-sm" onClick={() => navigate("tai-san", { kho_id: String(k.id), trang_thai: "Trong kho" })}>
                            TSCĐ
                          </button>
                        )}
                        {coTab("cap-phat") && (
                          <button className="btn btn-outline btn-sm" onClick={() => navigate("cap-phat", { tab: "ton-kho", kho_id: String(k.id) })}>
                            Tồn tiêu hao
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <CauHinhKho />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
function CauHinhKho() {
  const refreshUser = useRefreshUser();
  const [rows, setRows] = useState<KhoRow[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [tenMoi, setTenMoi] = useState("");
  const [loaiMoi, setLoaiMoi] = useState<LoaiKho>("Mien");
  const [emailThuKho, setEmailThuKho] = useState<Record<number, string>>({});
  const [xoa, setXoa] = useState<{ kho: KhoRow; email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showQl, setShowQl] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows((await api.get<{ rows: KhoRow[] }>("/kho")).rows);
    } catch (e) {
      setError(thongBaoLoi(e));
      setRows([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setError(null);
    setMsg(null);
    try {
      await fn();
      await load();
      await refreshUser();
      setMsg(ok);
    } catch (e) {
      setError(thongBaoLoi(e));
    }
  }

  const soKhoQl = (rows ?? []).filter((k) => k.loai === "Quan ly").length;
  const hienThi = (rows ?? []).filter((k) => showQl || k.loai !== "Quan ly");

  return (
    <div className="content-card task-card-full">
      <div className="card-header">
        <div className="card-title-wrap">
          <Store size={18} className="card-title-icon text-teal" />
          <h2 className="card-title">Danh sách kho & phân quyền thủ kho</h2>
        </div>
        <div className="row-actions">
          <label className="check-label">
            <input type="checkbox" checked={showQl} onChange={(e) => setShowQl(e.target.checked)} />
            Hiện {soKhoQl} kho quản lý
          </label>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={15} /> Thêm kho mới
          </button>
        </div>
      </div>
      <div className="alert alert-info">
        Chuỗi điều chuyển: Kho mua hàng → <b>Kho HCNS</b> → <b>Kho miền</b> → <b>Kho quản lý</b> → Nhân viên. Kho quản lý tự tạo khi gán quản lý trực tiếp ở
        màn Nhân viên; thủ kho được phân quyền theo email đăng nhập.
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}
      <div className="task-table-wrapper">
        <table className="task-table">
          <thead>
            <tr>
              <th style={{ width: "22%" }}>Tên kho</th>
              <th style={{ width: "14%" }}>Loại kho</th>
              <th style={{ width: "40%" }}>Thủ kho phụ trách</th>
              <th style={{ width: "12%", textAlign: "center" }}>Trạng thái</th>
              <th style={{ width: "12%", textAlign: "right" }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr>
                <td colSpan={5} className="task-empty">
                  Đang tải…
                </td>
              </tr>
            )}
            {hienThi.map((k) => (
              <tr key={k.id}>
                <td data-label="Tên kho" className="strong">
                  {k.ten_kho}
                </td>
                <td data-label="Loại kho">
                  <span className="status-badge badge-cyan-solid">{LOAI_KHO[k.loai]}</span>
                </td>
                <td data-label="Thủ kho">
                  <div className="cell-stack">
                    {k.loai === "Quan ly" && k.nhan_vien_ten && <div className="muted small">Quản lý chủ kho: {k.nhan_vien_ten}</div>}
                    {k.loai === "HCNS" && <div className="muted small">Mọi tài khoản HCNS / Admin</div>}
                    {k.loai === "Mua hang" && <div className="muted small">Kho nguồn ảo - chỉ dùng cho phiếu nhập mua</div>}
                    {k.thu_kho.length > 0 && (
                      <div className="chip-list">
                        {k.thu_kho.map((e) => (
                          <span key={e} className="chip">
                            {e}
                            <button type="button" className="chip-remove" title="Bỏ quyền thủ kho" onClick={() => setXoa({ kho: k, email: e })}>
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    {k.loai !== "Mua hang" && (
                      <form
                        className="inline-form"
                        onSubmit={(ev) => {
                          ev.preventDefault();
                          const email = emailThuKho[k.id]?.trim();
                          if (email)
                            run(async () => {
                              await api.post(`/kho/${k.id}/thu-kho`, { email });
                              setEmailThuKho({ ...emailThuKho, [k.id]: "" });
                            }, `Đã gán ${email} làm thủ kho ${k.ten_kho}.`);
                        }}
                      >
                        <input
                          type="email"
                          placeholder="Email thủ kho…"
                          value={emailThuKho[k.id] ?? ""}
                          onChange={(e) => setEmailThuKho({ ...emailThuKho, [k.id]: e.target.value })}
                        />
                        <button type="submit" className="btn btn-outline btn-sm" disabled={!emailThuKho[k.id]?.trim()}>
                          <UserPlus size={12} /> Gán
                        </button>
                      </form>
                    )}
                  </div>
                </td>
                <td data-label="Trạng thái" style={{ textAlign: "center" }}>
                  <StatusBadge label={k.bat_tat ? "Hoạt động" : "Ngừng"} tone={k.bat_tat ? "success" : "neutral"} />
                </td>
                <td data-label="Thao tác" style={{ textAlign: "right" }}>
                  {k.id > 2 && (
                    <button
                      className={`btn btn-outline btn-sm ${k.bat_tat ? "danger-outline" : ""}`}
                      onClick={() =>
                        run(
                          () => api.put(`/kho/${k.id}`, { ten_kho: k.ten_kho, ghi_chu: k.ghi_chu, bat_tat: !k.bat_tat }),
                          `${k.bat_tat ? "Đã ngừng" : "Đã kích hoạt"} ${k.ten_kho}.`,
                        )
                      }
                    >
                      {k.bat_tat ? "Ngừng" : "Kích hoạt"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <Modal title="Thêm kho mới" onClose={() => setShowAdd(false)}>
          <div className="field-group">
            <label className="field-label">Tên kho *</label>
            <input type="text" value={tenMoi} onChange={(e) => setTenMoi(e.target.value)} placeholder="vd: Kho vận Miền Trung" autoFocus />
          </div>
          <div className="field-group">
            <label className="field-label">Loại kho</label>
            <select value={loaiMoi} onChange={(e) => setLoaiMoi(e.target.value as LoaiKho)}>
              <option value="Mien">Kho miền</option>
              <option value="HCNS">Kho HCNS</option>
              <option value="Mua hang">Kho mua hàng (nguồn nhập)</option>
            </select>
            <div className="field-hint">Kho quản lý được tạo tự động khi gán quản lý trực tiếp cho nhân viên.</div>
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => setShowAdd(false)}>
              Hủy
            </button>
            <button
              className="btn btn-primary"
              disabled={!tenMoi.trim()}
              onClick={() =>
                run(async () => {
                  await api.post("/kho", { ten_kho: tenMoi.trim(), loai: loaiMoi });
                  setShowAdd(false);
                  setTenMoi("");
                }, `Đã thêm kho ${tenMoi.trim()}.`)
              }
            >
              Lưu kho
            </button>
          </div>
        </Modal>
      )}

      {xoa && (
        <Modal title="Bỏ quyền thủ kho" onClose={() => setXoa(null)}>
          <p>
            <AlertTriangle size={14} className="text-orange" /> Bỏ quyền thủ kho của <b>{xoa.email}</b> tại <b>{xoa.kho.ten_kho}</b>? Người này sẽ không còn
            nhận/xuất hàng cho kho.
          </p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setXoa(null)}>
              Hủy
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                const x = xoa;
                setXoa(null);
                run(() => api.delete(`/kho/${x.kho.id}/thu-kho/${encodeURIComponent(x.email)}`), `Đã bỏ quyền thủ kho của ${x.email}.`);
              }}
            >
              Bỏ quyền
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
