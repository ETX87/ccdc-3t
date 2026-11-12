import { t } from "../lib/i18n";
import { NvLink } from "../components/LienKet";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardList, Download, ListChecks, Plus, QrCode, Search } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { FilterTabs } from "../components/FilterTabs";
import { SearchSelect } from "../components/SearchSelect";
import { StatusBadge } from "../components/StatusBadge";
import { QrScannerModal } from "../components/QrScanner";
import { useChiTiet } from "../components/ChiTiet";
import { useDuLieuChung } from "../lib/duLieuChung";
import { exportRowsToExcel } from "../lib/exportExcel";
import { useNav } from "../lib/navigation";
import { baoThayDoi, useKhiThayDoi } from "../lib/suKien";
import { fmtNgay, fmtNgayGio, fmtSo, homNayVN } from "../lib/format";
import { isHcns, thongBaoLoi, TINH_TRANG_KIEM_KE, TRANG_THAI_TS } from "../lib/nhan";
import { PhanTrang, useTrangKhach } from "../components/PhanTrang";
import { TruongCongTy } from "../components/ChonCongTy";
import { congTyMacDinh, hienCongTy, maCongTy } from "../lib/congTy";
import { ChonLoc } from "../components/ChonLoc";

interface DotRow {
  id: string;
  ma_phieu: string | null;
  ten_dot: string;
  ngay_bat_dau: string;
  ngay_ket_thuc: string | null;
  trang_thai: string;
  nguoi_tao: string;
  so_luong_da_kiem: number;
  cong_ty_id: number;
}
interface CcdcRow {
  id: string;
  ten_ccdc: string;
  trang_thai_hien_tai: string;
  nguoi_dang_giu: string | null;
  nguoi_dang_giu_ten: string | null;
  ten_kho: string | null;
  cong_ty_id: number;
}
interface NhanVienRow {
  ma_nv: string;
  ten_nv: string;
}
interface KiemKeItem {
  id: number;
  ccdc_id: string;
  ten_ccdc: string;
  trang_thai_hien_tai: string;
  he_thong_nguoi_giu: string | null;
  he_thong_nguoi_giu_ten: string | null;
  tinh_trang_thuc_te: string;
  nguoi_dang_giu_thuc_te: string | null;
  nguoi_dang_giu_thuc_te_ten: string | null;
  ghi_chu: string | null;
  kiem_ke_luc?: string | null;
}

// TS can kiem = dang quan ly (khong tinh da thanh ly / tieu huy / cho duyet nhap).
const CAN_KIEM = (c: CcdcRow) => !["Da thanh ly", "Da tieu huy", "Cho duyet nhap"].includes(c.trang_thai_hien_tai);

// Kiem ke chi GHI NHAN chenh lech - khong tu sua trang thai / nguoi giu (sua that qua phieu giao nhan
// dieu chinh, co nguoi chiu trach nhiem - quy tac CLAUDE.md).
export function KiemKeScreen() {
  const auth = useAuth();
  const { params } = useNav();
  const user = auth.status === "authenticated" ? auth.user : null;
  const hc = !!user && isHcns(user);
  const [dots, setDots] = useState<DotRow[] | null>(null);
  const [activeDotId, setActiveDotId] = useState<string | null>(params.dot ?? null);
  const [showNew, setShowNew] = useState(false);
  const [dangTai, setDangTai] = useState(false);
  const [capNhatLuc, setCapNhatLuc] = useState<string | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [tongTs, setTongTs] = useState<number | null>(null);
  const [chenhLechGanNhat, setChenhLechGanNhat] = useState<number | null>(null);

  const loadDots = useCallback(async () => {
    setDangTai(true);
    try {
      const [res, tk] = await Promise.all([
        api.get<{ rows: DotRow[] }>("/dot-kiem-ke"),
        api.get<{ theo_trang_thai: { trang_thai: string; so_luong: number }[] }>("/ccdc/thong-ke"),
      ]);
      setDots(res.rows);
      setTongTs(tk.theo_trang_thai.filter((t) => !["Da thanh ly", "Da tieu huy", "Cho duyet nhap"].includes(t.trang_thai)).reduce((s, t) => s + t.so_luong, 0));
      const ganNhat = res.rows[0];
      if (ganNhat) {
        const d = await api.get<{ items: KiemKeItem[] }>(`/dot-kiem-ke/${encodeURIComponent(ganNhat.id)}`);
        setChenhLechGanNhat(d.items.filter((i) => i.tinh_trang_thuc_te !== "Dung vi tri").length);
      } else setChenhLechGanNhat(0);
      setCapNhatLuc(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace("T", " "));
    } catch (e) {
      setLoi(thongBaoLoi(e, t("Không tải được đợt kiểm kê.")));
      setDots([]);
    } finally {
      setDangTai(false);
    }
  }, []);
  useEffect(() => {
    loadDots();
  }, [loadDots]);
  useKhiThayDoi(loadDots);

  const tDot = useTrangKhach(dots);
  const activeDot = dots?.find((d) => d.id === activeDotId) ?? null;
  if (activeDot) return <ChiTietDot dot={activeDot} onBack={() => setActiveDotId(null)} onDoi={loadDots} />;

  const dangLam = (dots ?? []).filter((d) => d.trang_thai === "Dang thuc hien");
  const xong = (dots ?? []).filter((d) => d.trang_thai === "Da hoan tat");
  const ganNhat = dots?.[0];

  return (
    <div className="dashboard-container">
      <PageHeader
        title={t("Kiểm kê tài sản")}
        actions={
          hc && (
            <button className="btn btn-primary" onClick={() => setShowNew(true)}>
              <Plus size={15} /> {t("Tạo đợt kiểm kê")}
            </button>
          )
        }
        capNhatLuc={capNhatLuc}
        onRefresh={loadDots}
        dangTai={dangTai}
      />
      {loi && <div className="alert alert-error">{loi}</div>}

      <div className="kpi-grid kpi-grid-4">
        <KpiCard
          tone="cyan"
          icon={<ClipboardList size={20} className="text-white" />}
          watermark={<ClipboardList size={52} />}
          label={t("Đợt đang thực hiện")}
          value={fmtSo(dangLam.length)}
          trend={<div className="kpi-trend"><span className="trend-sub">{dangLam[0] ? dangLam[0].ten_dot : t("Không có đợt đang mở")}</span></div>}
          onClick={dangLam[0] ? () => setActiveDotId(dangLam[0].id) : undefined}
        />
        <KpiCard
          tone="blue"
          icon={<ListChecks size={20} className="text-white" />}
          watermark={<ListChecks size={52} />}
          label={t("Tiến độ đợt gần nhất")}
          value={ganNhat && tongTs ? `${fmtSo((ganNhat.so_luong_da_kiem / tongTs) * 100, 1)}%` : "0%"}
          trend={
            <div className="kpi-trend">
              <span className="trend-sub">
                {fmtSo(ganNhat?.so_luong_da_kiem ?? 0)}/{fmtSo(tongTs ?? 0)} {t("tài sản đã kiểm")}
              </span>
            </div>
          }
          onClick={ganNhat ? () => setActiveDotId(ganNhat.id) : undefined}
        />
        <KpiCard
          tone={chenhLechGanNhat ? "red" : "blue-light"}
          icon={<AlertTriangle size={20} className="text-white" />}
          watermark={<AlertTriangle size={52} />}
          label={t("Chênh lệch đợt gần nhất")}
          value={fmtSo(chenhLechGanNhat ?? 0)}
          tangLaXau
          trend={<div className={`kpi-trend ${chenhLechGanNhat ? "trend-danger" : "trend-up"}`}><span className="trend-sub">{t("Thiếu / thừa / hỏng / sai người giữ")}</span></div>}
          onClick={ganNhat ? () => setActiveDotId(ganNhat.id) : undefined}
        />
        <KpiCard
          tone="purple"
          icon={<CheckCircle2 size={20} className="text-white" />}
          watermark={<CheckCircle2 size={52} />}
          label={t("Đợt đã hoàn tất")}
          value={fmtSo(xong.length)}
          trend={<div className="kpi-trend"><span className="trend-sub">{xong[0] ? t("Gần nhất: {x}", { x: fmtNgay(xong[0].ngay_ket_thuc ?? xong[0].ngay_bat_dau) }) : t("Chưa có đợt hoàn tất")}</span></div>}
        />
      </div>

      <div className="content-card task-card-full">
        <div className="card-header">
          <div className="card-title-wrap">
            <ClipboardList size={18} className="card-title-icon text-teal" />
            <h2 className="card-title">{t("Các đợt kiểm kê")}</h2>
          </div>
        </div>
        <div className="task-table-wrapper">
          <table className="task-table">
            <thead>
              <tr>
                <th style={{ width: "13%" }}>{t("Mã đợt")}</th>
                <th>{t("Tên đợt")}</th>
                <th style={{ width: "13%" }}>{t("Bắt đầu")}</th>
                <th style={{ width: "13%" }}>{t("Kết thúc")}</th>
                <th style={{ width: "13%", textAlign: "right" }}>{t("Đã kiểm")}</th>
                <th style={{ width: "13%", textAlign: "center" }}>{t("Trạng thái")}</th>
              </tr>
            </thead>
            <tbody>
              {dots === null && (
                <tr>
                  <td colSpan={6} className="task-empty">
                    {t("Đang tải…")}
                  </td>
                </tr>
              )}
              {dots !== null && dots.length === 0 && (
                <tr>
                  <td colSpan={6} className="task-empty">
                    {t("Chưa có đợt kiểm kê nào")}{hc ? t(" - bấm “Tạo đợt kiểm kê” để bắt đầu.") : "."}
                  </td>
                </tr>
              )}
              {tDot.dongTrang.map((d) => (
                <tr key={d.id}>
                  <td data-label={t("Mã đợt")}>
                    <span className="code-link" role="button" tabIndex={0} onClick={() => setActiveDotId(d.id)}>
                      {d.ma_phieu ?? d.id.slice(0, 8)}
                    </span>
                  </td>
                  <td data-label={t("Tên đợt")} className="strong">
                    {d.ten_dot}
                    {hienCongTy(user) && <span className="muted small"> · {maCongTy(user, d.cong_ty_id)}</span>}
                  </td>
                  <td data-label={t("Bắt đầu")}>{fmtNgay(d.ngay_bat_dau)}</td>
                  <td data-label={t("Kết thúc")}>{d.ngay_ket_thuc ? fmtNgay(d.ngay_ket_thuc) : "-"}</td>
                  <td data-label={t("Đã kiểm")} style={{ textAlign: "right" }}>
                    {fmtSo(d.so_luong_da_kiem)}
                    {tongTs ? <span className="muted small"> / {fmtSo(tongTs)}</span> : null}
                  </td>
                  <td data-label={t("Trạng thái")} style={{ textAlign: "center" }}>
                    <StatusBadge label={d.trang_thai === "Da hoan tat" ? t("Đã hoàn tất") : t("Đang thực hiện")} tone={d.trang_thai === "Da hoan tat" ? "success" : "warning"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PhanTrang trang={tDot.trang} tong={tDot.tong} onDoi={tDot.setTrang} donVi={t("đợt")} />
      </div>

      {showNew && (
        <TaoDotModal
          onClose={() => setShowNew(false)}
          onDone={async (id) => {
            setShowNew(false);
            baoThayDoi();
            await loadDots();
            setActiveDotId(id);
          }}
        />
      )}
    </div>
  );
}

function TaoDotModal({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const auth = useAuth();
  // Da phap nhan: moi dot kiem ke thuoc 1 cong ty (chi kiem tai san cong ty do).
  const ctTao = congTyMacDinh(auth.status === "authenticated" ? auth.user : null);
  const [congTy, setCongTy] = useState<number | null>(ctTao.macDinh);
  const [tenDot, setTenDot] = useState(t("Kiểm kê tháng {x}/{x2}", { x: homNayVN().slice(5, 7), x2: homNayVN().slice(0, 4) }));
  const [ngay, setNgay] = useState(homNayVN());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title={t("Tạo đợt kiểm kê")} onClose={onClose}>
      {ctTao.canChon && <TruongCongTy value={congTy} ds={ctTao.ds} onChange={setCongTy} />}
      <div className="field-group">
        <label className="field-label">{t("Tên đợt *")}</label>
        <input type="text" value={tenDot} onChange={(e) => setTenDot(e.target.value)} autoFocus />
      </div>
      <div className="field-group">
        <label className="field-label">{t("Ngày bắt đầu *")}</label>
        <input type="date" value={ngay} onChange={(e) => setNgay(e.target.value)} />
      </div>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          {t("Huỷ")}
        </button>
        <button
          className="btn btn-primary"
          disabled={busy || !tenDot.trim() || !ngay}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              const r = await api.post<{ id: string }>("/dot-kiem-ke", { ten_dot: tenDot.trim(), ngay_bat_dau: ngay, cong_ty_id: congTy });
              onDone(r.id);
            } catch (e) {
              setErr(thongBaoLoi(e, t("Không tạo được đợt kiểm kê.")));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("Tạo đợt")}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
type TabDot = "da-kiem" | "chenh-lech" | "chua-kiem";

function ChiTietDot({ dot, onBack, onDoi }: { dot: DotRow; onBack: () => void; onDoi: () => Promise<void> }) {
  const auth = useAuth();
  const { moTaiSan } = useChiTiet();
  const { reload: reloadViec } = useDuLieuChung();
  const hc = auth.status === "authenticated" && isHcns(auth.user);
  const moDot = dot.trang_thai === "Dang thuc hien";
  const [items, setItems] = useState<KiemKeItem[] | null>(null);
  const [ccdcs, setCcdcs] = useState<CcdcRow[]>([]);
  const [nhanViens, setNhanViens] = useState<NhanVienRow[]>([]);
  const [tab, setTab] = useState<TabDot>("da-kiem");
  const [tim, setTim] = useState("");
  const [ccdcId, setCcdcId] = useState("");
  const [tinhTrang, setTinhTrang] = useState("Dung vi tri");
  const [nguoiGiu, setNguoiGiu] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [quet, setQuet] = useState(false);
  const [xacNhanXong, setXacNhanXong] = useState(false);

  const loadItems = useCallback(async () => {
    try {
      setItems((await api.get<{ items: KiemKeItem[] }>(`/dot-kiem-ke/${encodeURIComponent(dot.id)}`)).items);
    } catch (e) {
      setError(thongBaoLoi(e));
      setItems([]);
    }
  }, [dot.id]);

  useEffect(() => {
    loadItems();
    Promise.all([api.get<{ rows: CcdcRow[] }>("/ccdc"), api.get<{ rows: NhanVienRow[] }>(`/nhan-vien?gon=1&cong_ty_id=${dot.cong_ty_id}`)])
      .then(([cc, nv]) => {
        setCcdcs(cc.rows.filter((r) => CAN_KIEM(r) && r.cong_ty_id === dot.cong_ty_id));
        setNhanViens(nv.rows);
      })
      .catch(() => undefined);
  }, [loadItems, dot.cong_ty_id]);

  const daKiemIds = useMemo(() => new Set((items ?? []).map((i) => i.ccdc_id)), [items]);
  const chuaKiem = ccdcs.filter((c) => !daKiemIds.has(c.id));
  const chenhLech = (items ?? []).filter((i) => i.tinh_trang_thuc_te !== "Dung vi tri");
  const demTT = (k: string) => (items ?? []).filter((i) => i.tinh_trang_thuc_te === k).length;
  const ccdcOptions = useMemo(
    () => ccdcs.map((c) => ({ value: c.id, label: `${c.id} - ${c.ten_ccdc}${daKiemIds.has(c.id) ? t(" (đã kiểm - ghi đè)") : ""}` })),
    [ccdcs, daKiemIds],
  );
  const nhanVienOptions = useMemo(() => nhanViens.map((n) => ({ value: n.ma_nv, label: `${n.ten_nv} (${n.ma_nv})` })), [nhanViens]);
  const dangChon = ccdcs.find((c) => c.id === ccdcId);

  async function ghiNhan() {
    if (!ccdcId) return setError(t("Chọn hoặc quét tài sản cần ghi nhận."));
    if (tinhTrang === "Sai nguoi giu" && !nguoiGiu) return setError(t("Chọn người đang giữ thực tế."));
    setSaving(true);
    setError(null);
    try {
      await api.post(`/dot-kiem-ke/${encodeURIComponent(dot.id)}/ghi-nhan`, {
        ccdc_id: ccdcId,
        tinh_trang_thuc_te: tinhTrang,
        nguoi_dang_giu_thuc_te: tinhTrang === "Sai nguoi giu" ? nguoiGiu : undefined,
        ghi_chu: ghiChu.trim() || undefined,
      });
      setMsg(t("Đã ghi nhận {ccdcId}: {x}.", { ccdcId, x: TINH_TRANG_KIEM_KE[tinhTrang]?.label }));
      setCcdcId("");
      setNguoiGiu("");
      setGhiChu("");
      setTinhTrang("Dung vi tri");
      await loadItems();
      baoThayDoi();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setError(code === "DOT_DA_HOAN_TAT" ? t("Đợt kiểm kê này đã hoàn tất.") : thongBaoLoi(e));
    } finally {
      setSaving(false);
    }
  }

  async function hoanTat() {
    setXacNhanXong(false);
    try {
      await api.post(`/dot-kiem-ke/${encodeURIComponent(dot.id)}/hoan-tat`);
      baoThayDoi();
      await Promise.all([onDoi(), reloadViec()]);
    } catch (e) {
      setError(thongBaoLoi(e, t("Không hoàn tất được.")));
    }
  }

  async function exportExcel() {
    await exportRowsToExcel(
      [
        ...(items ?? []).map((i) => ({
          ma: i.ccdc_id,
          ten: i.ten_ccdc,
          he_thong: i.he_thong_nguoi_giu_ten ?? t("Trong kho"),
          thuc_te: TINH_TRANG_KIEM_KE[i.tinh_trang_thuc_te]?.label ?? i.tinh_trang_thuc_te,
          nguoi_giu_thuc_te: i.nguoi_dang_giu_thuc_te_ten ?? "",
          ghi_chu: i.ghi_chu ?? "",
        })),
        ...chuaKiem.map((c) => ({ ma: c.id, ten: c.ten_ccdc, he_thong: c.nguoi_dang_giu_ten ?? c.ten_kho ?? "", thuc_te: t("Chưa kiểm"), nguoi_giu_thuc_te: "", ghi_chu: "" })),
      ],
      `Kiem_ke_${(dot.ma_phieu ?? dot.id).replace(/\W+/g, "_")}.xlsx`,
      "Kiem ke",
      { ma: t("Mã tài sản"), ten: t("Tên tài sản"), he_thong: t("Hệ thống ghi nhận"), thuc_te: t("Thực tế"), nguoi_giu_thuc_te: t("Người giữ thực tế"), ghi_chu: t("Ghi chú") },
    );
  }

  const tuKhoa = tim.trim().toLowerCase();
  const loc = <T extends { ccdc_id?: string; id?: string | number; ten_ccdc: string }>(ds: T[]) =>
    tuKhoa ? ds.filter((x) => `${x.ccdc_id ?? x.id} ${x.ten_ccdc}`.toLowerCase().includes(tuKhoa)) : ds;
  const tong = ccdcs.length;
  const tKq = useTrangKhach(loc(tab === "chenh-lech" ? chenhLech : (items ?? [])), [tuKhoa, tab]);
  const tChua = useTrangKhach(loc(chuaKiem), [t]);

  return (
    <div className="dashboard-container">
      <PageHeader
        title={
          <span className="title-with-badge">
            {dot.ten_dot}
            <StatusBadge label={moDot ? t("Đang thực hiện") : t("Đã hoàn tất")} tone={moDot ? "warning" : "success"} />
          </span>
        }
        filters={
          <button className="btn btn-outline btn-sm" onClick={onBack}>
            <ArrowLeft size={13} /> {t("Các đợt")}
          </button>
        }
        actions={
          <>
            <button className="btn btn-outline" onClick={exportExcel}>
              <Download size={14} /> {t("Xuất Excel")}
            </button>
            {moDot && hc && (
              <button className="btn btn-primary" onClick={() => setXacNhanXong(true)}>
                <CheckCircle2 size={14} /> {t("Hoàn tất đợt")}
              </button>
            )}
          </>
        }
        onRefresh={loadItems}
      />

      <div className="kpi-grid kpi-grid-4">
        <KpiCard
          tone="cyan"
          icon={<ListChecks size={20} className="text-white" />}
          watermark={<ListChecks size={52} />}
          label={t("Đã kiểm")}
          value={`${fmtSo(items?.length ?? 0)}/${fmtSo(tong)}`}
          trend={
            <div className="kpi-trend trend-up">
              <span className="trend-bold">{tong ? fmtSo(((items?.length ?? 0) / tong) * 100, 1) : 0}%</span>
              <span className="trend-sub">{t("tài sản đang quản lý")}</span>
            </div>
          }
          subtext={t("{x} · bắt đầu {x2}", { x: dot.ma_phieu ?? "", x2: fmtNgay(dot.ngay_bat_dau) })}
          onClick={() => setTab("da-kiem")}
        />
        <KpiCard
          tone="blue-light"
          icon={<CheckCircle2 size={20} className="text-white" />}
          watermark={<CheckCircle2 size={52} />}
          label={t("Đúng vị trí")}
          value={fmtSo(demTT("Dung vi tri"))}
          trend={<div className="kpi-trend trend-up"><span className="trend-sub">{t("Khớp hệ thống")}</span></div>}
        />
        <KpiCard
          tone={chenhLech.length ? "red" : "purple"}
          icon={<AlertTriangle size={20} className="text-white" />}
          watermark={<AlertTriangle size={52} />}
          label={t("Chênh lệch")}
          value={fmtSo(chenhLech.length)}
          tangLaXau
          trend={
            <div className={`kpi-trend ${chenhLech.length ? "trend-danger" : ""}`}>
              <span className="trend-sub">
                {demTT("Thieu")} {t("thiếu ·")} {demTT("Thua")} {t("thừa ·")} {demTT("Hong")} {t("hỏng ·")} {demTT("Sai nguoi giu")} {t("sai người giữ")}
              </span>
            </div>
          }
          subtext={t("Sửa thực tế qua phiếu điều chuyển điều chỉnh")}
          onClick={() => setTab("chenh-lech")}
        />
        <KpiCard
          tone="yellow"
          icon={<ClipboardList size={20} className="text-white" />}
          watermark={<ClipboardList size={52} />}
          label={t("Chưa kiểm")}
          value={fmtSo(chuaKiem.length)}
          trend={<div className="kpi-trend trend-warning"><span className="trend-sub">{moDot ? t("Còn cần đi kiểm") : t("Không kiểm trong đợt này")}</span></div>}
          onClick={() => setTab("chua-kiem")}
        />
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {moDot && hc && (
        <div className="content-card">
          <div className="card-header">
            <div className="card-title-wrap">
              <ClipboardList size={17} className="card-title-icon text-teal" />
              <h2 className="card-title">{t("Ghi nhận kiểm kê")}</h2>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => setQuet(true)}>
              <QrCode size={13} /> {t("Quét tem QR")}
            </button>
          </div>
          <div className="form-grid">
            <div className="field-group">
              <label className="field-label">{t("Tài sản")}</label>
              <SearchSelect options={ccdcOptions} value={ccdcId} onChange={setCcdcId} placeholder={t("Tìm mã / tên tài sản...")} />
              {dangChon && (
                <div className="field-hint">
                  {t("Hệ thống:")} {TRANG_THAI_TS[dangChon.trang_thai_hien_tai]?.label ?? dangChon.trang_thai_hien_tai} · {dangChon.nguoi_dang_giu_ten ?? dangChon.ten_kho ?? "-"}
                </div>
              )}
            </div>
            <div className="field-group">
              <label className="field-label">{t("Tình trạng thực tế")}</label>
              <ChonLoc value={tinhTrang} onChange={(e) => setTinhTrang(e.target.value)}>
                {Object.entries(TINH_TRANG_KIEM_KE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </ChonLoc>
            </div>
            {tinhTrang === "Sai nguoi giu" && (
              <div className="field-group">
                <label className="field-label">{t("Người đang giữ thực tế")}</label>
                <SearchSelect options={nhanVienOptions} value={nguoiGiu} onChange={setNguoiGiu} placeholder={t("Tìm nhân viên...")} />
              </div>
            )}
            <div className="field-group">
              <label className="field-label">{t("Ghi chú")}</label>
              <input type="text" value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} />
            </div>
          </div>
          <div className="modal-actions" style={{ marginTop: 4 }}>
            <button className="btn btn-primary" disabled={saving} onClick={ghiNhan}>
              {saving ? t("Đang lưu...") : t("Ghi nhận")}
            </button>
          </div>
        </div>
      )}

      <div className="content-card task-card-full">
        <div className="card-header">
          <FilterTabs<TabDot>
            value={tab}
            onChange={setTab}
            tabs={[
              { key: "da-kiem", label: t("Đã kiểm"), count: items?.length ?? 0 },
              { key: "chenh-lech", label: t("Chênh lệch"), count: chenhLech.length },
              { key: "chua-kiem", label: t("Chưa kiểm"), count: chuaKiem.length },
            ]}
          />
          <div className="topbar-search filter-search">
            <Search size={15} className="search-icon" />
            <input className="search-input" placeholder={t("Tìm mã, tên tài sản...")} value={tim} onChange={(e) => setTim(e.target.value)} />
          </div>
        </div>
        <div className="task-table-wrapper">
          {tab !== "chua-kiem" ? (
            <table className="task-table">
              <thead>
                <tr>
                  <th style={{ width: "14%" }}>{t("Mã tài sản")}</th>
                  <th>{t("Tên tài sản")}</th>
                  <th style={{ width: "18%" }}>{t("Hệ thống ghi nhận")}</th>
                  <th style={{ width: "13%", textAlign: "center" }}>{t("Thực tế")}</th>
                  <th style={{ width: "16%" }}>{t("Người giữ thực tế")}</th>
                  <th style={{ width: "16%" }}>{t("Ghi chú")}</th>
                </tr>
              </thead>
              <tbody>
                {items === null && (
                  <tr>
                    <td colSpan={6} className="task-empty">
                      {t("Đang tải…")}
                    </td>
                  </tr>
                )}
                {items !== null && loc(tab === "chenh-lech" ? chenhLech : items).length === 0 && (
                  <tr>
                    <td colSpan={6} className="task-empty">
                      {tab === "chenh-lech" ? t("Không có chênh lệch.") : t("Chưa ghi nhận tài sản nào.")}
                    </td>
                  </tr>
                )}
                {tKq.dongTrang.map((it) => {
                  const tt = TINH_TRANG_KIEM_KE[it.tinh_trang_thuc_te];
                  return (
                    <tr key={it.id}>
                      <td data-label={t("Mã tài sản")}>
                        <span className="code-link" onClick={() => moTaiSan(it.ccdc_id)}>
                          {it.ccdc_id}
                        </span>
                      </td>
                      <td data-label={t("Tên tài sản")}>{it.ten_ccdc}</td>
                      <td data-label={t("Hệ thống")} className="text-secondary">
                        {it.he_thong_nguoi_giu_ten ?? t("Trong kho")}
                      </td>
                      <td data-label={t("Thực tế")} style={{ textAlign: "center" }}>
                        <StatusBadge label={tt?.label ?? it.tinh_trang_thuc_te} tone={tt?.tone ?? "neutral"} />
                      </td>
                      <td data-label={t("Người giữ thực tế")}>{it.nguoi_dang_giu_thuc_te_ten ?? "-"}</td>
                      <td data-label={t("Ghi chú")} className="text-secondary">
                        {it.ghi_chu ?? "-"}
                        {it.kiem_ke_luc && <div className="small">{fmtNgayGio(it.kiem_ke_luc)}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="task-table">
              <thead>
                <tr>
                  <th style={{ width: "16%" }}>{t("Mã tài sản")}</th>
                  <th>{t("Tên tài sản")}</th>
                  <th style={{ width: "16%" }}>{t("Trạng thái hệ thống")}</th>
                  <th style={{ width: "24%" }}>{t("Vị trí / người giữ")}</th>
                  {moDot && hc && <th style={{ width: "12%", textAlign: "right" }}>{t("Ghi nhận")}</th>}
                </tr>
              </thead>
              <tbody>
                {loc(chuaKiem).length === 0 && (
                  <tr>
                    <td colSpan={5} className="task-empty">
                      {t("Đã kiểm hết tài sản.")}
                    </td>
                  </tr>
                )}
                {tChua.dongTrang.map((c) => (
                    <tr key={c.id}>
                      <td data-label={t("Mã tài sản")}>
                        <span className="code-link" onClick={() => moTaiSan(c.id)}>
                          {c.id}
                        </span>
                      </td>
                      <td data-label={t("Tên tài sản")}>{c.ten_ccdc}</td>
                      <td data-label={t("Trạng thái")}>{TRANG_THAI_TS[c.trang_thai_hien_tai]?.label ?? c.trang_thai_hien_tai}</td>
                      <td data-label={t("Vị trí")} className="text-secondary">
                        {c.nguoi_dang_giu_ten ? <NvLink ma={c.nguoi_dang_giu} ten={c.nguoi_dang_giu_ten} /> : (c.ten_kho ?? "-")}
                      </td>
                      {moDot && hc && (
                        <td data-label={t("Ghi nhận")} style={{ textAlign: "right" }}>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => {
                              setCcdcId(c.id);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                              document.querySelector(".content")?.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          >
                            {t("Chọn")}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
        {tab === "chua-kiem" ? (
          <PhanTrang trang={tChua.trang} tong={tChua.tong} onDoi={tChua.setTrang} donVi={t("tài sản")} />
        ) : (
          <PhanTrang trang={tKq.trang} tong={tKq.tong} onDoi={tKq.setTrang} donVi={t("tài sản")} />
        )}
      </div>

      {quet && (
        <QrScannerModal
          onClose={() => setQuet(false)}
          onResult={(ma) => {
            setQuet(false);
            if (ccdcs.some((c) => c.id === ma)) {
              setCcdcId(ma);
              setError(null);
            } else setError(t("Mã \"{ma}\" không thuộc danh sách tài sản cần kiểm.", { ma }));
          }}
        />
      )}

      {xacNhanXong && (
        <Modal title={t("Hoàn tất đợt kiểm kê")} onClose={() => setXacNhanXong(false)}>
          <p>
            {t("Hoàn tất")} <b>{dot.ten_dot}</b>{t("? Sau khi hoàn tất không ghi nhận thêm được. Hiện đã kiểm")} {fmtSo(items?.length ?? 0)}/{fmtSo(tong)} {t("tài sản,")}{" "}
            {fmtSo(chenhLech.length)} {t("chênh lệch,")} {fmtSo(chuaKiem.length)} {t("chưa kiểm.")}
          </p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setXacNhanXong(false)}>
              {t("Huỷ")}
            </button>
            <button className="btn btn-primary" onClick={hoanTat}>
              {t("Hoàn tất đợt")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
