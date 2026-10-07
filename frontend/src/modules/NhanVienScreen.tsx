import { t } from "../lib/i18n";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Download, Network, Plus, RefreshCw, Search, UserCheck, Users, Package } from "lucide-react";
import { api } from "../api/client";
import { Modal } from "../components/Modal";
import { useAuth } from "../auth/AuthContext";
import { SearchSelect } from "../components/SearchSelect";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { FilterTabs } from "../components/FilterTabs";
import { PhanTrang, useTrangServer } from "../components/PhanTrang";
import { exportRowsToExcel } from "../lib/exportExcel";
import { fmtNgayGio, fmtSo, homNayVN } from "../lib/format";
import { useNav } from "../lib/navigation";
import { baoThayDoi, useKhiThayDoi } from "../lib/suKien";
import { thongBaoLoi } from "../lib/nhan";
import { DoiMaNhanVienModal } from "./DoiMaNhanVienModal";

interface NhanVienRow {
  ma_nv: string;
  ten_nv: string;
  bo_phan: string | null;
  chuc_vu: string | null;
  sdt: string | null;
  email_dang_nhap: string | null;
  dang_lam_viec: number;
  ma_etx: string | null;
  quan_ly_id: string | null;
  quan_ly_ten: string | null;
  so_cap_duoi: number;
  so_ts_dang_giu: number;
}
interface EtxStatus {
  last_run_at: string | null;
  last_status: string | null;
  changed_count: number;
  tai_khoan_count: number;
  last_error: string | null;
}
type Loc = "tat-ca" | "quan-ly" | "chua-co-ql" | "giu-ts";
interface ThongKeNv {
  tong: number;
  quan_ly: number;
  chua_co_ql: number;
  giu_ts: number;
  co_tk: number;
  so_ts_giu: number;
  bo_phan: string[];
}

function emptyForm() {
  return { ma_nv: "", ten_nv: "", bo_phan: "", chuc_vu: "", sdt: "", email_dang_nhap: "", quan_ly_id: "" };
}
const LOI_FORM: Record<string, string> = {
  MA_NV_EXISTS: t("Mã nhân viên này đã tồn tại."),
  QUAN_LY_LA_CHINH_MINH: t("Không thể tự làm quản lý của chính mình."),
  QUAN_LY_NOT_FOUND: t("Quản lý đã chọn không còn làm việc."),
  USER_CHUA_DANG_NHAP: t("Email này chưa từng đăng nhập hệ thống - người đó cần đăng nhập Google 1 lần trước."),
  EMAIL_DA_LIEN_KET: t("Email này đã gắn với hồ sơ nhân viên khác - 1 tài khoản chỉ gắn 1 hồ sơ (dùng “Đổi mã / gộp” nếu là cùng 1 người)."),
};

// Nhan vien & so do quan ly: danh sach NV (dong bo ETX + nhap tay), gan quan ly truc tiep (tu tao kho QL),
// lien ket tai khoan dang nhap, xem tai san dang giu. Sua / them / nghi viec: Admin + HCNS.
export function NhanVienScreen() {
  const auth = useAuth();
  const { params, navigate } = useNav();
  const canEdit = auth.status === "authenticated" && (auth.user.vai_tro === "Admin" || auth.user.vai_tro === "HCNS");

  const [rows, setRows] = useState<NhanVienRow[] | null>(null);
  const [trangThai, setTrangThai] = useState<"dang-lam" | "nghi">("dang-lam");
  const [tim, setTim] = useState(params.q ?? "");
  const [boPhan, setBoPhan] = useState("");
  const [loc, setLoc] = useState<Loc>("tat-ca");
  const [capDuoiCua, setCapDuoiCua] = useState<NhanVienRow | null>(null);
  const [tuKhoa, setTuKhoa] = useState(params.q ?? ""); // `tim` sau debounce - moi goi API
  const [tong, setTong] = useState(0);
  const [thongKe, setThongKe] = useState<ThongKeNv | null>(null);
  const [dsQuanLy, setDsQuanLy] = useState<{ ma_nv: string; ten_nv: string }[]>([]);
  const [dangTai, setDangTai] = useState(false);
  const [capNhatLuc, setCapNhatLuc] = useState<string | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingMaNv, setEditingMaNv] = useState<string | null>(null);
  const [doiMa, setDoiMa] = useState<NhanVienRow | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nghi, setNghi] = useState<NhanVienRow | null>(null);
  const [nghiLoi, setNghiLoi] = useState<string | null>(null);
  const [etx, setEtx] = useState<EtxStatus | null>(null);
  const [dongBo, setDongBo] = useState(false);

  // Bang phan trang o SERVER (50 NV/trang, loc + tim o server); KPI / so dem tab / bo phan lay tu
  // /nhan-vien/thong-ke thay vi tai ca ~1.800 ho so ve trinh duyet.
  useEffect(() => {
    const t = window.setTimeout(() => setTuKhoa(tim.trim()), 300);
    return () => window.clearTimeout(t);
  }, [tim]);
  const qsLoc = useMemo(() => {
    const p = new URLSearchParams({ trang_thai: trangThai === "nghi" ? "nghi" : "" });
    if (tuKhoa) p.set("search", tuKhoa);
    if (boPhan) p.set("bo_phan", boPhan);
    if (loc !== "tat-ca") p.set("loc", loc);
    if (capDuoiCua) p.set("quan_ly_id", capDuoiCua.ma_nv);
    return p.toString();
  }, [trangThai, tuKhoa, boPhan, loc, capDuoiCua]);
  const { trang, setTrang } = useTrangServer(qsLoc);

  const loadTrang = useCallback(async () => {
    setDangTai(true);
    setLoi(null);
    try {
      const res = await api.get<{ rows: NhanVienRow[]; total: number }>(`/nhan-vien?${qsLoc}&page=${trang}`);
      setRows(res.rows);
      setTong(res.total);
      setCapNhatLuc(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace("T", " "));
    } catch (e) {
      setLoi(thongBaoLoi(e, t("Không tải được danh sách nhân viên.")));
      setRows([]);
    } finally {
      setDangTai(false);
    }
  }, [qsLoc, trang]);

  const loadThongKe = useCallback(async () => {
    try {
      setThongKe(await api.get<ThongKeNv>(`/nhan-vien/thong-ke?trang_thai=${trangThai === "nghi" ? "nghi" : ""}`));
    } catch (e) {
      setLoi(thongBaoLoi(e, t("Không tải được số liệu nhân viên.")));
    }
  }, [trangThai]);

  const load = useCallback(async () => {
    await Promise.all([loadTrang(), loadThongKe()]);
  }, [loadTrang, loadThongKe]);

  useEffect(() => {
    loadTrang();
  }, [loadTrang]);
  useEffect(() => {
    loadThongKe();
  }, [loadThongKe]);
  useKhiThayDoi(load);
  useEffect(() => {
    if (canEdit) api.get<EtxStatus>("/etx-sync/status").then(setEtx).catch(() => undefined);
  }, [canEdit]);

  async function chayDongBo() {
    setDongBo(true);
    setMsg(null);
    try {
      const r = await api.post<EtxStatus>("/etx-sync/run");
      setEtx(r);
      if (r.last_status === "ok") setMsg(t("Đồng bộ ETX xong: {x} nhân viên thay đổi, {x2} tài khoản được cấp/duyệt/liên kết.", { x: fmtSo(r.changed_count), x2: fmtSo(r.tai_khoan_count) }));
      await load();
    } catch (e) {
      setLoi(thongBaoLoi(e, t("Đồng bộ ETX thất bại.")));
    } finally {
      setDongBo(false);
    }
  }

  const dsBoPhan = thongKe?.bo_phan ?? [];
  const tk = thongKe ?? { tong: 0, quan_ly: 0, chua_co_ql: 0, giu_ts: 0, co_tk: 0, so_ts_giu: 0, bo_phan: [] };

  // O chon "Quan ly truc tiep" trong form can DU nhan vien dang lam -> tai ban gon (ma + ten) khi mo form.
  useEffect(() => {
    if (!showForm) return;
    api
      .get<{ rows: { ma_nv: string; ten_nv: string }[] }>("/nhan-vien?gon=1")
      .then((r) => setDsQuanLy(r.rows))
      .catch(() => setDsQuanLy([]));
  }, [showForm]);

  function openAdd() {
    setEditingMaNv(null);
    setForm(emptyForm());
    setError(null);
    setShowForm(true);
  }
  function openEdit(row: NhanVienRow) {
    setEditingMaNv(row.ma_nv);
    setForm({
      ma_nv: row.ma_nv,
      ten_nv: row.ten_nv,
      bo_phan: row.bo_phan ?? "",
      chuc_vu: row.chuc_vu ?? "",
      sdt: row.sdt ?? "",
      email_dang_nhap: row.email_dang_nhap ?? "",
      quan_ly_id: row.quan_ly_id ?? "",
    });
    setError(null);
    setShowForm(true);
  }

  async function submitForm() {
    if (!form.ten_nv.trim() || (!editingMaNv && !form.ma_nv.trim())) {
      setError(t("Vui lòng nhập đủ Mã NV và Họ tên."));
      return;
    }
    setSaving(true);
    setError(null);
    const body = {
      ma_nv: form.ma_nv.trim(),
      ten_nv: form.ten_nv.trim(),
      bo_phan: form.bo_phan.trim() || null,
      chuc_vu: form.chuc_vu.trim() || null,
      sdt: form.sdt.trim() || null,
      email_dang_nhap: form.email_dang_nhap.trim() || null,
      quan_ly_id: form.quan_ly_id || null,
    };
    try {
      if (editingMaNv) await api.put(`/nhan-vien/${encodeURIComponent(editingMaNv)}`, body);
      else await api.post("/nhan-vien", body);
      setShowForm(false);
      setMsg(editingMaNv ? t("Đã cập nhật {ten_nv}.", { ten_nv: body.ten_nv }) : t("Đã thêm nhân viên {ten_nv}.", { ten_nv: body.ten_nv }));
      baoThayDoi();
      await load();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setError((code && LOI_FORM[code]) || thongBaoLoi(e));
    } finally {
      setSaving(false);
    }
  }

  async function xacNhanNghi() {
    if (!nghi) return;
    setNghiLoi(null);
    try {
      await api.delete(`/nhan-vien/${encodeURIComponent(nghi.ma_nv)}`);
      setMsg(t("Đã đánh dấu {ten_nv} nghỉ việc.", { ten_nv: nghi.ten_nv }));
      setNghi(null);
      baoThayDoi();
      await load();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setNghiLoi(code === "DANG_GIU_CCDC" ? t("Nhân viên đang giữ tài sản - phải lập phiếu thu hồi trước.") : thongBaoLoi(e));
    }
  }

  async function xuatExcel() {
    let tatCa: NhanVienRow[];
    try {
      tatCa = (await api.get<{ rows: NhanVienRow[] }>(`/nhan-vien?${qsLoc}`)).rows;
    } catch (e) {
      return setLoi(thongBaoLoi(e, t("Không tải được dữ liệu xuất Excel.")));
    }
    await exportRowsToExcel(
      tatCa.map((r) => ({
        ma_nv: r.ma_nv,
        ten_nv: r.ten_nv,
        bo_phan: r.bo_phan ?? "",
        chuc_vu: r.chuc_vu ?? "",
        sdt: r.sdt ?? "",
        email: r.email_dang_nhap ?? "",
        quan_ly: r.quan_ly_ten ?? "",
        cap_duoi: r.so_cap_duoi,
        ts: r.so_ts_dang_giu,
      })),
      `Nhan_vien_${homNayVN()}.xlsx`,
      "Nhan vien",
      { ma_nv: t("Mã NV"), ten_nv: t("Họ tên"), bo_phan: t("Bộ phận"), chuc_vu: t("Chức vụ"), sdt: t("SĐT"), email: t("Email đăng nhập"), quan_ly: t("Quản lý trực tiếp"), cap_duoi: t("Số cấp dưới"), ts: t("TS đang giữ") },
    );
  }

  const etxLoi = etx?.last_status === "error";

  return (
    <div className="dashboard-container">
      <PageHeader
        title={t("Nhân viên & sơ đồ quản lý")}
        filters={
          <label className="header-dropdown select-dropdown">
            <select value={trangThai} onChange={(e) => setTrangThai(e.target.value as "dang-lam" | "nghi")} aria-label={t("Trạng thái")}>
              <option value="dang-lam">{t("Đang làm việc")}</option>
              <option value="nghi">{t("Đã nghỉ việc")}</option>
            </select>
            <ChevronDown size={13} className="dropdown-arrow" />
          </label>
        }
        actions={
          <>
            <button className="btn btn-outline" onClick={xuatExcel} disabled={!tong}>
              <Download size={14} /> {t("Xuất Excel")}
            </button>
            {canEdit && (
              <>
                <button className="btn btn-outline" disabled={dongBo} onClick={chayDongBo}>
                  <RefreshCw size={14} className={dongBo ? "spin" : undefined} /> {dongBo ? t("Đang đồng bộ...") : t("Đồng bộ ETX")}
                </button>
                <button className="btn btn-primary" onClick={openAdd}>
                  <Plus size={15} /> {t("Thêm nhân viên")}
                </button>
              </>
            )}
          </>
        }
        capNhatLuc={capNhatLuc}
        onRefresh={load}
        dangTai={dangTai}
      />
      {loi && <div className="alert alert-error">{loi}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}

      <div className="kpi-grid kpi-grid-4">
        <KpiCard
          tone="cyan"
          icon={<Users size={20} className="text-white" />}
          watermark={<Users size={52} />}
          label={trangThai === "nghi" ? t("Nhân viên đã nghỉ") : t("Nhân viên đang làm việc")}
          value={fmtSo(tk.tong)}
          trend={<div className="kpi-trend"><span className="trend-sub">{fmtSo(dsBoPhan.length)} {t("bộ phận")}</span></div>}
          subtext={t("{x} người đã liên kết tài khoản đăng nhập", { x: fmtSo(tk.co_tk) })}
          onClick={() => setLoc("tat-ca")}
        />
        <KpiCard
          tone="blue-light"
          icon={<Network size={20} className="text-white" />}
          watermark={<Network size={52} />}
          label={t("Quản lý có cấp dưới")}
          value={fmtSo(tk.quan_ly)}
          trend={<div className="kpi-trend"><span className="trend-sub">{fmtSo(tk.chua_co_ql)} {t("NV chưa gán quản lý")}</span></div>}
          onClick={() => setLoc("quan-ly")}
        />
        <KpiCard
          tone="purple"
          icon={<Package size={20} className="text-white" />}
          watermark={<Package size={52} />}
          label={t("Đang giữ tài sản")}
          value={fmtSo(tk.giu_ts)}
          trend={<div className="kpi-trend"><span className="trend-sub">{fmtSo(tk.so_ts_giu)} {t("tài sản")}</span></div>}
          onClick={() => setLoc("giu-ts")}
        />
        {canEdit ? (
          <KpiCard
            tone={etxLoi ? "red" : "blue"}
            icon={<RefreshCw size={20} className="text-white" />}
            watermark={<RefreshCw size={52} />}
            label={t("Đồng bộ nhân sự ETX")}
            value={etx?.last_run_at ? (etxLoi ? t("Lỗi") : fmtNgayGio(etx.last_run_at).slice(0, 10)) : t("Chưa chạy")}
            trend={
              <div className={`kpi-trend ${etxLoi ? "trend-danger" : ""}`}>
                <span className="trend-sub" title={etx?.last_error ?? ""}>
                  {etx?.last_run_at
                    ? etxLoi
                      ? (etx.last_error ?? "").slice(0, 60)
                      : `${fmtNgayGio(etx.last_run_at).slice(11)} · ${fmtSo(etx.changed_count)} NV · ${fmtSo(etx.tai_khoan_count)} TK`
                    : t("Tự động 0h hằng ngày")}
                </span>
              </div>
            }
          />
        ) : (
          <KpiCard
            tone="blue"
            icon={<UserCheck size={20} className="text-white" />}
            watermark={<UserCheck size={52} />}
            label={t("Có tài khoản hệ thống")}
            value={fmtSo(tk.co_tk)}
          />
        )}
      </div>

      <div className="content-card task-card-full">
        <div className="card-header">
          <FilterTabs<Loc>
            value={loc}
            onChange={setLoc}
            tabs={[
              { key: "tat-ca", label: t("Tất cả"), count: tk.tong },
              { key: "quan-ly", label: t("Quản lý"), count: tk.quan_ly },
              { key: "chua-co-ql", label: t("Chưa có quản lý"), count: tk.chua_co_ql },
              { key: "giu-ts", label: t("Đang giữ tài sản"), count: tk.giu_ts },
            ]}
          />
          <div className="icon-text">
            {capDuoiCua && (
              <span className="chip">
                {t("Cấp dưới của")} {capDuoiCua.ten_nv}
                <button type="button" className="chip-remove" aria-label={t("Bỏ lọc")} onClick={() => setCapDuoiCua(null)}>
                  ×
                </button>
              </span>
            )}
            <label className="header-dropdown select-dropdown">
              <select value={boPhan} onChange={(e) => setBoPhan(e.target.value)} aria-label={t("Bộ phận")}>
                <option value="">{t("Tất cả bộ phận")}</option>
                {dsBoPhan.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="dropdown-arrow" />
            </label>
            <div className="topbar-search filter-search">
              <Search size={15} className="search-icon" />
              <input className="search-input" placeholder={t("Tìm mã, tên, bộ phận, email...")} value={tim} onChange={(e) => setTim(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="task-table-wrapper">
          <table className="task-table">
            <thead>
              <tr>
                <th style={{ width: "11%" }}>{t("Mã NV")}</th>
                <th>{t("Họ tên")}</th>
                <th style={{ width: "17%" }}>{t("Bộ phận")}</th>
                <th style={{ width: "9%" }}>{t("Chức vụ")}</th>
                <th style={{ width: "16%" }}>{t("Quản lý trực tiếp")}</th>
                <th style={{ width: "8%", textAlign: "right" }}>{t("Cấp dưới")}</th>
                <th style={{ width: "8%", textAlign: "right" }}>{t("TS giữ")}</th>
                {canEdit && trangThai === "dang-lam" && <th style={{ width: "13%", textAlign: "right" }}>{t("Thao tác")}</th>}
              </tr>
            </thead>
            <tbody>
              {rows === null && (
                <tr>
                  <td colSpan={8} className="task-empty">
                    {t("Đang tải…")}
                  </td>
                </tr>
              )}
              {rows !== null && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="task-empty">
                    {t("Không có nhân viên phù hợp.")}
                  </td>
                </tr>
              )}
              {rows?.map((r) => (
                <tr key={r.ma_nv}>
                  <td data-label={t("Mã NV")}>
                    <div className="cell-stack">
                      <span className="code-text">{r.ma_nv}</span>
                      {r.ma_etx && r.ma_etx !== r.ma_nv && <span className="small text-secondary">ETX {r.ma_etx}</span>}
                      {!r.ma_etx && <span className="small muted">{t("Chưa có mã ETX")}</span>}
                    </div>
                  </td>
                  <td data-label={t("Họ tên")}>
                    <div className="cell-stack">
                      <span className="strong">{r.ten_nv}</span>
                      {r.email_dang_nhap && <span className="small text-secondary">{r.email_dang_nhap}</span>}
                    </div>
                  </td>
                  <td data-label={t("Bộ phận")} className="text-secondary">
                    {r.bo_phan ?? "-"}
                  </td>
                  <td data-label={t("Chức vụ")}>{r.chuc_vu ?? "-"}</td>
                  <td data-label={t("Quản lý")}>
                    {r.quan_ly_id ? (
                      <span
                        className="code-link"
                        title={t("Xem nhóm của quản lý này")}
                        onClick={() => {
                          const ql = rows?.find((x) => x.ma_nv === r.quan_ly_id);
                          setCapDuoiCua(ql ?? { ...r, ma_nv: r.quan_ly_id!, ten_nv: r.quan_ly_ten ?? r.quan_ly_id! });
                          setLoc("tat-ca");
                        }}
                      >
                        {r.quan_ly_ten ?? r.quan_ly_id}
                      </span>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                  <td data-label={t("Cấp dưới")} style={{ textAlign: "right" }}>
                    {r.so_cap_duoi ? (
                      <span
                        className="code-link"
                        onClick={() => {
                          setCapDuoiCua(r);
                          setLoc("tat-ca");
                        }}
                      >
                        {fmtSo(r.so_cap_duoi)}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td data-label={t("TS giữ")} style={{ textAlign: "right" }}>
                    {r.so_ts_dang_giu ? (
                      <span className="code-link" onClick={() => navigate("tai-san", { nguoi_dang_giu: r.ma_nv, ten: r.ten_nv })}>
                        {fmtSo(r.so_ts_dang_giu)}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  {canEdit && trangThai === "dang-lam" && (
                    <td data-label={t("Thao tác")} style={{ textAlign: "right" }}>
                      <div className="row-actions">
                        <button className="btn btn-outline btn-sm" onClick={() => openEdit(r)}>
                          {t("Sửa")}
                        </button>
                        <button className="btn btn-outline btn-sm" onClick={() => setDoiMa(r)}>
                          {t("Đổi mã / gộp")}
                        </button>
                        <button
                          className="btn btn-outline btn-sm danger-outline"
                          onClick={() => {
                            setNghiLoi(null);
                            setNghi(r);
                          }}
                        >
                          {t("Nghỉ việc")}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PhanTrang
          trang={trang}
          tong={tong}
          onDoi={setTrang}
          donVi={t("nhân viên")}
          ghiChu={trangThai === "dang-lam" ? t(" · Gán quản lý trực tiếp sẽ tự tạo kho quản lý cho người đó") : null}
        />
      </div>

      {showForm && (
        <Modal title={editingMaNv ? t("Sửa nhân viên") : t("Thêm nhân viên")} onClose={() => setShowForm(false)}>
          <div className="form-grid">
            {!editingMaNv && (
              <div className="field-group">
                <label className="field-label">{t("Mã nhân viên *")}</label>
                <input type="text" value={form.ma_nv} onChange={(e) => setForm({ ...form, ma_nv: e.target.value })} autoFocus />
              </div>
            )}
            <div className="field-group">
              <label className="field-label">{t("Họ tên *")}</label>
              <input type="text" value={form.ten_nv} onChange={(e) => setForm({ ...form, ten_nv: e.target.value })} />
              {editingMaNv && rows?.find((x) => x.ma_nv === editingMaNv)?.ma_etx && (
                <span className="small muted">{t("Hồ sơ gắn ETX - họ tên, chức vụ, Gmail theo ETX (lần đồng bộ sau sẽ ghi đè nếu sửa tay).")}</span>
              )}
            </div>
            <div className="field-group">
              <label className="field-label">{t("Bộ phận")}</label>
              <input type="text" list="ds-bo-phan" value={form.bo_phan} onChange={(e) => setForm({ ...form, bo_phan: e.target.value })} />
              <datalist id="ds-bo-phan">
                {dsBoPhan.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>
            <div className="field-group">
              <label className="field-label">{t("Chức vụ")}</label>
              <input type="text" value={form.chuc_vu} onChange={(e) => setForm({ ...form, chuc_vu: e.target.value })} />
            </div>
            <div className="field-group">
              <label className="field-label">{t("Số điện thoại")}</label>
              <input type="tel" value={form.sdt} onChange={(e) => setForm({ ...form, sdt: e.target.value })} />
            </div>
            <div className="field-group">
              <label className="field-label">{t("Email đăng nhập")}</label>
              <input type="email" value={form.email_dang_nhap} onChange={(e) => setForm({ ...form, email_dang_nhap: e.target.value })} placeholder={t("Nếu có tài khoản hệ thống")} />
            </div>
          </div>
          <div className="field-group">
            <label className="field-label">{t("Quản lý trực tiếp (gán sẽ tự tạo kho quản lý cho người đó)")}</label>
            <SearchSelect
              options={[
                { value: "", label: t("-- Không có --") },
                ...dsQuanLy.filter((n) => n.ma_nv !== form.ma_nv).map((n) => ({ value: n.ma_nv, label: `${n.ten_nv} (${n.ma_nv})` })),
              ]}
              value={form.quan_ly_id}
              onChange={(v) => setForm({ ...form, quan_ly_id: v })}
              placeholder={t("Tìm quản lý...")}
            />
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="modal-actions">
            <button className="btn" onClick={() => setShowForm(false)}>
              {t("Huỷ")}
            </button>
            <button className="btn btn-primary" disabled={saving} onClick={submitForm}>
              {saving ? t("Đang lưu...") : t("Lưu")}
            </button>
          </div>
        </Modal>
      )}

      {doiMa && (
        <DoiMaNhanVienModal
          nv={doiMa}
          onClose={() => setDoiMa(null)}
          onXong={(ma) => {
            setDoiMa(null);
            setMsg(t("Đã cập nhật hồ sơ {ten_nv} → mã {ma}.", { ten_nv: doiMa.ten_nv, ma }));
            load();
          }}
        />
      )}

      {nghi && (
        <Modal title={t("Đánh dấu nghỉ việc")} onClose={() => setNghi(null)}>
          <p>
            {t("Đánh dấu")} <b>{nghi.ten_nv}</b> ({nghi.ma_nv}{t(") nghỉ việc? Nhân viên sẽ không còn xuất hiện trong danh sách chọn người nhận.")}
          </p>
          {nghi.so_ts_dang_giu > 0 && (
            <div className="alert alert-error">
              {t("Đang giữ")} {fmtSo(nghi.so_ts_dang_giu)} {t("tài sản - cần lập phiếu thu hồi trước.")}{" "}
              <button type="button" className="link-btn" onClick={() => navigate("tai-san", { nguoi_dang_giu: nghi.ma_nv, ten: nghi.ten_nv })}>
                {t("Xem tài sản")}
              </button>
            </div>
          )}
          {nghi.so_cap_duoi > 0 && <div className="alert alert-warning">{t("Đang quản lý")} {fmtSo(nghi.so_cap_duoi)} {t("nhân viên - nên gán quản lý mới cho nhóm này.")}</div>}
          {nghiLoi && <div className="alert alert-error">{nghiLoi}</div>}
          <div className="modal-actions">
            <button className="btn" onClick={() => setNghi(null)}>
              {t("Huỷ")}
            </button>
            <button className="btn btn-primary" disabled={nghi.so_ts_dang_giu > 0} onClick={xacNhanNghi}>
              {t("Xác nhận nghỉ việc")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
