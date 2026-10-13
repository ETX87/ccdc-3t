import { t } from "../lib/i18n";
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
import { ChonTep } from "../components/DinhKem";
import { taiLenTepCho, type TepCho } from "../lib/dinhKem";
import { PhanTrang, useTrangKhach, useTrangServer } from "../components/PhanTrang";
import { TruongCongTy } from "../components/ChonCongTy";
import { congTyMacDinh, hienCongTy, maCongTy } from "../lib/congTy";
import { exportRowsToExcel } from "../lib/exportExcel";
import { inTemQr } from "../lib/inTem";
import { useNav } from "../lib/navigation";
import { baoThayDoi, useKhiThayDoi } from "../lib/suKien";
import { fmtGiaTriDong, fmtNgay, fmtSo, homNayVN } from "../lib/format";
import { isHcns, laKhoTon, thongBaoLoi, TINH_TRANG_TS, TRANG_THAI_TS } from "../lib/nhan";
import { TienTe } from "../components/NoiBat";
import { ChonLoc } from "../components/ChonLoc";

// Danh muc tai san co dinh: KPI + dem theo trang thai lay tu /ccdc/thong-ke (cung bo loc, khong phu thuoc
// so dong dang hien), bam ma -> popup chi tiet (lich su, QR, bao hong), in tem QR hang loat.

const EXPORT_HEADERS: Record<string, string> = {
  id: t("Mã tài sản"),
  ten_ccdc: t("Tên tài sản"),
  ten_nhom: t("Nhóm"),
  don_vi_tinh: t("Đơn vị tính"),
  so_seri: t("Số seri"),
  ngay_mua: t("Ngày mua"),
  nguyen_gia: t("Nguyên giá"),
  nha_cung_cap: t("Nhà cung cấp"),
  han_bao_hanh: t("Hạn bảo hành"),
  tinh_trang: t("Tình trạng"),
  trang_thai_hien_tai: t("Trạng thái"),
  nguoi_dang_giu_ten: t("Người đang giữ"),
  ten_kho: t("Kho"),
  ghi_chu: t("Ghi chú"),
};

interface NhomCcdc {
  id: number;
  ten_nhom: string;
  bat_tat: number;
  stt: number;
  cong_ty_id: number;
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
  cong_ty_id: number;
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

const NHOM_XU_LY = ["Hong", "Cho duyet bao hong", "Cho thanh ly", "Cho tieu huy"];

function emptyForm(congTyId: number | null = null) {
  return {
    cong_ty_id: congTyId,
    id: "",
    ten_ccdc: "",
    nhom_id: "",
    don_vi_tinh: t("Cái"),
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
  // Da phap nhan: danh muc rieng tung cong ty - form chon cong ty khi dang xem nhieu cong ty.
  const ctTao = congTyMacDinh(user);
  const nhieuCt = hienCongTy(user);

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
  // Bang phan trang o server (50 TS/trang); doi bo loc -> tu ve trang 1.
  const { trang, setTrang } = useTrangServer([tuKhoa, nhomFilter, khoFilter, trangThai, nguoiGiu]);
  const [tong, setTong] = useState(0);
  const [chon, setChon] = useState<Set<string>>(new Set());
  const [dangTai, setDangTai] = useState(false);
  const [capNhatLuc, setCapNhatLuc] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loi, setLoi] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [tep, setTep] = useState<TepCho[]>([]);
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
      .then((r) => setKhos(r.rows.filter((k) => k.bat_tat && laKhoTon(k))))
      .catch(() => setKhos([]));
  }, [loadNhoms]);

  // Tham so loc chung (thong-ke bo qua trang_thai de dem du cac tab); danh sach them trang_thai.
  const pLoc = useMemo(() => {
    const p = new URLSearchParams();
    if (tuKhoa) p.set("q", tuKhoa);
    if (nhomFilter) p.set("nhom_id", nhomFilter);
    if (khoFilter) p.set("kho_id", khoFilter);
    if (nguoiGiu) p.set("nguoi_dang_giu", nguoiGiu);
    return p.toString();
  }, [tuKhoa, nhomFilter, khoFilter, nguoiGiu]);
  const pDs = useMemo(() => {
    const p = new URLSearchParams(pLoc);
    if (trangThai) p.set("trang_thai", trangThai);
    return p.toString();
  }, [pLoc, trangThai]);

  const loadTrang = useCallback(async () => {
    setDangTai(true);
    setLoi(null);
    try {
      const ds = await api.get<{ rows: CcdcRow[]; total: number }>(`/ccdc?${pDs}&page=${trang}`);
      setRows(ds.rows);
      setTong(ds.total);
      setChon(new Set());
      setCapNhatLuc(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace("T", " "));
    } catch (e) {
      setLoi(thongBaoLoi(e, t("Không tải được danh sách tài sản.")));
      setRows([]);
    } finally {
      setDangTai(false);
    }
  }, [pDs, trang]);

  const loadThongKe = useCallback(async () => {
    try {
      setThongKe(await api.get<ThongKe>(`/ccdc/thong-ke?${pLoc}`));
    } catch (e) {
      setLoi(thongBaoLoi(e, t("Không tải được số liệu tài sản.")));
    }
  }, [pLoc]);

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

  const hienThi = rows ?? [];

  // ---- Form them / sua ----
  function openAdd() {
    setEditingId(null);
    setForm(emptyForm(ctTao.macDinh));
    setTep([]);
    setFormLoi(null);
    setShowForm(true);
  }
  function openEdit(r: CcdcRow) {
    setEditingId(r.id);
    setForm({
      cong_ty_id: r.cong_ty_id,
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
      setFormLoi(t("Mã và tên tài sản là bắt buộc."));
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
      cong_ty_id: form.cong_ty_id,
    };
    try {
      if (editingId) {
        await api.put(`/ccdc/${encodeURIComponent(editingId)}`, payload);
        setMsg(t("Đã cập nhật tài sản {editingId}.", { editingId }));
      } else {
        const r = await api.post<{ phieu_id: string }>("/ccdc", payload);
        const loiTep = r?.phieu_id && tep.length ? await taiLenTepCho("xu_ly", r.phieu_id, tep) : 0;
        setMsg(
          t("Đã tạo tài sản {id} - phiếu nhập đang chờ Kế toán duyệt, duyệt xong tài sản vào kho HCNS.", { id: payload.id }) +
            (loiTep ? t(" {loiTep} tệp đính kèm chưa tải được - mở tài sản để tải lại.", { loiTep }) : ""),
        );
      }
      setShowForm(false);
      baoThayDoi();
    } catch (err) {
      setFormLoi(thongBaoLoi(err, t("Không lưu được - vui lòng thử lại.")));
    } finally {
      setSaving(false);
    }
  }

  async function voHieuHoa(r: CcdcRow) {
    try {
      await api.delete(`/ccdc/${encodeURIComponent(r.id)}`);
      setMsg(t("Đã vô hiệu hoá {id}.", { id: r.id }));
      setXoa(null);
      baoThayDoi();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setLoi(
        code === "DANG_CAP_PHAT"
          ? t("Tài sản đang được cấp phát - phải thu hồi trước khi vô hiệu hoá.")
          : code === "DANG_CHO_DUYET"
            ? t("Tài sản đang có phiếu chờ duyệt - xử lý phiếu trước.")
            : thongBaoLoi(e),
      );
      setXoa(null);
    }
  }

  async function exportExcel() {
    if (!tong) return;
    // Xuat TOAN BO tai san khop bo loc (khong chi trang dang xem).
    let tatCa: CcdcRow[];
    try {
      tatCa = (await api.get<{ rows: CcdcRow[] }>(`/ccdc?${pDs}`)).rows;
    } catch (e) {
      return setLoi(thongBaoLoi(e, t("Không tải được dữ liệu xuất Excel.")));
    }
    await exportRowsToExcel(
      tatCa.map((r) => ({
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
        title={t("Tài sản cố định")}
        actions={
          <>
            <button className="btn btn-outline" onClick={inTem} disabled={!rows?.length} title={t("In tem QR các dòng đã chọn (hoặc các dòng đang hiển thị)")}>
              <QrCode size={14} /> {t("In tem QR")}{chon.size ? ` (${chon.size})` : ""}
            </button>
            <button className="btn btn-outline" onClick={exportExcel} disabled={!tong}>
              <Download size={14} /> {t("Xuất Excel")}
            </button>
            {canEdit && (
              <>
                <button className="btn btn-outline" onClick={() => setShowNhom(true)}>
                  <FolderPlus size={14} /> {t("Quản lý nhóm")}
                </button>
                <button className="btn btn-primary" onClick={openAdd}>
                  <Plus size={15} /> {t("Nhập tài sản mới")}
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
          label={t("Tổng tài sản đang quản lý")}
          value={fmtSo(tt.tong.so_luong)}
          trend={<div className="kpi-trend"><span className="trend-sub">{t("Không tính đã thanh lý / tiêu hủy")}</span></div>}
          subtext={t("Giá trị: {x}", { x: fmtGiaTriDong(tt.tong.gia_tri) })}
          onClick={() => setTrangThai("")}
        />
        <KpiCard
          tone="blue"
          icon={<User size={20} className="text-white" />}
          watermark={<User size={52} />}
          label={t("Đang sử dụng")}
          value={fmtSo(tt.dangDung.so_luong)}
          trend={
            <div className="kpi-trend trend-up">
              <span className="trend-bold">{tt.tong.so_luong ? fmtSo((tt.dangDung.so_luong / tt.tong.so_luong) * 100, 1) : 0}%</span>
              <span className="trend-sub">{t("tổng tài sản")}</span>
            </div>
          }
          subtext={t("Giá trị: {x}", { x: fmtGiaTriDong(tt.dangDung.gia_tri) })}
          onClick={() => setTrangThai("Dang cap phat")}
        />
        <KpiCard
          tone="blue-light"
          icon={<Store size={20} className="text-white" />}
          watermark={<Store size={52} />}
          label={t("Trong kho")}
          value={fmtSo(tt.trongKho.so_luong)}
          trend={
            <div className="kpi-trend">
              <span className="trend-bold">{tt.tong.so_luong ? fmtSo((tt.trongKho.so_luong / tt.tong.so_luong) * 100, 1) : 0}%</span>
              <span className="trend-sub">{t("sẵn sàng cấp phát")}</span>
            </div>
          }
          subtext={t("Giá trị: {x}", { x: fmtGiaTriDong(tt.trongKho.gia_tri) })}
          onClick={() => setTrangThai("Trong kho")}
        />
        <KpiCard
          tone="yellow"
          icon={<AlertTriangle size={20} className="text-white" />}
          watermark={<AlertTriangle size={52} />}
          label={t("Báo hỏng / Cần xử lý")}
          value={fmtSo(tt.xuLy.so_luong)}
          tangLaXau
          trend={
            <div className="kpi-trend trend-warning">
              <span className="trend-bold">{fmtSo(thongKe?.bao_hong_cho_duyet ?? 0)}</span>
              <span className="trend-sub">{t("phiếu báo hỏng chờ duyệt")}</span>
            </div>
          }
          subtext={t("{x} hỏng · giá trị {x2}", { x: fmtSo(tt.hong.so_luong), x2: fmtGiaTriDong(tt.xuLy.gia_tri) })}
          onClick={() => setTrangThai("Hong")}
        />
      </div>

      <div className="content-card task-card-full">
        <div className="filter-bar">
          <div className="topbar-search filter-search">
            <Search size={15} className="search-icon" />
            <input type="text" placeholder={t("Tìm mã, tên, số seri...")} value={search} onChange={(e) => setSearch(e.target.value)} className="search-input" />
          </div>
          <label className="header-dropdown select-dropdown">
            <ChonLoc value={nhomFilter} onChange={(e) => setNhomFilter(e.target.value)} aria-label={t("Nhóm")}>
              <option value="">{t("Tất cả nhóm")}</option>
              {nhoms.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.ten_nhom}
                  {n.bat_tat ? "" : t(" (đã tắt)")}
                </option>
              ))}
            </ChonLoc>
            <ChevronDown size={13} className="dropdown-arrow" />
          </label>
          <label className="header-dropdown select-dropdown">
            <ChonLoc value={khoFilter} onChange={(e) => setKhoFilter(e.target.value)} aria-label={t("Kho")}>
              <option value="">{t("Tất cả kho")}</option>
              {khos.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.ten_kho}
                </option>
              ))}
            </ChonLoc>
            <ChevronDown size={13} className="dropdown-arrow" />
          </label>
          {nguoiGiu && (
            <span className="chip">
              {t("Người giữ:")} {rows?.find((r) => r.nguoi_dang_giu === nguoiGiu)?.nguoi_dang_giu_ten ?? params.ten ?? nguoiGiu}
              <button type="button" className="chip-remove" aria-label={t("Bỏ lọc người giữ")} onClick={() => setNguoiGiu("")}>
                ×
              </button>
            </span>
          )}
        </div>

        <FilterTabs
          value={trangThai}
          onChange={setTrangThai}
          tabs={[
            { key: "", label: t("Tất cả"), count: tt.tabs.reduce((s, t) => s + t.so_luong, 0) },
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
                    aria-label={t("Chọn tất cả")}
                    checked={tatCaDangHienDaChon}
                    onChange={() => setChon(tatCaDangHienDaChon ? new Set() : new Set(hienThi.map((r) => r.id)))}
                  />
                </th>
                <th style={{ width: "13%" }}>{t("Mã tài sản")}</th>
                <th style={{ width: "22%" }}>{t("Tên tài sản")}</th>
                <th style={{ width: "14%" }}>{t("Nhóm")}</th>
                <th style={{ width: "18%" }}>{t("Vị trí / Người giữ")}</th>
                <th style={{ width: "11%", textAlign: "right" }}>{t("Nguyên giá")}</th>
                <th style={{ width: "12%", textAlign: "center" }}>{t("Trạng thái")}</th>
                <th style={{ width: "8%", textAlign: "right" }}>{t("Thao tác")}</th>
              </tr>
            </thead>
            <tbody>
              {rows === null ? (
                <tr>
                  <td colSpan={8} className="task-empty">
                    {t("Đang tải dữ liệu…")}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="task-empty">
                    {t("Không tìm thấy tài sản nào.")}
                  </td>
                </tr>
              ) : (
                hienThi.map((r) => {
                  const st = TRANG_THAI_TS[r.trang_thai_hien_tai] ?? { label: r.trang_thai_hien_tai, tone: "neutral" as const };
                  return (
                    <tr key={r.id}>
                      <td data-label={t("Chọn")}>
                        <input
                          type="checkbox"
                          aria-label={t("Chọn {id}", { id: r.id })}
                          checked={chon.has(r.id)}
                          onChange={() => {
                            const s = new Set(chon);
                            if (s.has(r.id)) s.delete(r.id);
                            else s.add(r.id);
                            setChon(s);
                          }}
                        />
                      </td>
                      <td data-label={t("Mã tài sản")}>
                        <span className="code-link" role="button" tabIndex={0} onClick={() => moTaiSan(r.id)}>
                          {r.id}
                        </span>
                      </td>
                      <td data-label={t("Tên tài sản")}>
                        <div className="strong">
                          {r.ten_ccdc}
                          {nhieuCt && <span className="muted"> · {maCongTy(user, r.cong_ty_id)}</span>}
                        </div>
                        {r.so_seri && <div className="muted small">SN: {r.so_seri}</div>}
                      </td>
                      <td data-label={t("Nhóm")} className="text-secondary">
                        {r.ten_nhom ?? "-"}
                      </td>
                      <td data-label={t("Vị trí / Người giữ")}>
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
                      <td data-label={t("Nguyên giá")} style={{ textAlign: "right" }}>
                        <TienTe so={r.nguyen_gia} />
                      </td>
                      <td data-label={t("Trạng thái")} style={{ textAlign: "center" }}>
                        <StatusBadge label={st.label} tone={st.tone} />
                      </td>
                      <td data-label={t("Thao tác")} style={{ textAlign: "right" }}>
                        {canEdit && (
                          <div className="row-actions">
                            <button className="btn btn-outline btn-sm btn-icon" onClick={() => openEdit(r)} title={t("Sửa")} aria-label={t("Sửa")}>
                              <Edit size={12} />
                            </button>
                            <button className="btn btn-outline btn-sm btn-icon danger-outline" onClick={() => setXoa(r)} title={t("Vô hiệu hoá")} aria-label={t("Vô hiệu hoá")}>
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
        <PhanTrang trang={trang} tong={tong} onDoi={setTrang} donVi={t("tài sản")} ghiChu={chon.size ? t(" · đã chọn {x}", { x: fmtSo(chon.size) }) : null} />
      </div>

      {showForm && (
        <Modal size="lg" title={editingId ? t("Sửa tài sản {editingId}", { editingId }) : t("Nhập tài sản cố định mới")} onClose={() => setShowForm(false)}>
          <form onSubmit={save}>
            {formLoi && <div className="alert alert-error">{formLoi}</div>}
            {!editingId && (
              <div className="alert alert-info">{t("Tài sản mới được tạo kèm phiếu nhập (mã NT-…) chờ Kế toán duyệt; duyệt xong tài sản vào kho HCNS.")}</div>
            )}
            <div className="form-grid">
              {!editingId && ctTao.canChon && (
                <TruongCongTy value={form.cong_ty_id} ds={ctTao.ds} onChange={(id) => setForm({ ...form, cong_ty_id: id, nhom_id: "" })} />
              )}
              <div className="field-group">
                <label className="field-label">{t("Mã tài sản *")}</label>
                <input type="text" value={form.id} disabled={editingId !== null} onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="vd TS3T-001200" required />
              </div>
              <div className="field-group">
                <label className="field-label">{t("Tên tài sản *")}</label>
                <input type="text" value={form.ten_ccdc} onChange={(e) => setForm({ ...form, ten_ccdc: e.target.value })} required />
              </div>
              <div className="field-group">
                <label className="field-label">{t("Nhóm tài sản")}</label>
                <ChonLoc value={form.nhom_id} onChange={(e) => setForm({ ...form, nhom_id: e.target.value })}>
                  <option value="">{t("-- Chọn nhóm --")}</option>
                  {nhomDangDung.filter((n) => n.cong_ty_id === form.cong_ty_id).map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.ten_nhom}
                    </option>
                  ))}
                </ChonLoc>
              </div>
              <div className="field-group">
                <label className="field-label">{t("Đơn vị tính")}</label>
                <input type="text" value={form.don_vi_tinh} onChange={(e) => setForm({ ...form, don_vi_tinh: e.target.value })} />
              </div>
              <div className="field-group">
                <label className="field-label">{t("Số seri")}</label>
                <input type="text" value={form.so_seri} onChange={(e) => setForm({ ...form, so_seri: e.target.value })} />
              </div>
              <div className="field-group">
                <label className="field-label">{t("Nguyên giá (đ)")}</label>
                <input type="number" min={0} value={form.nguyen_gia} onChange={(e) => setForm({ ...form, nguyen_gia: e.target.value })} />
              </div>
              <div className="field-group">
                <label className="field-label">{t("Ngày mua")}</label>
                <input type="date" value={form.ngay_mua} onChange={(e) => setForm({ ...form, ngay_mua: e.target.value })} />
              </div>
              <div className="field-group">
                <label className="field-label">{t("Nhà cung cấp")}</label>
                <input type="text" value={form.nha_cung_cap} onChange={(e) => setForm({ ...form, nha_cung_cap: e.target.value })} />
              </div>
              <div className="field-group">
                <label className="field-label">{t("Hạn bảo hành")}</label>
                <input type="date" value={form.han_bao_hanh} onChange={(e) => setForm({ ...form, han_bao_hanh: e.target.value })} />
              </div>
              <div className="field-group">
                <label className="field-label">{t("Tình trạng")}</label>
                <ChonLoc value={form.tinh_trang} onChange={(e) => setForm({ ...form, tinh_trang: e.target.value })}>
                  {Object.entries(TINH_TRANG_TS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </ChonLoc>
              </div>
            </div>
            <div className="field-group">
              <label className="field-label">{t("Ghi chú")}</label>
              <textarea rows={2} value={form.ghi_chu} onChange={(e) => setForm({ ...form, ghi_chu: e.target.value })} />
            </div>
            {!editingId && <ChonTep tep={tep} onDoi={setTep} />}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setShowForm(false)}>
                {t("Hủy")}
              </button>
              <button type="submit" disabled={saving} className="btn btn-primary">
                {saving ? t("Đang lưu…") : editingId ? t("Cập nhật") : t("Tạo & gửi Kế toán duyệt")}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {xoa && (
        <Modal title={t("Vô hiệu hoá tài sản")} onClose={() => setXoa(null)}>
          <p>
            {t("Vô hiệu hoá")} <span className="strong">{xoa.id}</span> - {xoa.ten_ccdc}{t("? Tài sản sẽ ẩn khỏi danh mục và báo cáo (lịch sử vẫn giữ).")}
          </p>
          {xoa.ngay_mua && <p className="muted small">{t("Ngày mua")} {fmtNgay(xoa.ngay_mua)}</p>}
          <div className="modal-actions">
            <button className="btn" onClick={() => setXoa(null)}>
              {t("Hủy")}
            </button>
            <button className="btn btn-danger" onClick={() => voHieuHoa(xoa)}>
              {t("Vô hiệu hoá")}
            </button>
          </div>
        </Modal>
      )}

      {showNhom && <QuanLyNhomModal nhoms={nhoms} ctTao={ctTao} nhieuCt={nhieuCt} maCt={(id) => maCongTy(user, id)} onClose={() => setShowNhom(false)} onDoi={loadNhoms} />}
    </div>
  );
}

function QuanLyNhomModal({
  nhoms,
  ctTao,
  nhieuCt,
  maCt,
  onClose,
  onDoi,
}: {
  nhoms: NhomCcdc[];
  ctTao: ReturnType<typeof congTyMacDinh>;
  nhieuCt: boolean;
  maCt: (id: number) => string;
  onClose: () => void;
  onDoi: () => Promise<void>;
}) {
  const tNhom = useTrangKhach(nhoms);
  const [moi, setMoi] = useState("");
  const [congTyMoi, setCongTyMoi] = useState<number | null>(ctTao.macDinh);
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
    <Modal title={t("Quản lý nhóm tài sản")} onClose={onClose}>
      {loi && <div className="alert alert-error">{loi}</div>}
      <form
        className="qr-manual"
        style={{ marginTop: 0, marginBottom: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (moi.trim()) chay(() => api.post("/nhom-ccdc", { ten_nhom: moi.trim(), cong_ty_id: congTyMoi })).then(() => setMoi(""));
        }}
      >
        {ctTao.canChon && (
          <ChonLoc value={congTyMoi ?? ""} onChange={(e) => setCongTyMoi(Number(e.target.value))} aria-label={t("Công ty")} style={{ maxWidth: 120 }}>
            {ctTao.ds.map((c) => (
              <option key={c.id} value={c.id}>
                {c.ma}
              </option>
            ))}
          </ChonLoc>
        )}
        <input type="text" placeholder={t("Tên nhóm mới…")} value={moi} onChange={(e) => setMoi(e.target.value)} />
        <button type="submit" className="btn btn-primary" disabled={busy || !moi.trim()}>
          {t("Thêm nhóm")}
        </button>
      </form>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("Tên nhóm")}</th>
              <th>{t("Trạng thái")}</th>
              <th className="num">{t("Thao tác")}</th>
            </tr>
          </thead>
          <tbody>
            {tNhom.dongTrang.map((n) => (
              <tr key={n.id}>
                <td>
                  {sua?.id === n.id ? (
                    <input type="text" value={sua.ten} autoFocus onChange={(e) => setSua({ ...sua, ten: e.target.value })} />
                  ) : (
                    <span className="strong">
                      {n.ten_nhom}
                      {nhieuCt && <span className="muted"> · {maCt(n.cong_ty_id)}</span>}
                    </span>
                  )}
                </td>
                <td>{n.bat_tat ? <StatusBadge label={t("Đang dùng")} tone="success" /> : <StatusBadge label={t("Đã tắt")} />}</td>
                <td className="num">
                  <div className="row-actions">
                    {sua?.id === n.id ? (
                      <>
                        <button className="btn btn-sm" onClick={() => setSua(null)}>
                          {t("Hủy")}
                        </button>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={busy || !sua.ten.trim()}
                          onClick={() => chay(() => api.put(`/nhom-ccdc/${n.id}`, { ten_nhom: sua.ten.trim() })).then(() => setSua(null))}
                        >
                          {t("Lưu")}
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-outline btn-sm" onClick={() => setSua({ id: n.id, ten: n.ten_nhom })}>
                          {t("Đổi tên")}
                        </button>
                        {n.bat_tat ? (
                          <button className="btn btn-outline btn-sm danger-outline" disabled={busy} onClick={() => chay(() => api.delete(`/nhom-ccdc/${n.id}`))}>
                            {t("Tắt")}
                          </button>
                        ) : (
                          <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => chay(() => api.put(`/nhom-ccdc/${n.id}`, { ten_nhom: n.ten_nhom, bat_tat: true }))}>
                            {t("Bật lại")}
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
      <PhanTrang trang={tNhom.trang} tong={tNhom.tong} onDoi={tNhom.setTrang} donVi={t("nhóm")} />
    </Modal>
  );
}
