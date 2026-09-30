import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Box, ChevronDown, Download, Edit, FolderPlus, Plus, QrCode, Search, Store, Trash2, User } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { FilterTabs } from "../components/FilterTabs";
import { StatusBadge } from "../components/StatusBadge";
import { useChiTiet } from "../components/ChiTiet";
import { exportRowsToExcel } from "../lib/exportExcel";
import { inTemQr } from "../lib/inTem";
import { useNav } from "../lib/navigation";
import { baoThayDoi, useKhiThayDoi } from "../lib/suKien";
import { fmtGiaTriDong, fmtNgay, fmtSo, homNayVN } from "../lib/format";
import { isHcns, thongBaoLoi, TINH_TRANG_TS, TRANG_THAI_TS } from "../lib/nhan";

// Danh muc tai san co dinh: KPI + dem theo trang thai lay tu /ccdc/thong-ke (cung bo loc, khong phu thuoc
// so dong dang hien), bam ma -> popup chi tiet (lich su, QR, bao hong), in tem QR hang loat.

const EXPORT_HEADERS: Record<string, string> = {
  id: "Mã tài sản",
  ten_ccdc: "Tên tài sản",
  ten_nhom: "Nhóm",
  don_vi_tinh: "Đơn vị tính",
  so_seri: "Số seri",
  ngay_mua: "Ngày mua",
  nguyen_gia: "Nguyên giá",
  nha_cung_cap: "Nhà cung cấp",
  han_bao_hanh: "Hạn bảo hành",
  tinh_trang: "Tình trạng",
  trang_thai_hien_tai: "Trạng thái",
  nguoi_dang_giu_ten: "Người đang giữ",
  ten_kho: "Kho",
  ghi_chu: "Ghi chú",
};

interface NhomCcdc {
  id: number;
  ten_nhom: string;
  bat_tat: number;
  stt: number;
}

interface CcdcRow {
  id: string;
  ten_ccdc: string;
  nhom_id: number | null;
  ten_nhom: string | null;
  don_vi_tinh: string | null;
  so_seri: string | null;
  ngay_mua: string | null;
  nguyen_gia: number | null;
  nha_cung_cap: string | null;
  han_bao_hanh: string | null;
  tinh_trang: string;
  trang_thai_hien_tai: string;
  nguoi_dang_giu: string | null;
  nguoi_dang_giu_ten: string | null;
  kho_id: number | null;
  ten_kho: string | null;
  ghi_chu: string | null;
}

interface ThongKe {
  theo_trang_thai: { trang_thai: string; so_luong: number; gia_tri: number }[];
  bao_hong_cho_duyet: number;
}

interface KhoRow {
  id: number;
  ten_kho: string;
  loai: string;
  bat_tat: number;
}

const TRANG = 100;
const NHOM_XU_LY = ["Hong", "Cho duyet bao hong", "Cho thanh ly", "Cho tieu huy"];

function emptyForm() {
  return {
    id: "",
    ten_ccdc: "",
    nhom_id: "",
    don_vi_tinh: "Cái",
    so_seri: "",
    ngay_mua: homNayVN(),
    nguyen_gia: "",
    nha_cung_cap: "",
    han_bao_hanh: "",
    tinh_trang: "Tot",
    ghi_chu: "",
  };
}

export function DanhMucCcdcScreen() {
  const auth = useAuth();
  const { params } = useNav();
  const { moTaiSan } = useChiTiet();
  const user = auth.status === "authenticated" ? auth.user : null;
  const canEdit = !!user && isHcns(user);

  const [nhoms, setNhoms] = useState<NhomCcdc[]>([]);
  const [khos, setKhos] = useState<KhoRow[]>([]);
  const [rows, setRows] = useState<CcdcRow[] | null>(null);
  const [thongKe, setThongKe] = useState<ThongKe | null>(null);
  const [search, setSearch] = useState(params.q ?? "");
  const [tuKhoa, setTuKhoa] = useState(params.q ?? ""); // gia tri da "chot" (debounce) de goi API
  const [nhomFilter, setNhomFilter] = useState(params.nhom_id ?? "");
  const [khoFilter, setKhoFilter] = useState(params.kho_id ?? "");
  const [trangThai, setTrangThai] = useState(params.trang_thai ?? "");
  // Loc theo nguoi dang giu (tu bao cao "Theo nhan vien" / "Tai san cua nhom") - hien dang chip bo duoc.
  const [nguoiGiu, setNguoiGiu] = useState(params.nguoi_dang_giu ?? "");
  const [soDong, setSoDong] = useState(TRANG);
  const [chon, setChon] = useState<Set<string>>(new Set());
  const [dangTai, setDangTai] = useState(false);
  const [capNhatLuc, setCapNhatLuc] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loi, setLoi] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formLoi, setFormLoi] = useState<string | null>(null);
  const [xoa, setXoa] = useState<CcdcRow | null>(null);
  const [showNhom, setShowNhom] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setTuKhoa(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const loadNhoms = useCallback(async () => {
    const r = await api.get<{ rows: NhomCcdc[] }>("/nhom-ccdc").catch(() => ({ rows: [] as NhomCcdc[] }));
    setNhoms(r.rows);
  }, []);

  useEffect(() => {
    loadNhoms();
    api
      .get<{ rows: KhoRow[] }>("/kho")
      .then((r) => setKhos(r.rows.filter((k) => k.bat_tat && k.loai !== "Mua hang")))
      .catch(() => setKhos([]));
  }, [loadNhoms]);

  const load = useCallback(async () => {
    setDangTai(true);
    setLoi(null);
    const p = new URLSearchParams();
    if (tuKhoa) p.set("q", tuKhoa);
    if (nhomFilter) p.set("nhom_id", nhomFilter);
    if (khoFilter) p.set("kho_id", khoFilter);
    if (nguoiGiu) p.set("nguoi_dang_giu", nguoiGiu);
    const pDs = new URLSearchParams(p);
    if (trangThai) pDs.set("trang_thai", trangThai);
    try {
      const [ds, tk] = await Promise.all([api.get<{ rows: CcdcRow[] }>(`/ccdc?${pDs}`), api.get<ThongKe>(`/ccdc/thong-ke?${p}`)]);
      setRows(ds.rows);
      setThongKe(tk);
      setSoDong(TRANG);
      setChon(new Set());
      setCapNhatLuc(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace("T", " "));
    } catch (e) {
      setLoi(thongBaoLoi(e, "Không tải được danh sách tài sản."));
      setRows([]);
    } finally {
      setDangTai(false);
    }
  }, [tuKhoa, nhomFilter, khoFilter, trangThai, nguoiGiu]);

  useEffect(() => {
    load();
  }, [load]);
  useKhiThayDoi(load);

  // ---- So lieu KPI / tab tu thong-ke (toan bo ket qua loc, khong chi so dong dang hien) ----
  const tt = useMemo(() => {
    const m = new Map((thongKe?.theo_trang_thai ?? []).map((r) => [r.trang_thai, r]));
    const lay = (ks: string[]) =>
      ks.reduce((a, k) => ({ so_luong: a.so_luong + (m.get(k)?.so_luong ?? 0), gia_tri: a.gia_tri + (m.get(k)?.gia_tri ?? 0) }), { so_luong: 0, gia_tri: 0 });
    const conQuanLy = [...m.keys()].filter((k) => k !== "Da thanh ly" && k !== "Da tieu huy");
    return {
      tong: lay(conQuanLy),
      dangDung: lay(["Dang cap phat"]),
      trongKho: lay(["Trong kho"]),
      xuLy: lay(NHOM_XU_LY),
      hong: lay(["Hong"]),
      tabs: [...m.values()].sort((a, b) => b.so_luong - a.so_luong),
    };
  }, [thongKe]);

  const hienThi = rows?.slice(0, soDong) ?? [];

  // ---- Form them / sua ----
  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setFormLoi(null);
    setShowForm(true);
  }
  function openEdit(r: CcdcRow) {
    setEditingId(r.id);
    setForm({
      id: r.id,
      ten_ccdc: r.ten_ccdc,
      nhom_id: r.nhom_id != null ? String(r.nhom_id) : "",
      don_vi_tinh: r.don_vi_tinh ?? "",
      so_seri: r.so_seri ?? "",
      ngay_mua: r.ngay_mua?.slice(0, 10) ?? "",
      nguyen_gia: r.nguyen_gia != null ? String(r.nguyen_gia) : "",
      nha_cung_cap: r.nha_cung_cap ?? "",
      han_bao_hanh: r.han_bao_hanh?.slice(0, 10) ?? "",
      tinh_trang: r.tinh_trang || "Tot",
      ghi_chu: r.ghi_chu ?? "",
    });
    setFormLoi(null);
    setShowForm(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.id.trim() || !form.ten_ccdc.trim()) {
      setFormLoi("Mã và tên tài sản là bắt buộc.");
      return;
    }
    setSaving(true);
    setFormLoi(null);
    const rong = (v: string) => (v.trim() === "" ? null : v.trim());
    const payload = {
      id: form.id.trim(),
      ten_ccdc: form.ten_ccdc.trim(),
      nhom_id: form.nhom_id === "" ? null : Number(form.nhom_id),
      don_vi_tinh: rong(form.don_vi_tinh),
      so_seri: rong(form.so_seri),
      ngay_mua: rong(form.ngay_mua),
      nguyen_gia: form.nguyen_gia === "" ? null : Number(form.nguyen_gia),
      nha_cung_cap: rong(form.nha_cung_cap),
      han_bao_hanh: rong(form.han_bao_hanh),
      tinh_trang: form.tinh_trang,
      ghi_chu: rong(form.ghi_chu),
    };
    try {
      if (editingId) {
        await api.put(`/ccdc/${encodeURIComponent(editingId)}`, payload);
        setMsg(`Đã cập nhật tài sản ${editingId}.`);
      } else {
        await api.post("/ccdc", payload);
        setMsg(`Đã tạo tài sản ${payload.id} - phiếu nhập đang chờ Kế toán duyệt, duyệt xong tài sản vào kho HCNS.`);
      }
      setShowForm(false);
      baoThayDoi();
    } catch (err) {
      setFormLoi(thongBaoLoi(err, "Không lưu được - vui lòng thử lại."));
    } finally {
      setSaving(false);
    }
  }

  async function voHieuHoa(r: CcdcRow) {
    try {
      await api.delete(`/ccdc/${encodeURIComponent(r.id)}`);
      setMsg(`Đã vô hiệu hoá ${r.id}.`);
      setXoa(null);
      baoThayDoi();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setLoi(
        code === "DANG_CAP_PHAT"
          ? "Tài sản đang được cấp phát - phải thu hồi trước khi vô hiệu hoá."
          : code === "DANG_CHO_DUYET"
            ? "Tài sản đang có phiếu chờ duyệt - xử lý phiếu trước."
            : thongBaoLoi(e),
      );
      setXoa(null);
    }
  }

  async function exportExcel() {
    if (!rows?.length) return;
    await exportRowsToExcel(
      rows.map((r) => ({
        id: r.id,
        ten_ccdc: r.ten_ccdc,
        ten_nhom: r.ten_nhom,
        don_vi_tinh: r.don_vi_tinh,
        so_seri: r.so_seri,
        ngay_mua: r.ngay_mua,
        nguyen_gia: r.nguyen_gia,
        nha_cung_cap: r.nha_cung_cap,
        han_bao_hanh: r.han_bao_hanh,
        tinh_trang: TINH_TRANG_TS[r.tinh_trang] ?? r.tinh_trang,
        trang_thai_hien_tai: TRANG_THAI_TS[r.trang_thai_hien_tai]?.label ?? r.trang_thai_hien_tai,
        nguoi_dang_giu_ten: r.nguoi_dang_giu_ten,
        ten_kho: r.ten_kho,
        ghi_chu: r.ghi_chu,
      })),
      `Tai_san_co_dinh_${homNayVN()}.xlsx`,
      "Danh muc tai san",
      EXPORT_HEADERS,
    );
  }

  function inTem() {
    const ds = (rows ?? []).filter((r) => chon.has(r.id));
    inTemQr((ds.length ? ds : hienThi).map((r) => ({ id: r.id, ten: r.ten_ccdc }))).then((l) => l && setLoi(l));
  }

  const tatCaDangHienDaChon = hienThi.length > 0 && hienThi.every((r) => chon.has(r.id));
  const nhomDangDung = nhoms.filter((n) => n.bat_tat);

  return (
    <div className="dashboard-container">
      <PageHeader
        title="Tài sản cố định"
        actions={
          <>
            <button className="btn btn-outline" onClick={inTem} disabled={!rows?.length} title="In tem QR các dòng đã chọn (hoặc các dòng đang hiển thị)">
              <QrCode size={14} /> In tem QR{chon.size ? ` (${chon.size})` : ""}
            </button>
            <button className="btn btn-outline" onClick={exportExcel} disabled={!rows?.length}>
              <Download size={14} /> Xuất Excel
            </button>
            {canEdit && (
              <>
                <button className="btn btn-outline" onClick={() => setShowNhom(true)}>
                  <FolderPlus size={14} /> Quản lý nhóm
                </button>
                <button className="btn btn-primary" onClick={openAdd}>
                  <Plus size={15} /> Nhập tài sản mới
                </button>
              </>
            )}
          </>
        }
        capNhatLuc={capNhatLuc}
        onRefresh={load}
        dangTai={dangTai}
      />

      <div className="kpi-grid kpi-grid-4">
        <KpiCard
          tone="cyan"
          icon={<Box size={20} className="text-white" />}
          watermark={<Box size={52} />}
          label="Tổng tài sản đang quản lý"
          value={fmtSo(tt.tong.so_luong)}
          trend={<div className="kpi-trend"><span className="trend-sub">Không tính đã thanh lý / tiêu hủy</span></div>}
          subtext={`Giá trị: ${fmtGiaTriDong(tt.tong.gia_tri)}`}
          onClick={() => setTrangThai("")}
        />
        <KpiCard
          tone="blue"
          icon={<User size={20} className="text-white" />}
          watermark={<User size={52} />}
          label="Đang sử dụng"
          value={fmtSo(tt.dangDung.so_luong)}
          trend={
            <div className="kpi-trend trend-up">
              <span className="trend-bold">{tt.tong.so_luong ? fmtSo((tt.dangDung.so_luong / tt.tong.so_luong) * 100, 1) : 0}%</span>
              <span className="trend-sub">tổng tài sản</span>
            </div>
          }
          subtext={`Giá trị: ${fmtGiaTriDong(tt.dangDung.gia_tri)}`}
          onClick={() => setTrangThai("Dang cap phat")}
        />
        <KpiCard
          tone="blue-light"
          icon={<Store size={20} className="text-white" />}
          watermark={<Store size={52} />}
          label="Trong kho"
          value={fmtSo(tt.trongKho.so_luong)}
          trend={
            <div className="kpi-trend">
              <span className="trend-bold">{tt.tong.so_luong ? fmtSo((tt.trongKho.so_luong / tt.tong.so_luong) * 100, 1) : 0}%</span>
              <span className="trend-sub">sẵn sàng cấp phát</span>
            </div>
          }
          subtext={`Giá trị: ${fmtGiaTriDong(tt.trongKho.gia_tri)}`}
          onClick={() => setTrangThai("Trong kho")}
        />
        <KpiCard
          tone="yellow"
          icon={<AlertTriangle size={20} className="text-white" />}
          watermark={<AlertTriangle size={52} />}
          label="Báo hỏng / Cần xử lý"
          value={fmtSo(tt.xuLy.so_luong)}
          tangLaXau
          trend={
            <div className="kpi-trend trend-warning">
              <span className="trend-bold">{fmtSo(thongKe?.bao_hong_cho_duyet ?? 0)}</span>
              <span className="trend-sub">phiếu báo hỏng chờ duyệt</span>
            </div>
          }
          subtext={`${fmtSo(tt.hong.so_luong)} hỏng · giá trị ${fmtGiaTriDong(tt.xuLy.gia_tri)}`}
          onClick={() => setTrangThai("Hong")}
        />
      </div>

      <div className="content-card task-card-full">
        <div className="filter-bar">
          <div className="topbar-search filter-search">
            <Search size={15} className="search-icon" />
            <input type="text" placeholder="Tìm mã, tên, số seri..." value={search} onChange={(e) => setSearch(e.target.value)} className="search-input" />
          </div>
          <label className="header-dropdown select-dropdown">
            <select value={nhomFilter} onChange={(e) => setNhomFilter(e.target.value)} aria-label="Nhóm">
              <option value="">Tất cả nhóm</option>
              {nhoms.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.ten_nhom}
                  {n.bat_tat ? "" : " (đã tắt)"}
                </option>
              ))}
            </select>
            <ChevronDown size={13} className="dropdown-arrow" />
          </label>
          <label className="header-dropdown select-dropdown">
            <select value={khoFilter} onChange={(e) => setKhoFilter(e.target.value)} aria-label="Kho">
              <option value="">Tất cả kho</option>
              {khos.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.ten_kho}
                </option>
              ))}
            </select>
            <ChevronDown size={13} className="dropdown-arrow" />
          </label>
          {nguoiGiu && (
            <span className="chip">
              Người giữ: {rows?.find((r) => r.nguoi_dang_giu === nguoiGiu)?.nguoi_dang_giu_ten ?? params.ten ?? nguoiGiu}
              <button type="button" className="chip-remove" aria-label="Bỏ lọc người giữ" onClick={() => setNguoiGiu("")}>
                ×
              </button>
            </span>
          )}
        </div>

        <FilterTabs
          value={trangThai}
          onChange={setTrangThai}
          tabs={[
            { key: "", label: "Tất cả", count: tt.tabs.reduce((s, t) => s + t.so_luong, 0) },
            ...tt.tabs.map((t) => ({ key: t.trang_thai, label: TRANG_THAI_TS[t.trang_thai]?.label ?? t.trang_thai, count: t.so_luong })),
            ...(trangThai && !tt.tabs.some((t) => t.trang_thai === trangThai)
              ? [{ key: trangThai, label: TRANG_THAI_TS[trangThai]?.label ?? trangThai, count: 0 }]
              : []),
          ]}
        />

        {msg && <div className="alert alert-success">{msg}</div>}
        {loi && <div className="alert alert-error">{loi}</div>}

        <div className="task-table-wrapper">
          <table className="task-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}>
                  <input
                    type="checkbox"
                    aria-label="Chọn tất cả"
                    checked={tatCaDangHienDaChon}
                    onChange={() => setChon(tatCaDangHienDaChon ? new Set() : new Set(hienThi.map((r) => r.id)))}
                  />
                </th>
                <th style={{ width: "13%" }}>Mã tài sản</th>
                <th style={{ width: "22%" }}>Tên tài sản</th>
                <th style={{ width: "14%" }}>Nhóm</th>
                <th style={{ width: "18%" }}>Vị trí / Người giữ</th>
                <th style={{ width: "11%", textAlign: "right" }}>Nguyên giá</th>
                <th style={{ width: "12%", textAlign: "center" }}>Trạng thái</th>
                <th style={{ width: "8%", textAlign: "right" }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {rows === null ? (
                <tr>
                  <td colSpan={8} className="task-empty">
                    Đang tải dữ liệu…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="task-empty">
                    Không tìm thấy tài sản nào.
                  </td>
                </tr>
              ) : (
                hienThi.map((r) => {
                  const st = TRANG_THAI_TS[r.trang_thai_hien_tai] ?? { label: r.trang_thai_hien_tai, tone: "neutral" as const };
                  return (
                    <tr key={r.id}>
                      <td data-label="Chọn">
                        <input
                          type="checkbox"
                          aria-label={`Chọn ${r.id}`}
                          checked={chon.has(r.id)}
                          onChange={() => {
                            const s = new Set(chon);
                            if (s.has(r.id)) s.delete(r.id);
                            else s.add(r.id);
                            setChon(s);
                          }}
                        />
                      </td>
                      <td data-label="Mã tài sản">
                        <span className="code-link" role="button" tabIndex={0} onClick={() => moTaiSan(r.id)}>
                          {r.id}
                        </span>
                      </td>
                      <td data-label="Tên tài sản">
                        <div className="strong">{r.ten_ccdc}</div>
                        {r.so_seri && <div className="muted small">SN: {r.so_seri}</div>}
                      </td>
                      <td data-label="Nhóm" className="text-secondary">
                        {r.ten_nhom ?? "-"}
                      </td>
                      <td data-label="Vị trí / Người giữ">
                        {r.nguoi_dang_giu_ten ? (
                          <span className="icon-text">
                            <User size={13} className="text-teal" />
                            {r.nguoi_dang_giu_ten}
                          </span>
                        ) : r.ten_kho ? (
                          <span className="icon-text text-secondary">
                            <Store size={13} />
                            {r.ten_kho}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td data-label="Nguyên giá" style={{ textAlign: "right" }}>
                        {r.nguyen_gia != null ? fmtSo(r.nguyen_gia) : "-"}
                      </td>
                      <td data-label="Trạng thái" style={{ textAlign: "center" }}>
                        <StatusBadge label={st.label} tone={st.tone} />
                      </td>
                      <td data-label="Thao tác" style={{ textAlign: "right" }}>
                        {canEdit && (
                          <div className="row-actions">
                            <button className="btn btn-outline btn-sm btn-icon" onClick={() => openEdit(r)} title="Sửa" aria-label="Sửa">
                              <Edit size={12} />
                            </button>
                            <button className="btn btn-outline btn-sm btn-icon danger-outline" onClick={() => setXoa(r)} title="Vô hiệu hoá" aria-label="Vô hiệu hoá">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {rows && rows.length > 0 && (
          <div className="table-footer-link-wrap table-footer-between">
            <span className="muted small">
              Hiển thị {fmtSo(hienThi.length)}/{fmtSo(rows.length)} tài sản{chon.size ? ` · đã chọn ${chon.size}` : ""}
            </span>
            {rows.length > soDong && (
              <button className="btn btn-outline btn-sm" onClick={() => setSoDong(soDong + TRANG)}>
                Xem thêm {fmtSo(Math.min(TRANG, rows.length - soDong))}
              </button>
            )}
          </div>
        )}
      </div>

      {showForm && (
        <Modal size="lg" title={editingId ? `Sửa tài sản ${editingId}` : "Nhập tài sản cố định mới"} onClose={() => setShowForm(false)}>
          <form onSubmit={save}>
            {formLoi && <div className="alert alert-error">{formLoi}</div>}
            {!editingId && (
              <div className="alert alert-info">Tài sản mới được tạo kèm phiếu nhập (mã NT-…) chờ Kế toán duyệt; duyệt xong tài sản vào kho HCNS.</div>
            )}
            <div className="form-grid">
              <div className="field-group">
                <label className="field-label">Mã tài sản *</label>
                <input type="text" value={form.id} disabled={editingId !== null} onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="vd TS3T-001200" required />
              </div>
              <div className="field-group">
                <label className="field-label">Tên tài sản *</label>
                <input type="text" value={form.ten_ccdc} onChange={(e) => setForm({ ...form, ten_ccdc: e.target.value })} required />
              </div>
              <div className="field-group">
                <label className="field-label">Nhóm tài sản</label>
                <select value={form.nhom_id} onChange={(e) => setForm({ ...form, nhom_id: e.target.value })}>
                  <option value="">-- Chọn nhóm --</option>
                  {nhomDangDung.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.ten_nhom}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-group">
                <label className="field-label">Đơn vị tính</label>
                <input type="text" value={form.don_vi_tinh} onChange={(e) => setForm({ ...form, don_vi_tinh: e.target.value })} />
              </div>
              <div className="field-group">
                <label className="field-label">Số seri</label>
                <input type="text" value={form.so_seri} onChange={(e) => setForm({ ...form, so_seri: e.target.value })} />
              </div>
              <div className="field-group">
                <label className="field-label">Nguyên giá (đ)</label>
                <input type="number" min={0} value={form.nguyen_gia} onChange={(e) => setForm({ ...form, nguyen_gia: e.target.value })} />
              </div>
              <div className="field-group">
                <label className="field-label">Ngày mua</label>
                <input type="date" value={form.ngay_mua} onChange={(e) => setForm({ ...form, ngay_mua: e.target.value })} />
              </div>
              <div className="field-group">
                <label className="field-label">Nhà cung cấp</label>
                <input type="text" value={form.nha_cung_cap} onChange={(e) => setForm({ ...form, nha_cung_cap: e.target.value })} />
              </div>
              <div className="field-group">
                <label className="field-label">Hạn bảo hành</label>
                <input type="date" value={form.han_bao_hanh} onChange={(e) => setForm({ ...form, han_bao_hanh: e.target.value })} />
              </div>
              <div className="field-group">
                <label className="field-label">Tình trạng</label>
                <select value={form.tinh_trang} onChange={(e) => setForm({ ...form, tinh_trang: e.target.value })}>
                  {Object.entries(TINH_TRANG_TS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field-group">
              <label className="field-label">Ghi chú</label>
              <textarea rows={2} value={form.ghi_chu} onChange={(e) => setForm({ ...form, ghi_chu: e.target.value })} />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setShowForm(false)}>
                Hủy
              </button>
              <button type="submit" disabled={saving} className="btn btn-primary">
                {saving ? "Đang lưu…" : editingId ? "Cập nhật" : "Tạo & gửi Kế toán duyệt"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {xoa && (
        <Modal title="Vô hiệu hoá tài sản" onClose={() => setXoa(null)}>
          <p>
            Vô hiệu hoá <span className="strong">{xoa.id}</span> - {xoa.ten_ccdc}? Tài sản sẽ ẩn khỏi danh mục và báo cáo (lịch sử vẫn giữ).
          </p>
          {xoa.ngay_mua && <p className="muted small">Ngày mua {fmtNgay(xoa.ngay_mua)}</p>}
          <div className="modal-actions">
            <button className="btn" onClick={() => setXoa(null)}>
              Hủy
            </button>
            <button className="btn btn-danger" onClick={() => voHieuHoa(xoa)}>
              Vô hiệu hoá
            </button>
          </div>
        </Modal>
      )}

      {showNhom && <QuanLyNhomModal nhoms={nhoms} onClose={() => setShowNhom(false)} onDoi={loadNhoms} />}
    </div>
  );
}

function QuanLyNhomModal({ nhoms, onClose, onDoi }: { nhoms: NhomCcdc[]; onClose: () => void; onDoi: () => Promise<void> }) {
  const [moi, setMoi] = useState("");
  const [sua, setSua] = useState<{ id: number; ten: string } | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function chay(fn: () => Promise<unknown>) {
    setBusy(true);
    setLoi(null);
    try {
      await fn();
      await onDoi();
      baoThayDoi();
    } catch (e) {
      setLoi(thongBaoLoi(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Quản lý nhóm tài sản" onClose={onClose}>
      {loi && <div className="alert alert-error">{loi}</div>}
      <form
        className="qr-manual"
        style={{ marginTop: 0, marginBottom: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (moi.trim()) chay(() => api.post("/nhom-ccdc", { ten_nhom: moi.trim() })).then(() => setMoi(""));
        }}
      >
        <input type="text" placeholder="Tên nhóm mới…" value={moi} onChange={(e) => setMoi(e.target.value)} />
        <button type="submit" className="btn btn-primary" disabled={busy || !moi.trim()}>
          Thêm nhóm
        </button>
      </form>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tên nhóm</th>
              <th>Trạng thái</th>
              <th className="num">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {nhoms.map((n) => (
              <tr key={n.id}>
                <td>
                  {sua?.id === n.id ? (
                    <input type="text" value={sua.ten} autoFocus onChange={(e) => setSua({ ...sua, ten: e.target.value })} />
                  ) : (
                    <span className="strong">{n.ten_nhom}</span>
                  )}
                </td>
                <td>{n.bat_tat ? <StatusBadge label="Đang dùng" tone="success" /> : <StatusBadge label="Đã tắt" />}</td>
                <td className="num">
                  <div className="row-actions">
                    {sua?.id === n.id ? (
                      <>
                        <button className="btn btn-sm" onClick={() => setSua(null)}>
                          Hủy
                        </button>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={busy || !sua.ten.trim()}
                          onClick={() => chay(() => api.put(`/nhom-ccdc/${n.id}`, { ten_nhom: sua.ten.trim() })).then(() => setSua(null))}
                        >
                          Lưu
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-outline btn-sm" onClick={() => setSua({ id: n.id, ten: n.ten_nhom })}>
                          Đổi tên
                        </button>
                        {n.bat_tat ? (
                          <button className="btn btn-outline btn-sm danger-outline" disabled={busy} onClick={() => chay(() => api.delete(`/nhom-ccdc/${n.id}`))}>
                            Tắt
                          </button>
                        ) : (
                          <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => chay(() => api.put(`/nhom-ccdc/${n.id}`, { ten_nhom: n.ten_nhom, bat_tat: true }))}>
                            Bật lại
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
