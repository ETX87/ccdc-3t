import { t } from "../lib/i18n";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeftRight, Building2, ChevronDown, Clock, Download, FileSpreadsheet, PackagePlus, Plus, ShoppingCart, Tag, Truck } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { KpiCard, type XuHuong } from "../components/KpiCard";
import { SearchSelect } from "../components/SearchSelect";
import { StatusBadge } from "../components/StatusBadge";
import { useChiTiet } from "../components/ChiTiet";
import { ChonTep } from "../components/DinhKem";
import { taiLenTepCho, type TepCho } from "../lib/dinhKem";
import { PhanTrang, useTrangKhach } from "../components/PhanTrang";
import { useDuLieuChung } from "../lib/duLieuChung";
import { exportRowsToExcel } from "../lib/exportExcel";
import { useNav } from "../lib/navigation";
import { baoThayDoi, useKhiThayDoi } from "../lib/suKien";
import { fmtGiaTriDong, fmtNgayGio, fmtSo, homNayVN } from "../lib/format";
import { LOAI_KHO, LOAI_PHIEU_CK, TRANG_THAI_CK, isHcns, laKhoPhatChung, laKhoTon, thongBaoLoi } from "../lib/nhan";
import type { LoaiKho } from "../types";
import { KhoTag, LoaiChip, NgayCho, NguoiTag, soGioTu, TienTe } from "../components/NoiBat";
import { ChonLoc } from "../components/ChonLoc";
import { NhapExcelPhieuCk } from "../components/NhapExcelPhieuCk";

interface KhoRow {
  id: number;
  ten_kho: string;
  loai: LoaiKho;
  nhan_vien_id: string | null;
  bat_tat: number;
  cong_ty_id: number;
  cong_ty_ma?: string;
}
interface VtRow {
  id: string;
  ten_vt: string;
  don_vi_tinh: string | null;
  don_gia_tham_khao: number | null;
  cong_ty_id: number;
}
interface NvRow {
  ma_nv: string;
  ten_nv: string;
  cong_ty_id?: number;
}
interface PhieuRow {
  id: string;
  ma_phieu: string | null;
  loai: string;
  tu_kho_id: number;
  tu_kho_ten: string;
  tu_kho_loai?: string;
  den_kho_loai?: string | null;
  den_kho_id: number | null;
  den_kho_ten: string | null;
  den_nhan_vien_id: string | null;
  den_nhan_vien_ten: string | null;
  nguoi_nhan_ten_tu_do: string | null;
  nha_cung_cap: string | null;
  nguoi_lap: string;
  trang_thai: string;
  da_xac_nhan: number;
  ghi_chu: string | null;
  created_at: string;
  tom_tat: string | null;
  tong_tien: number | null;
  tong_sl: number | null;
  sl_giam?: number | null;
  so_dong?: number;
  dvt_chung: string | null;
}
interface ThongKe {
  thang: string;
  thang_truoc: string;
  theo_loai: { thang: string; loai: string; so_phieu: number; so_luong: number; gia_tri: number }[];
  cho_kt: number;
  cho_kt_gt: number;
  dang_chuyen: number;
  dang_chuyen_qua_han: number;
  cho_nv_xac_nhan: number;
}
type Loai = "Nhap mua" | "Chuyen kho" | "Cap phat NV";
interface Dong {
  vt_id: string;
  so_luong: string;
  don_gia: string;
}

function denText(p: PhieuRow): string {
  if (p.den_kho_ten) return p.den_kho_ten;
  if (p.den_nhan_vien_ten) return p.den_nhan_vien_ten;
  if (p.nguoi_nhan_ten_tu_do) return t("{nguoi_nhan_ten_tu_do} (ngoài danh bạ)", { nguoi_nhan_ten_tu_do: p.nguoi_nhan_ten_tu_do });
  return "-";
}
/** Tong so luong phieu: cung 1 DVT -> kem DVT; nhieu DVT -> chi tong + "n mat hang". Dieu chinh tach tang (+) / giam (-). */
function SoLuongPhieu({ p }: { p: PhieuRow }) {
  if (p.tong_sl == null) return <span className="muted">-</span>;
  const dvt = p.dvt_chung && <span className="nb-dvt">{p.dvt_chung}</span>;
  if (p.loai === "Dieu chinh")
    return (
      <div>
        {p.tong_sl > 0 && (
          <div className="nb-nhap">
            +{fmtSo(p.tong_sl, 2)}
            {dvt}
          </div>
        )}
        {(p.sl_giam ?? 0) > 0 && (
          <div className="nb-xuat">
            -{fmtSo(p.sl_giam ?? 0, 2)}
            {dvt}
          </div>
        )}
      </div>
    );
  return (
    <div>
      <span className="nb-so">
        {fmtSo(p.tong_sl, 2)}
        {dvt}
      </span>
      {(p.so_dong ?? 0) > 1 && <div className="muted small">{t("{n} mặt hàng", { n: p.so_dong })}</div>}
    </div>
  );
}
function denLabel(p: PhieuRow) {
  if (p.den_kho_ten) return <KhoTag ten={p.den_kho_ten} loai={p.den_kho_loai} />;
  if (p.den_nhan_vien_ten) return <NguoiTag ten={p.den_nhan_vien_ten} />;
  if (p.nguoi_nhan_ten_tu_do) return <NguoiTag ten={t("{nguoi_nhan_ten_tu_do} (ngoài danh bạ)", { nguoi_nhan_ten_tu_do: p.nguoi_nhan_ten_tu_do })} />;
  return "-";
}
// Phieu con cho nguoi khac xu ly (tinh tuoi cho, quá 48h -> do).
const CK_DANG_CHO = new Set(["Cho ke toan duyet", "Dang chuyen", "Ke toan tu choi", "Bi tu choi"]);

function xuHuong(nay: number, truoc: number): XuHuong {
  return { pct: truoc > 0 ? Math.round(((nay - truoc) / truoc) * 1000) / 10 : null, truoc };
}

// Phieu tieu hao: nhap mua (HCNS, KT duyet), chuyen kho (thu kho), cap phat NV. Chi tiet + duyet/nhan/tu
// choi dung popup chung (useChiTiet) - khong con prompt()/alert().
export function ChuyenKhoScreen({ tabs }: { tabs?: ReactNode }) {
  const auth = useAuth();
  const { params } = useNav();
  const { moPhieu } = useChiTiet();
  const { reload: reloadViec } = useDuLieuChung();
  const user = auth.status === "authenticated" ? auth.user : null;
  const myKho = useMemo(() => user?.kho_phu_trach ?? [], [user]);

  const [khoAll, setKhoAll] = useState<KhoRow[]>([]);
  const [khoDichAll, setKhoDichAll] = useState<KhoRow[]>([]);
  const [vts, setVts] = useState<VtRow[]>([]);
  const [nvs, setNvs] = useState<NvRow[]>([]);
  const [capDuoi, setCapDuoi] = useState<NvRow[]>([]);
  const [choNhan, setChoNhan] = useState<PhieuRow[]>([]);
  const [rows, setRows] = useState<PhieuRow[] | null>(null);
  const [thongKe, setThongKe] = useState<ThongKe | null>(null);
  const [filter, setFilter] = useState({
    kho_id: params.kho_id ?? "",
    loai: params.loai ?? "",
    trang_thai: params.trang_thai ?? "",
    thang: params.thang ?? homNayVN().slice(0, 7),
    vt_id: params.vt_id ?? "",
  });
  const [dangTai, setDangTai] = useState(false);
  const [capNhatLuc, setCapNhatLuc] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // form
  const [showForm, setShowForm] = useState(false);
  const [loai, setLoai] = useState<Loai>("Chuyen kho");
  const [tuKho, setTuKho] = useState<number | "">("");
  const [denKho, setDenKho] = useState<number | "">("");
  const [denNv, setDenNv] = useState("");
  const [tuDo, setTuDo] = useState("");
  // Nguoi nhan phieu cap phat: nhan vien / ten ngoai danh ba / kho tieu hao van phong (tieu dung het, khong tinh ton).
  const [kieuNhan, setKieuNhan] = useState<"nv" | "tu-do" | "kho-th">("nv");
  const dungTuDo = kieuNhan === "tu-do";
  const [khoTh, setKhoTh] = useState<number | "">("");
  const [ncc, setNcc] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const [tep, setTep] = useState<TepCho[]>([]);
  const [dongs, setDongs] = useState<Dong[]>([{ vt_id: "", so_luong: "", don_gia: "" }]);
  const [tonNguon, setTonNguon] = useState<Record<string, number>>({});
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Bang phieu phan trang o server (moi trang 50 phieu) - doi bo loc thi ve trang 1.
  const [trang, setTrang] = useState(1);
  const [tong, setTong] = useState(0);
  const doiLoc = (f: typeof filter) => {
    setFilter(f);
    setTrang(1);
  };
  const qsLoc = useMemo(() => new URLSearchParams(Object.entries(filter).filter(([, v]) => v)), [filter]);

  const loadTrang = useCallback(async () => {
    setDangTai(true);
    setLoi(null);
    try {
      const list = await api.get<{ rows: PhieuRow[]; total: number }>(`/phieu-chuyen-kho?${qsLoc}&page=${trang}`);
      setRows(list.rows);
      setTong(list.total);
      setCapNhatLuc(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace("T", " "));
    } catch (e) {
      setLoi(thongBaoLoi(e, t("Không tải được danh sách phiếu.")));
      setRows([]);
    } finally {
      setDangTai(false);
    }
  }, [qsLoc, trang]);

  const loadPhu = useCallback(async () => {
    const qsTk = new URLSearchParams({ thang: filter.thang || homNayVN().slice(0, 7), ...(filter.kho_id ? { kho_id: filter.kho_id } : {}) });
    try {
      const [cho, tk] = await Promise.all([
        api.get<{ rows: PhieuRow[] }>("/phieu-chuyen-kho?cho_toi_nhan=1"),
        api.get<ThongKe>(`/phieu-chuyen-kho/thong-ke?${qsTk}`),
      ]);
      setChoNhan(cho.rows);
      setThongKe(tk);
    } catch (e) {
      setLoi(thongBaoLoi(e, t("Không tải được số liệu phiếu.")));
    }
  }, [filter.thang, filter.kho_id]);

  const tChoNhan = useTrangKhach(choNhan);

  const loadList = useCallback(async () => {
    await Promise.all([loadTrang(), loadPhu()]);
  }, [loadTrang, loadPhu]);

  useEffect(() => {
    Promise.all([
      api.get<{ rows: KhoRow[] }>("/kho"),
      api.get<{ rows: VtRow[] }>("/vt-tieu-hao"),
      api.get<{ rows: NvRow[] }>("/nhan-vien?gon=1"),
      api.get<{ rows: NvRow[] }>("/nhan-vien/cap-duoi"),
      api.get<{ rows: KhoRow[] }>("/kho/dich"),
    ])
      .then(([k, v, n, cd, kd]) => {
        setKhoAll(k.rows.filter((x) => x.bat_tat));
        setKhoDichAll(kd.rows);
        setVts(v.rows);
        setNvs(n.rows);
        setCapDuoi(cd.rows);
      })
      .catch((e) => setLoi(thongBaoLoi(e, t("Không tải được danh mục kho / vật tư."))));
  }, []);

  useEffect(() => {
    loadTrang();
  }, [loadTrang]);
  useEffect(() => {
    loadPhu();
  }, [loadPhu]);
  useKhiThayDoi(loadList);

  const tuKhoRow = khoAll.find((k) => k.id === tuKho) ?? khoDichAll.find((k) => k.id === tuKho);
  const congTyNguon = tuKhoRow?.cong_ty_id ?? (myKho.find((k) => k.id === tuKho)?.cong_ty_id ?? null);
  const khoNguonHopLe = myKho.filter((k) => (loai === "Nhap mua" ? k.loai === "Mua hang" : laKhoTon(k)));
  const khoThHopLe = khoAll.filter((k) => k.loai === "Tieu hao" && k.cong_ty_id === congTyNguon);
  // Da phap nhan: kho dich cung cong ty theo quy tac cu; kho cong ty KHAC (chi phieu Chuyen kho) = chuyen cong ty,
  // cho KT cong ty nguon duyet.
  const khoDichHopLe = (loai === "Nhap mua" ? khoAll : khoDichAll).filter((k) => {
    if (loai === "Nhap mua") return k.loai === "HCNS" && k.cong_ty_id === congTyNguon;
    if (k.id === tuKho || k.loai === "Mua hang") return false;
    if (k.cong_ty_id !== congTyNguon) return true;
    if (tuKhoRow?.loai === "Quan ly") return laKhoPhatChung(k);
    return true;
  });
  const denKhoRow = khoDichAll.find((k) => k.id === denKho);
  const chuyenCongTy = loai === "Chuyen kho" && !!denKhoRow && congTyNguon != null && denKhoRow.cong_ty_id !== congTyNguon;
  // Kho QL chi cap cho chinh QL + cap duoi truc tiep; kho HCNS/Mien/Trung chuyen cap cho moi nhan vien CUNG CONG TY kho.
  const nvHopLe = useMemo(() => {
    const cungCt = (n: NvRow) => n.cong_ty_id == null || n.cong_ty_id === congTyNguon;
    if (tuKhoRow?.loai === "Quan ly") {
      const self = nvs.find((n) => n.ma_nv === tuKhoRow.nhan_vien_id);
      return [...(self ? [self] : []), ...capDuoi].filter(cungCt);
    }
    return nvs.filter(cungCt);
  }, [tuKhoRow, nvs, capDuoi, congTyNguon]);

  useEffect(() => {
    if (!tuKho || loai === "Nhap mua") return setTonNguon({});
    api
      .get<{ rows: { id: string; ton: number }[] }>(`/bao-cao/ton-kho?kho_id=${tuKho}`)
      .then((r) => setTonNguon(Object.fromEntries(r.rows.map((x) => [x.id, x.ton]))))
      .catch(() => setTonNguon({}));
  }, [tuKho, loai]);

  function moForm(l: Loai, kieu: "nv" | "kho-th" = "nv") {
    setLoai(l);
    setKieuNhan(kieu);
    setKhoTh("");
    const nguon = myKho.filter((k) => (l === "Nhap mua" ? k.loai === "Mua hang" : laKhoTon(k)));
    setTuKho(nguon[0]?.id ?? "");
    const ctNguon = nguon[0]?.cong_ty_id ?? null;
    setDenKho(l === "Nhap mua" ? (khoAll.find((k) => k.loai === "HCNS" && k.cong_ty_id === ctNguon)?.id ?? "") : "");
    setDenNv("");
    setTuDo("");
    setNcc("");
    setGhiChu("");
    setTep([]);
    setDongs([{ vt_id: "", so_luong: "", don_gia: "" }]);
    setFormErr(null);
    setShowForm(true);
  }

  const vtOptions = useMemo(
    () =>
      vts
        .filter((v) => v.cong_ty_id === congTyNguon && (loai === "Nhap mua" || (tonNguon[v.id] ?? 0) > 0))
        .map((v) => ({ value: v.id, label: `${v.ten_vt} (${v.id})${loai !== "Nhap mua" ? t(" — tồn {x}", { x: tonNguon[v.id] ?? 0 }) : ""}` })),
    [vts, tonNguon, loai, congTyNguon],
  );

  async function luu() {
    const items = dongs
      .filter((d) => d.vt_id)
      .map((d) => ({ vt_id: d.vt_id, so_luong: Number(d.so_luong), don_gia: d.don_gia ? Number(d.don_gia) : null }));
    if (!tuKho) return setFormErr(t("Chọn kho nguồn."));
    if (items.length === 0 || items.some((i) => !(i.so_luong > 0))) return setFormErr(t("Nhập vật tư và số lượng > 0 cho từng dòng."));
    if (loai !== "Cap phat NV" && !denKho) return setFormErr(t("Chọn kho đích."));
    if (loai === "Cap phat NV" && !(kieuNhan === "kho-th" ? khoTh : dungTuDo ? tuDo.trim() : denNv)) return setFormErr(t("Chọn người nhận."));
    setSaving(true);
    setFormErr(null);
    try {
      const r = await api.post<{ id: string }>("/phieu-chuyen-kho", {
        loai,
        tu_kho_id: tuKho,
        den_kho_id: loai === "Cap phat NV" ? (kieuNhan === "kho-th" ? khoTh : null) : denKho,
        den_nhan_vien_id: loai === "Cap phat NV" && kieuNhan === "nv" ? denNv : null,
        nguoi_nhan_ten_tu_do: loai === "Cap phat NV" && dungTuDo ? tuDo.trim() : null,
        nha_cung_cap: ncc || null,
        ghi_chu: ghiChu || null,
        items,
      });
      const loiTep = r?.id && tep.length ? await taiLenTepCho("chuyen_kho", r.id, tep) : 0;
      setShowForm(false);
      setMsg(
        (loiTep ? t("{loiTep} tệp đính kèm chưa tải được - mở phiếu để tải lại. ", { loiTep }) : "") +
        (loai === "Nhap mua"
          ? t("Đã lập phiếu nhập mua - chờ Kế toán duyệt.")
          : loai === "Chuyen kho"
            ? t("Đã lập phiếu chuyển kho - hàng trừ kho nguồn, chờ kho đích xác nhận nhận.")
            : kieuNhan === "kho-th"
              ? t("Đã xuất tiêu dùng vào kho tiêu hao - đã trừ tồn kho xuất.")
              : t("Đã lập phiếu cấp phát.")),
      );
      baoThayDoi();
      await reloadViec();
      if (r?.id) moPhieu("chuyen_kho", r.id);
    } catch (e) {
      setFormErr(thongBaoLoi(e));
    } finally {
      setSaving(false);
    }
  }

  async function nhanNhanh(p: PhieuRow) {
    setBusy(p.id);
    setLoi(null);
    try {
      await api.post(`/phieu-chuyen-kho/${encodeURIComponent(p.id)}/nhan`, {});
      setMsg(t("Đã xác nhận nhận hàng phiếu {x}.", { x: p.ma_phieu ?? p.id.slice(0, 8) }));
      baoThayDoi();
      await reloadViec();
    } catch (e) {
      setLoi(thongBaoLoi(e));
    } finally {
      setBusy(null);
    }
  }

  async function exportExcel() {
    if (!tong) return;
    // Xuat TOAN BO phieu khop bo loc (khong chi trang dang xem), toi da 5.000 phieu.
    let tatCa: PhieuRow[];
    try {
      tatCa = (await api.get<{ rows: PhieuRow[] }>(`/phieu-chuyen-kho?${qsLoc}&limit=5000`)).rows;
    } catch (e) {
      return setLoi(thongBaoLoi(e, t("Không tải được dữ liệu xuất Excel.")));
    }
    await exportRowsToExcel(
      tatCa.map((p) => ({
        ma_phieu: p.ma_phieu ?? p.id,
        loai: LOAI_PHIEU_CK[p.loai] ?? p.loai,
        tu: p.tu_kho_ten,
        den: denText(p),
        hang: p.tom_tat,
        tong_sl: p.loai === "Dieu chinh" ? `+${p.tong_sl ?? 0} / -${p.sl_giam ?? 0}` : p.tong_sl,
        tong_tien: p.tong_tien,
        trang_thai: TRANG_THAI_CK[p.trang_thai]?.label ?? p.trang_thai,
        nguoi_lap: p.nguoi_lap,
        ngay: p.created_at,
      })),
      `Phieu_tieu_hao_${filter.thang || homNayVN()}.xlsx`,
      "Phieu tieu hao",
      { ma_phieu: t("Mã phiếu"), loai: t("Loại"), tu: t("Từ"), den: t("Đến"), hang: t("Hàng"), tong_sl: t("Tổng SL"), tong_tien: t("Tổng tiền"), trang_thai: t("Trạng thái"), nguoi_lap: t("Người lập"), ngay: t("Ngày") },
    );
  }

  if (!user) return null;
  const coKhoXuat = myKho.some(laKhoTon);
  const tk = (thang: string | undefined, l: string) => thongKe?.theo_loai.find((r) => r.thang === thang && r.loai === l);
  const cpNay = tk(thongKe?.thang, "Cap phat NV");
  const cpTruoc = tk(thongKe?.thang_truoc, "Cap phat NV");
  const nmNay = tk(thongKe?.thang, "Nhap mua");
  const nmTruoc = tk(thongKe?.thang_truoc, "Nhap mua");
  const ckNay = tk(thongKe?.thang, "Chuyen kho");
  const tenThang = thongKe ? `${thongKe.thang.slice(5)}/${thongKe.thang.slice(0, 4)}` : "";

  return (
    <div className="dashboard-container">
      <PageHeader
        title={t("Cấp phát tiêu hao")}
        filters={tabs}
        actions={
          <>
            <button className="btn btn-outline" onClick={exportExcel} disabled={!tong}>
              <Download size={14} /> {t("Xuất Excel")}
            </button>
            {isHcns(user) && (
              <button className="btn btn-outline" onClick={() => moForm("Nhap mua")}>
                <ShoppingCart size={14} /> {t("Nhập mua")}
              </button>
            )}
            {coKhoXuat && (
              <>
                <button className="btn btn-outline" onClick={() => setShowImport(true)} title={t("Nhập hàng loạt phiếu chuyển kho / cấp phát / xuất tiêu dùng từ file Excel")}>
                  <FileSpreadsheet size={14} /> {t("Nhập từ Excel")}
                </button>
                <button className="btn btn-outline" onClick={() => moForm("Chuyen kho")}>
                  <ArrowLeftRight size={14} /> {t("Chuyển kho")}
                </button>
                <button className="btn btn-outline" onClick={() => moForm("Cap phat NV", "kho-th")} title={t("Xuất VPP / vệ sinh / đóng hàng vào kho tiêu hao văn phòng - tiêu hao hết, không tính tồn")}>
                  <Building2 size={14} /> {t("Xuất tiêu dùng VP")}
                </button>
                <button className="btn btn-primary" onClick={() => moForm("Cap phat NV")}>
                  <Plus size={15} /> {t("Cấp phát NV")}
                </button>
              </>
            )}
          </>
        }
        capNhatLuc={capNhatLuc}
        onRefresh={loadList}
        dangTai={dangTai}
      />

      <div className="kpi-grid kpi-grid-4">
        <KpiCard
          tone="purple"
          icon={<Tag size={20} className="text-white" />}
          watermark={<Tag size={52} />}
          label={t("Cấp phát NV tháng {tenThang}", { tenThang })}
          value={fmtSo(cpNay?.so_phieu ?? 0)}
          xuHuong={xuHuong(cpNay?.so_phieu ?? 0, cpTruoc?.so_phieu ?? 0)}
          moTaXuHuong={t("so với tháng trước")}
          subtext={t("{x} đơn vị · {x2}", { x: fmtSo(cpNay?.so_luong ?? 0), x2: fmtGiaTriDong(cpNay?.gia_tri ?? 0) })}
          onClick={() => doiLoc({ ...filter, loai: "Cap phat NV", trang_thai: "" })}
        />
        <KpiCard
          tone="cyan"
          icon={<PackagePlus size={20} className="text-white" />}
          watermark={<PackagePlus size={52} />}
          label={t("Nhập mua tháng {tenThang}", { tenThang })}
          value={fmtSo(nmNay?.so_phieu ?? 0)}
          xuHuong={xuHuong(nmNay?.gia_tri ?? 0, nmTruoc?.gia_tri ?? 0)}
          moTaXuHuong={t("giá trị so với tháng trước")}
          subtext={t("Giá trị: {x} · {x2} phiếu chuyển kho", { x: fmtGiaTriDong(nmNay?.gia_tri ?? 0), x2: fmtSo(ckNay?.so_phieu ?? 0) })}
          onClick={() => doiLoc({ ...filter, loai: "Nhap mua", trang_thai: "" })}
        />
        <KpiCard
          tone="yellow"
          icon={<Clock size={20} className="text-white" />}
          watermark={<Clock size={52} />}
          label={t("Chờ Kế toán duyệt")}
          value={fmtSo(thongKe?.cho_kt ?? 0)}
          tangLaXau
          trend={<div className="kpi-trend trend-warning"><span className="trend-sub">{t("Phiếu nhập mua chưa vào tồn")}</span></div>}
          subtext={t("Giá trị: {x}", { x: fmtGiaTriDong(thongKe?.cho_kt_gt ?? 0) })}
          onClick={() => doiLoc({ ...filter, loai: "", trang_thai: "Cho ke toan duyet", thang: "" })}
        />
        <KpiCard
          tone={thongKe?.dang_chuyen_qua_han ? "red" : "blue"}
          icon={<Truck size={20} className="text-white" />}
          watermark={<Truck size={52} />}
          label={t("Đang chuyển chưa nhận")}
          value={fmtSo(thongKe?.dang_chuyen ?? 0)}
          trend={
            <div className={`kpi-trend ${thongKe?.dang_chuyen_qua_han ? "trend-danger" : ""}`}>
              <span className="trend-bold">{fmtSo(thongKe?.dang_chuyen_qua_han ?? 0)}</span>
              <span className="trend-sub">{t("quá 48 giờ")}</span>
            </div>
          }
          subtext={t("{x} phiếu cấp phát NV chưa xác nhận", { x: fmtSo(thongKe?.cho_nv_xac_nhan ?? 0) })}
          onClick={() => doiLoc({ ...filter, loai: "", trang_thai: "Dang chuyen", thang: "" })}
        />
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}
      {loi && <div className="alert alert-error">{loi}</div>}

      <div className="content-card task-card-full">
        <div className="filter-bar">
          <label className="header-dropdown select-dropdown">
            <ChonLoc value={filter.kho_id} onChange={(e) => doiLoc({ ...filter, kho_id: e.target.value })} aria-label={t("Kho")}>
              <option value="">{t("Tất cả kho")}</option>
              {khoAll
                .filter((k) => k.loai !== "Mua hang")
                .map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.ten_kho}
                  </option>
                ))}
            </ChonLoc>
            <ChevronDown size={13} className="dropdown-arrow" />
          </label>
          <label className="header-dropdown select-dropdown">
            <ChonLoc value={filter.loai} onChange={(e) => doiLoc({ ...filter, loai: e.target.value })} aria-label={t("Loại phiếu")}>
              <option value="">{t("Tất cả loại")}</option>
              {Object.entries(LOAI_PHIEU_CK).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </ChonLoc>
            <ChevronDown size={13} className="dropdown-arrow" />
          </label>
          <label className="header-dropdown select-dropdown">
            <ChonLoc value={filter.trang_thai} onChange={(e) => doiLoc({ ...filter, trang_thai: e.target.value })} aria-label={t("Trạng thái")}>
              <option value="">{t("Tất cả trạng thái")}</option>
              {Object.entries(TRANG_THAI_CK).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </ChonLoc>
            <ChevronDown size={13} className="dropdown-arrow" />
          </label>
          <input type="month" value={filter.thang} onChange={(e) => doiLoc({ ...filter, thang: e.target.value })} aria-label={t("Tháng")} />
          {filter.thang && (
            <button className="btn btn-sm" onClick={() => doiLoc({ ...filter, thang: "" })}>
              {t("Mọi tháng")}
            </button>
          )}
          {filter.vt_id && (
            <span className="chip">
              {t("Vật tư:")} {vts.find((v) => v.id === filter.vt_id)?.ten_vt ?? filter.vt_id}
              <button type="button" className="chip-remove" aria-label={t("Bỏ lọc vật tư")} onClick={() => doiLoc({ ...filter, vt_id: "" })}>
                ×
              </button>
            </span>
          )}
        </div>

        <div className="task-table-wrapper">
          <table className="task-table">
            <thead>
              <tr>
                <th style={{ width: "12%" }}>{t("Mã phiếu")}</th>
                <th style={{ width: "10%" }}>{t("Loại")}</th>
                <th style={{ width: "14%" }}>{t("Từ")}</th>
                <th style={{ width: "16%" }}>{t("Đến")}</th>
                <th>{t("Hàng")}</th>
                <th style={{ width: "8%", textAlign: "right" }}>{t("SL")}</th>
                <th style={{ width: "10%", textAlign: "right" }}>{t("Giá trị")}</th>
                <th style={{ width: "11%", textAlign: "center" }}>{t("Trạng thái")}</th>
                <th style={{ width: "11%" }}>{t("Ngày")}</th>
              </tr>
            </thead>
            <tbody>
              {rows === null && (
                <tr>
                  <td colSpan={9} className="task-empty">
                    {t("Đang tải…")}
                  </td>
                </tr>
              )}
              {rows !== null && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="task-empty">
                    {t("Không có phiếu nào khớp bộ lọc.")}
                  </td>
                </tr>
              )}
              {rows?.map((p) => (
                <tr
                  key={p.id}
                  className={
                    p.trang_thai === "Bi tu choi" || p.trang_thai === "Ke toan tu choi" || (CK_DANG_CHO.has(p.trang_thai) && (soGioTu(p.created_at) ?? 0) > 48)
                      ? "row-canh-bao"
                      : CK_DANG_CHO.has(p.trang_thai)
                        ? "row-chu-y"
                        : undefined
                  }
                >
                  <td data-label={t("Mã phiếu")}>
                    <span className="code-link" role="button" tabIndex={0} onClick={() => moPhieu("chuyen_kho", p.id)}>
                      {p.ma_phieu ?? p.id.slice(0, 8)}
                    </span>
                  </td>
                  <td data-label={t("Loại")}>
                    <LoaiChip loai={p.loai} nhan={LOAI_PHIEU_CK[p.loai] ?? p.loai} />
                  </td>
                  <td data-label={t("Từ")}>
                    <KhoTag ten={p.tu_kho_ten} loai={p.tu_kho_loai} />
                  </td>
                  <td data-label={t("Đến")}>{denLabel(p)}</td>
                  <td data-label={t("Hàng")}>{p.tom_tat}</td>
                  <td data-label={t("SL")} style={{ textAlign: "right" }}>
                    <SoLuongPhieu p={p} />
                  </td>
                  <td data-label={t("Giá trị")} style={{ textAlign: "right" }}>
                    <TienTe so={p.tong_tien} />
                  </td>
                  <td data-label={t("Trạng thái")} style={{ textAlign: "center" }}>
                    <StatusBadge label={TRANG_THAI_CK[p.trang_thai]?.label ?? p.trang_thai} tone={TRANG_THAI_CK[p.trang_thai]?.tone} />
                    {p.loai === "Cap phat NV" && p.den_nhan_vien_id && (
                      <div className="muted small">{p.da_xac_nhan ? t("NV đã xác nhận") : t("NV chưa xác nhận")}</div>
                    )}
                  </td>
                  <td data-label={t("Ngày")}>
                    <NgayCho ngay={p.created_at} dangCho={CK_DANG_CHO.has(p.trang_thai)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PhanTrang trang={trang} tong={tong} onDoi={setTrang} donVi={t("phiếu")} />
      </div>

      {choNhan.length > 0 && (
        <div className="content-card">
          <div className="card-header">
            <div className="card-title-wrap">
              <Truck size={17} className="card-title-icon text-teal" />
              <h2 className="card-title">{t("Hàng đang chuyển tới kho của tôi (")}{choNhan.length})</h2>
            </div>
          </div>
          <div className="task-table-wrapper">
            <table className="task-table">
              <thead>
                <tr>
                  <th>{t("Mã phiếu")}</th>
                  <th>{t("Từ kho")}</th>
                  <th>{t("Đến kho")}</th>
                  <th>{t("Hàng")}</th>
                  <th style={{ textAlign: "right" }}>{t("SL")}</th>
                  <th>{t("Ngày lập")}</th>
                  <th style={{ textAlign: "right" }}>{t("Thao tác")}</th>
                </tr>
              </thead>
              <tbody>
                {tChoNhan.dongTrang.map((p) => (
                  <tr key={p.id}>
                    <td data-label={t("Mã phiếu")}>
                      <span className="code-link" onClick={() => moPhieu("chuyen_kho", p.id)}>
                        {p.ma_phieu ?? p.id.slice(0, 8)}
                      </span>
                    </td>
                    <td data-label={t("Từ kho")}>
                      <KhoTag ten={p.tu_kho_ten} loai={p.tu_kho_loai} />
                    </td>
                    <td data-label={t("Đến kho")}>
                      <KhoTag ten={p.den_kho_ten} loai={p.den_kho_loai} />
                    </td>
                    <td data-label={t("Hàng")}>{p.tom_tat}</td>
                    <td data-label={t("SL")} style={{ textAlign: "right" }}>
                      <SoLuongPhieu p={p} />
                    </td>
                    <td data-label={t("Ngày lập")}>
                      <NgayCho ngay={p.created_at} dangCho />
                    </td>
                    <td data-label={t("Thao tác")} style={{ textAlign: "right" }}>
                      <div className="row-actions">
                        <button className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => nhanNhanh(p)}>
                          {busy === p.id ? "…" : t("Đã nhận đủ")}
                        </button>
                        <button className="btn btn-outline btn-sm danger-outline" onClick={() => moPhieu("chuyen_kho", p.id)}>
                          {t("Từ chối…")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PhanTrang trang={tChoNhan.trang} tong={tChoNhan.tong} onDoi={tChoNhan.setTrang} donVi={t("phiếu")} />
        </div>
      )}

      {showForm && (
        <Modal size="lg" title={t("Lập phiếu: {x}", { x: LOAI_PHIEU_CK[loai] })} onClose={() => setShowForm(false)}>
          <div className="form-grid">
            <div className="field-group">
              <label className="field-label">{t("Kho nguồn")}</label>
              <ChonLoc value={tuKho} onChange={(e) => setTuKho(Number(e.target.value))}>
                {khoNguonHopLe.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.ten_kho} ({LOAI_KHO[k.loai]})
                  </option>
                ))}
              </ChonLoc>
            </div>
            {loai !== "Cap phat NV" && (
              <div className="field-group">
                <label className="field-label">{t("Kho đích")}</label>
                <ChonLoc value={denKho} onChange={(e) => setDenKho(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">{t("-- Chọn kho --")}</option>
                  {khoDichHopLe.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.cong_ty_id !== congTyNguon ? `[${k.cong_ty_ma ?? ""}] ` : ""}
                      {k.ten_kho} ({LOAI_KHO[k.loai]})
                    </option>
                  ))}
                </ChonLoc>
                {chuyenCongTy && (
                  <div className="field-hint text-orange">
                    {t("Chuyển sang công ty {x}: phiếu chờ Kế toán công ty nguồn duyệt rồi mới trừ tồn; mặt hàng ghép theo tên + ĐVT trong danh mục công ty nhận (chưa có sẽ tự tạo).", {
                      x: denKhoRow?.cong_ty_ma ?? "",
                    })}
                  </div>
                )}
              </div>
            )}
            {loai === "Cap phat NV" && (
              <div className="field-group">
                <label className="field-label">{t("Người nhận")}</label>
                <div className="row-actions" style={{ justifyContent: "flex-start", marginBottom: 6, flexWrap: "wrap" }}>
                  {(
                    [
                      ["nv", t("Nhân viên")],
                      ["kho-th", t("Kho tiêu hao văn phòng")],
                      ...(tuKhoRow?.loai !== "Quan ly" ? [["tu-do", t("Ngoài danh bạ (KTV/CTV)")]] : []),
                    ] as [typeof kieuNhan, string][]
                  ).map(([k, nhan]) => (
                    <label key={k} className="check-label">
                      <input type="radio" name="kieu-nhan" checked={kieuNhan === k} onChange={() => setKieuNhan(k)} />
                      {nhan}
                    </label>
                  ))}
                </div>
                {kieuNhan === "kho-th" && (
                  <>
                    <ChonLoc value={khoTh} onChange={(e) => setKhoTh(e.target.value ? Number(e.target.value) : "")}>
                      <option value="">{t("-- Chọn kho tiêu hao --")}</option>
                      {khoThHopLe.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.ten_kho}
                        </option>
                      ))}
                    </ChonLoc>
                    <div className="field-hint">
                      {khoThHopLe.length
                        ? t("Xuất vào kho tiêu hao = tiêu dùng hết: trừ tồn kho xuất ngay, không cần xác nhận nhận.")
                        : t("Chưa có kho tiêu hao - HCNS tạo ở Cấu hình kho (loại \"Kho tiêu hao\").")}
                    </div>
                  </>
                )}
                {kieuNhan === "nv" && (
                  <SearchSelect
                    options={nvHopLe.map((n) => ({ value: n.ma_nv, label: `${n.ten_nv} (${n.ma_nv})` }))}
                    value={denNv}
                    onChange={setDenNv}
                    placeholder={t("Tìm nhân viên...")}
                  />
                )}
                {dungTuDo && <input type="text" value={tuDo} onChange={(e) => setTuDo(e.target.value)} placeholder={t("Tên KTV/CTV ngoài danh bạ...")} />}
                {tuKhoRow?.loai === "Quan ly" && kieuNhan === "nv" && <div className="field-hint">{t("Kho quản lý chỉ cấp cho bản thân và nhân viên cấp dưới trực tiếp.")}</div>}
              </div>
            )}
            {loai === "Nhap mua" && (
              <div className="field-group">
                <label className="field-label">{t("Nhà cung cấp")}</label>
                <input type="text" value={ncc} onChange={(e) => setNcc(e.target.value)} />
              </div>
            )}
          </div>
          <div className="field-group">
            <label className="field-label">{t("Hàng hoá")}</label>
            {dongs.map((d, i) => (
              <div key={i} className="dong-hang">
                <div className="dong-hang-vt">
                  <SearchSelect
                    options={vtOptions}
                    value={d.vt_id}
                    onChange={(v) => {
                      const vt = vts.find((x) => x.id === v);
                      setDongs(dongs.map((x, j) => (j === i ? { ...x, vt_id: v, don_gia: x.don_gia || (vt?.don_gia_tham_khao ? String(vt.don_gia_tham_khao) : "") } : x)));
                    }}
                    placeholder={t("Tìm vật tư...")}
                  />
                </div>
                <input
                  type="number"
                  min={0}
                  placeholder={t("SL")}
                  value={d.so_luong}
                  onChange={(e) => setDongs(dongs.map((x, j) => (j === i ? { ...x, so_luong: e.target.value } : x)))}
                />
                {loai === "Nhap mua" && (
                  <input
                    type="number"
                    min={0}
                    placeholder={t("Đơn giá")}
                    value={d.don_gia}
                    onChange={(e) => setDongs(dongs.map((x, j) => (j === i ? { ...x, don_gia: e.target.value } : x)))}
                  />
                )}
                <button className="btn btn-outline btn-sm btn-icon" aria-label={t("Xoá dòng")} disabled={dongs.length === 1} onClick={() => setDongs(dongs.filter((_, j) => j !== i))}>
                  ×
                </button>
              </div>
            ))}
            <button className="btn btn-outline btn-sm" onClick={() => setDongs([...dongs, { vt_id: "", so_luong: "", don_gia: "" }])}>
              {t("+ Thêm dòng")}
            </button>
          </div>
          <div className="field-group">
            <label className="field-label">{t("Ghi chú")}</label>
            <textarea rows={2} value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} />
          </div>
          <ChonTep tep={tep} onDoi={setTep} loaiMacDinh={loai === "Nhap mua" ? "Hoa don" : "Chung tu"} />
          {loai === "Chuyen kho" && <div className="field-hint">{t("Hàng trừ khỏi kho nguồn ngay; cộng vào kho đích khi thủ kho đích xác nhận đã nhận.")}</div>}
          {loai === "Nhap mua" && <div className="field-hint">{t("Hàng chỉ vào tồn kho HCNS sau khi Kế toán duyệt.")}</div>}
          {formErr && <div className="alert alert-error">{formErr}</div>}
          <div className="modal-actions">
            <button className="btn" onClick={() => setShowForm(false)}>
              {t("Huỷ")}
            </button>
            <button className="btn btn-primary" disabled={saving} onClick={luu}>
              {saving ? t("Đang lưu...") : t("Lập phiếu")}
            </button>
          </div>
        </Modal>
      )}
      {showImport && (
        <NhapExcelPhieuCk
          khoNguon={myKho}
          khoKhac={[...khoAll, ...khoDichAll]}
          vts={vts}
          onClose={() => setShowImport(false)}
          onXong={async (m, ma) => {
            setShowImport(false);
            setMsg(ma.length ? `${m} ${ma.join(", ")}` : m);
            baoThayDoi();
            await reloadViec();
          }}
        />
      )}
    </div>
  );
}
