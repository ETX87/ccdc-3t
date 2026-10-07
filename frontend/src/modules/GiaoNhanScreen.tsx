import { t } from "../lib/i18n";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight, CalendarDays, ChevronDown, Laptop, Plus, UserCheck } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Modal } from "../components/Modal";
import { ChonTep } from "../components/DinhKem";
import { taiLenTepCho, type TepCho } from "../lib/dinhKem";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { FilterTabs } from "../components/FilterTabs";
import { SearchSelect } from "../components/SearchSelect";
import { StatusBadge } from "../components/StatusBadge";
import { useChiTiet } from "../components/ChiTiet";
import { useDuLieuChung } from "../lib/duLieuChung";
import { useNav } from "../lib/navigation";
import { baoThayDoi, useKhiThayDoi } from "../lib/suKien";
import { fmtNgayGio, fmtSo, homNayVN } from "../lib/format";
import { LOAI_GIAO_NHAN, LOAI_KHO, isHcns, thongBaoLoi } from "../lib/nhan";
import type { LoaiKho } from "../types";
import { PhanTrang, useTrangKhach } from "../components/PhanTrang";

interface NhanVienRow {
  ma_nv: string;
  ten_nv: string;
}
interface KhoRow {
  id: number;
  ten_kho: string;
  loai: LoaiKho;
  bat_tat: number;
}
interface CcdcRow {
  id: string;
  ten_ccdc: string;
  trang_thai_hien_tai: string;
  nguoi_dang_giu: string | null;
  kho_id: number | null;
}
interface PhieuRow {
  id: string;
  ma_phieu: string | null;
  loai_phieu: string;
  nhan_vien_ten: string | null;
  nhan_vien_nhan_moi_ten: string | null;
  tu_kho_id: number | null;
  tu_kho_ten: string | null;
  den_kho_id: number | null;
  den_kho_ten: string | null;
  nguoi_lap: string;
  ngay_lap: string;
  da_xac_nhan: number;
  so_luong_ccdc: number;
  tom_tat: string | null;
}
type Loai = "Cap phat" | "Thu hoi" | "Dieu chuyen" | "Chuyen kho";
type TabXacNhan = "tat-ca" | "cho" | "xong";

const MO_TA_LOAI: Record<Loai, string> = {
  "Cap phat": t("kho → nhân viên"),
  "Thu hoi": t("nhân viên → kho"),
  "Dieu chuyen": t("nhân viên → nhân viên"),
  "Chuyen kho": "kho → kho",
};

function tuDen(p: PhieuRow): [string | null, string | null] {
  if (p.loai_phieu === "Cap phat") return [p.tu_kho_ten, p.nhan_vien_ten];
  if (p.loai_phieu === "Thu hoi") return [p.nhan_vien_ten, p.den_kho_ten];
  if (p.loai_phieu === "Dieu chuyen") return [p.nhan_vien_ten, p.nhan_vien_nhan_moi_ten];
  return [p.tu_kho_ten, p.den_kho_ten];
}

const quaHan = (ngay: string) => Date.now() + 7 * 3600e3 - Date.parse(`${ngay.replace(" ", "T")}Z`) > 48 * 3600e3;

// Giao nhan TAI SAN CO DINH (cap phat / thu hoi / dieu chuyen / chuyen kho). Quyen that kiem o server
// (thu kho nguon/dich, QL chi trong nhom); danh sach loc theo pham vi o server.
export function GiaoNhanScreen() {
  const auth = useAuth();
  const { params } = useNav();
  const { moPhieu } = useChiTiet();
  const { viec, reload: reloadViec } = useDuLieuChung();
  const user = auth.status === "authenticated" ? auth.user : null;
  const myKho = useMemo(() => (user?.kho_phu_trach ?? []).filter((k) => k.loai !== "Mua hang"), [user]);
  const toanQuyen = !!user && (isHcns(user) || myKho.some((k) => k.loai === "HCNS" || k.loai === "Mien"));

  const [phieus, setPhieus] = useState<PhieuRow[] | null>(null);
  const [choXacNhan, setChoXacNhan] = useState<PhieuRow[]>([]);
  const [thang, setThang] = useState(params.thang ?? homNayVN().slice(0, 7));
  const [loaiLoc, setLoaiLoc] = useState(params.loai ?? "");
  const [tabXn, setTabXn] = useState<TabXacNhan>(params.da_xac_nhan === "0" ? "cho" : "tat-ca");
  const [showForm, setShowForm] = useState(false);
  const [dangTai, setDangTai] = useState(false);
  const [capNhatLuc, setCapNhatLuc] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loi, setLoi] = useState<string | null>(null);

  const load = useCallback(async () => {
    setDangTai(true);
    setLoi(null);
    const qs = new URLSearchParams();
    if (thang) qs.set("thang", thang);
    if (loaiLoc) qs.set("loai_phieu", loaiLoc);
    try {
      const [ds, cho] = await Promise.all([
        api.get<{ rows: PhieuRow[] }>(`/phieu-giao-nhan?${qs}`),
        api.get<{ rows: PhieuRow[] }>("/phieu-giao-nhan?da_xac_nhan=0"),
      ]);
      setPhieus(ds.rows);
      setChoXacNhan(cho.rows);
      setCapNhatLuc(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace("T", " "));
    } catch (e) {
      setLoi(thongBaoLoi(e, t("Không tải được danh sách phiếu.")));
      setPhieus([]);
    } finally {
      setDangTai(false);
    }
  }, [thang, loaiLoc]);
  useEffect(() => {
    load();
  }, [load]);
  useKhiThayDoi(load);

  const choToi = (viec?.rows ?? []).filter((r) => r.hanh_dong === "xac_nhan_gn");
  const hienThi = (phieus ?? []).filter((p) => (tabXn === "cho" ? !p.da_xac_nhan : tabXn === "xong" ? !!p.da_xac_nhan : true));
  const tGn = useTrangKhach(hienThi, [tabXn]);
  const soTs = (phieus ?? []).reduce((s, p) => s + p.so_luong_ccdc, 0);
  const choQuaHan = choXacNhan.filter((p) => quaHan(p.ngay_lap)).length;
  const tenThang = thang ? `${thang.slice(5)}/${thang.slice(0, 4)}` : t("mọi thời điểm");

  if (!user) return null;
  const loaiCoTheChon: Loai[] = myKho.length ? ["Cap phat", "Thu hoi", "Dieu chuyen", "Chuyen kho"] : ["Dieu chuyen"];

  return (
    <div className="dashboard-container">
      <PageHeader
        title={t("Điều chuyển tài sản")}
        filters={
          <>
            <input type="month" className="header-month" value={thang} onChange={(e) => setThang(e.target.value)} aria-label={t("Tháng")} />
            <label className="header-dropdown select-dropdown">
              <select value={loaiLoc} onChange={(e) => setLoaiLoc(e.target.value)} aria-label={t("Loại phiếu")}>
                <option value="">{t("Tất cả loại phiếu")}</option>
                {Object.entries(LOAI_GIAO_NHAN).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="dropdown-arrow" />
            </label>
          </>
        }
        actions={
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={15} /> {t("Lập phiếu giao nhận")}
          </button>
        }
        capNhatLuc={capNhatLuc}
        onRefresh={load}
        dangTai={dangTai}
      />

      <div className="kpi-grid kpi-grid-4">
        <KpiCard
          tone="cyan"
          icon={<CalendarDays size={20} className="text-white" />}
          watermark={<ArrowLeftRight size={52} />}
          label={t("Phiếu {tenThang}", { tenThang })}
          value={fmtSo(phieus?.length ?? 0)}
          trend={
            <div className="kpi-trend">
              <span className="trend-sub">
                {Object.entries(LOAI_GIAO_NHAN)
                  .map(([k, v]) => `${(phieus ?? []).filter((p) => p.loai_phieu === k).length} ${v.toLowerCase()}`)
                  .join(" · ")}
              </span>
            </div>
          }
          onClick={() => setTabXn("tat-ca")}
        />
        <KpiCard
          tone="blue"
          icon={<Laptop size={20} className="text-white" />}
          watermark={<Laptop size={52} />}
          label={t("Tài sản đã luân chuyển")}
          value={fmtSo(soTs)}
          trend={<div className="kpi-trend"><span className="trend-sub">{t("Tổng tài sản trên các phiếu")} {tenThang}</span></div>}
        />
        <KpiCard
          tone={choQuaHan ? "red" : "yellow"}
          icon={<AlertTriangle size={20} className="text-white" />}
          watermark={<AlertTriangle size={52} />}
          label={t("Chưa xác nhận nhận")}
          value={fmtSo(choXacNhan.length)}
          tangLaXau
          trend={
            <div className={`kpi-trend ${choQuaHan ? "trend-danger" : ""}`}>
              <span className="trend-bold">{fmtSo(choQuaHan)}</span>
              <span className="trend-sub">{t("phiếu quá 48 giờ (mọi tháng)")}</span>
            </div>
          }
          onClick={() => (setThang(""), setTabXn("cho"))}
        />
        <KpiCard
          tone="purple"
          icon={<UserCheck size={20} className="text-white" />}
          watermark={<UserCheck size={52} />}
          label={t("Chờ tôi xác nhận")}
          value={fmtSo(choToi.length)}
          trend={<div className="kpi-trend"><span className="trend-sub">{t("Bấm mã phiếu để xác nhận đã nhận")}</span></div>}
          onClick={choToi[0] ? () => moPhieu("giao_nhan", choToi[0].id) : undefined}
        />
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}
      {loi && <div className="alert alert-error">{loi}</div>}

      <div className="content-card task-card-full">
        <div className="card-header">
          <div className="card-title-wrap">
            <ArrowLeftRight size={18} className="card-title-icon text-teal" />
            <h2 className="card-title">{t("Phiếu giao nhận tài sản cố định")}</h2>
          </div>
          <FilterTabs<TabXacNhan>
            value={tabXn}
            onChange={setTabXn}
            tabs={[
              { key: "tat-ca", label: t("Tất cả"), count: phieus?.length ?? 0 },
              { key: "cho", label: t("Chưa xác nhận"), count: (phieus ?? []).filter((p) => !p.da_xac_nhan).length },
              { key: "xong", label: t("Đã xác nhận"), count: (phieus ?? []).filter((p) => p.da_xac_nhan).length },
            ]}
          />
        </div>
        <div className="task-table-wrapper">
          <table className="task-table">
            <thead>
              <tr>
                <th style={{ width: "13%" }}>{t("Mã phiếu")}</th>
                <th style={{ width: "11%" }}>{t("Loại")}</th>
                <th style={{ width: "17%" }}>{t("Từ")}</th>
                <th style={{ width: "17%" }}>{t("Đến")}</th>
                <th>{t("Tài sản")}</th>
                <th style={{ width: "12%" }}>{t("Ngày lập")}</th>
                <th style={{ width: "12%", textAlign: "center" }}>{t("Xác nhận")}</th>
              </tr>
            </thead>
            <tbody>
              {phieus === null && (
                <tr>
                  <td colSpan={7} className="task-empty">
                    {t("Đang tải…")}
                  </td>
                </tr>
              )}
              {phieus !== null && hienThi.length === 0 && (
                <tr>
                  <td colSpan={7} className="task-empty">
                    {t("Không có phiếu nào")} {thang ? t("trong tháng {tenThang}", { tenThang }) : ""}.
                  </td>
                </tr>
              )}
              {tGn.dongTrang.map((p) => {
                const [tu, den] = tuDen(p);
                const tre = !p.da_xac_nhan && quaHan(p.ngay_lap);
                return (
                  <tr key={p.id} className={tre ? "row-overdue" : undefined}>
                    <td data-label={t("Mã phiếu")}>
                      <span className="code-link" role="button" tabIndex={0} onClick={() => moPhieu("giao_nhan", p.id)}>
                        {p.ma_phieu ?? p.id.slice(0, 8)}
                      </span>
                    </td>
                    <td data-label={t("Loại")}>{LOAI_GIAO_NHAN[p.loai_phieu] ?? p.loai_phieu}</td>
                    <td data-label={t("Từ")} className="text-secondary">
                      {tu ?? "-"}
                    </td>
                    <td data-label={t("Đến")}>{den ?? "-"}</td>
                    <td data-label={t("Tài sản")}>
                      <span className="strong">{p.so_luong_ccdc} TS</span>
                      {p.tom_tat && <span className="muted small"> · {p.tom_tat}</span>}
                    </td>
                    <td data-label={t("Ngày lập")} className="text-secondary">
                      {fmtNgayGio(p.ngay_lap)}
                    </td>
                    <td data-label={t("Xác nhận")} style={{ textAlign: "center" }}>
                      {p.da_xac_nhan ? (
                        <StatusBadge label={t("Đã xác nhận")} tone="success" />
                      ) : (
                        <StatusBadge label={tre ? t("Quá 48 giờ") : t("Chờ xác nhận")} tone={tre ? "danger" : "warning"} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PhanTrang trang={tGn.trang} tong={tGn.tong} onDoi={tGn.setTrang} donVi={t("phiếu")} />
      </div>

      {showForm && (
        <LapPhieuModal
          loaiCoTheChon={loaiCoTheChon}
          toanQuyen={toanQuyen}
          onClose={() => setShowForm(false)}
          onDone={async (id, loai) => {
            setShowForm(false);
            setMsg(
              t("Đã lập phiếu {x}{x2}", { x: LOAI_GIAO_NHAN[loai].toLowerCase(), x2: loai === "Cap phat" || loai === "Dieu chuyen" ? t(" - chờ nhân viên xác nhận đã nhận.") : t(" - chờ kho nhận xác nhận.") }),
            );
            baoThayDoi();
            await reloadViec();
            moPhieu("giao_nhan", id);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
function LapPhieuModal({
  loaiCoTheChon,
  toanQuyen,
  onClose,
  onDone,
}: {
  loaiCoTheChon: Loai[];
  toanQuyen: boolean;
  onClose: () => void;
  onDone: (id: string, loai: Loai) => void;
}) {
  const auth = useAuth();
  const user = auth.status === "authenticated" ? auth.user : null;
  const myKho = useMemo(() => (user?.kho_phu_trach ?? []).filter((k) => k.loai !== "Mua hang"), [user]);
  const [nhanViens, setNhanViens] = useState<NhanVienRow[]>([]);
  const [khoAll, setKhoAll] = useState<KhoRow[]>([]);
  const [ccdcs, setCcdcs] = useState<CcdcRow[] | null>(null);
  const [loai, setLoai] = useState<Loai>(loaiCoTheChon[0]);
  const [tuKho, setTuKho] = useState<number | "">(myKho[0]?.id ?? "");
  const [denKho, setDenKho] = useState<number | "">("");
  const [nhanVienId, setNhanVienId] = useState("");
  const [nhanVienMoiId, setNhanVienMoiId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [timTs, setTimTs] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const [tep, setTep] = useState<TepCho[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ rows: NhanVienRow[] }>("/nhan-vien?gon=1"),
      api.get<{ rows: CcdcRow[] }>("/ccdc"),
      api.get<{ rows: KhoRow[] }>("/kho"),
      api.get<{ rows: NhanVienRow[] }>("/nhan-vien/cap-duoi"),
    ])
      .then(([nv, cc, k, cd]) => {
        // QL thuan: chi chinh minh + cap duoi truc tiep.
        if (!toanQuyen && user?.ma_nv) {
          const self = nv.rows.find((n) => n.ma_nv === user.ma_nv);
          setNhanViens([...(self ? [self] : []), ...cd.rows]);
        } else setNhanViens(nv.rows);
        setCcdcs(cc.rows);
        setKhoAll(k.rows.filter((x) => x.bat_tat && x.loai !== "Mua hang"));
      })
      .catch((e) => setError(thongBaoLoi(e, t("Không tải được dữ liệu."))));
  }, [toanQuyen, user]);

  const nvOptions = useMemo(() => nhanViens.map((n) => ({ value: n.ma_nv, label: `${n.ten_nv} (${n.ma_nv})` })), [nhanViens]);
  const eligible = useMemo(() => {
    const ds = ccdcs ?? [];
    let kq: CcdcRow[];
    if (loai === "Cap phat" || loai === "Chuyen kho") kq = ds.filter((c) => c.trang_thai_hien_tai === "Trong kho" && c.kho_id === tuKho);
    else if (!nhanVienId) kq = [];
    else kq = ds.filter((c) => c.trang_thai_hien_tai === "Dang cap phat" && c.nguoi_dang_giu === nhanVienId);
    const t = timTs.trim().toLowerCase();
    return t ? kq.filter((c) => c.id.toLowerCase().includes(t) || c.ten_ccdc.toLowerCase().includes(t)) : kq;
  }, [ccdcs, loai, tuKho, nhanVienId, timTs]);

  function doiLoai(l: Loai) {
    setLoai(l);
    setSelected(new Set());
    setNhanVienId("");
    setNhanVienMoiId("");
    setDenKho(l === "Thu hoi" ? (myKho[0]?.id ?? "") : "");
  }

  async function submit() {
    if ((loai === "Cap phat" || loai === "Chuyen kho") && !tuKho) return setError(t("Chọn kho nguồn."));
    if ((loai === "Thu hoi" || loai === "Chuyen kho") && !denKho) return setError(t("Chọn kho nhận."));
    if (loai !== "Chuyen kho" && !nhanVienId) return setError(t("Chọn nhân viên."));
    if (loai === "Dieu chuyen" && !nhanVienMoiId) return setError(t("Chọn nhân viên nhận mới."));
    if (selected.size === 0) return setError(t("Chọn ít nhất 1 tài sản."));
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<{ id: string }>("/phieu-giao-nhan", {
        loai_phieu: loai,
        tu_kho_id: loai === "Cap phat" || loai === "Chuyen kho" ? tuKho : null,
        den_kho_id: loai === "Thu hoi" || loai === "Chuyen kho" ? denKho : null,
        nhan_vien_id: loai === "Chuyen kho" ? null : nhanVienId,
        nhan_vien_nhan_moi_id: loai === "Dieu chuyen" ? nhanVienMoiId : null,
        ghi_chu: ghiChu || undefined,
        items: [...selected].map((ccdc_id) => ({ ccdc_id })),
      });
      // Tep loi van mo phieu binh thuong - nguoi dung tai lai trong popup chi tiet phieu.
      if (tep.length) await taiLenTepCho("giao_nhan", r.id, tep);
      onDone(r.id, loai);
    } catch (e) {
      setError(thongBaoLoi(e, t("Không tạo được phiếu - vui lòng thử lại.")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal size="lg" title={t("Lập phiếu giao nhận tài sản")} onClose={onClose}>
      <div className="form-grid">
        <div className="field-group">
          <label className="field-label">{t("Loại phiếu")}</label>
          <select value={loai} onChange={(e) => doiLoai(e.target.value as Loai)}>
            {loaiCoTheChon.map((l) => (
              <option key={l} value={l}>
                {LOAI_GIAO_NHAN[l]} ({MO_TA_LOAI[l]})
              </option>
            ))}
          </select>
        </div>
        {(loai === "Cap phat" || loai === "Chuyen kho") && (
          <div className="field-group">
            <label className="field-label">{t("Kho nguồn")}</label>
            <select
              value={tuKho}
              onChange={(e) => {
                setTuKho(Number(e.target.value));
                setSelected(new Set());
              }}
            >
              {myKho.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.ten_kho} ({LOAI_KHO[k.loai]})
                </option>
              ))}
            </select>
          </div>
        )}
        {loai !== "Chuyen kho" && (
          <div className="field-group">
            <label className="field-label">{loai === "Cap phat" ? t("Nhân viên nhận") : t("Nhân viên đang giữ")}</label>
            <SearchSelect
              options={nvOptions}
              value={nhanVienId}
              onChange={(v) => {
                setNhanVienId(v);
                setSelected(new Set());
              }}
              placeholder={t("Tìm nhân viên...")}
            />
          </div>
        )}
        {loai === "Dieu chuyen" && (
          <div className="field-group">
            <label className="field-label">{t("Nhân viên nhận mới")}</label>
            <SearchSelect options={nvOptions} value={nhanVienMoiId} onChange={setNhanVienMoiId} placeholder={t("Tìm nhân viên...")} />
          </div>
        )}
        {(loai === "Thu hoi" || loai === "Chuyen kho") && (
          <div className="field-group">
            <label className="field-label">{t("Kho nhận")}</label>
            <select value={denKho} onChange={(e) => setDenKho(e.target.value ? Number(e.target.value) : "")}>
              <option value="">{t("-- Chọn kho --")}</option>
              {(loai === "Thu hoi" ? myKho : khoAll.filter((k) => k.id !== tuKho)).map((k) => (
                <option key={k.id} value={k.id}>
                  {k.ten_kho} ({LOAI_KHO[k.loai]})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="field-group">
        <label className="field-label">
          {t("Chọn tài sản (")}{selected.size} {t("đã chọn /")} {eligible.length} {t("phù hợp)")}
        </label>
        <input type="text" placeholder={t("Lọc theo mã, tên tài sản...")} value={timTs} onChange={(e) => setTimTs(e.target.value)} />
        <div className="pick-list">
          {ccdcs === null && <div className="muted small">{t("Đang tải…")}</div>}
          {ccdcs !== null && eligible.length === 0 && (
            <div className="muted small">{loai === "Cap phat" || loai === "Chuyen kho" ? t("Kho nguồn không có tài sản trong kho.") : nhanVienId ? t("Nhân viên không giữ tài sản nào.") : t("Chọn nhân viên trước.")}</div>
          )}
          {eligible.length > 0 && (
            <label className="check-label pick-all">
              <input
                type="checkbox"
                checked={eligible.every((c) => selected.has(c.id))}
                onChange={(e) => {
                  const n = new Set(selected);
                  eligible.forEach((c) => (e.target.checked ? n.add(c.id) : n.delete(c.id)));
                  setSelected(n);
                }}
              />
              {t("Chọn tất cả đang hiển thị")}
            </label>
          )}
          {eligible.map((c) => (
            <label key={c.id} className="check-label">
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => {
                  const n = new Set(selected);
                  if (n.has(c.id)) n.delete(c.id);
                  else n.add(c.id);
                  setSelected(n);
                }}
              />
              <span className="code-text">{c.id}</span> {c.ten_ccdc}
            </label>
          ))}
        </div>
      </div>

      <div className="field-group">
        <label className="field-label">{t("Ghi chú")}</label>
        <textarea rows={2} value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} />
      </div>
      <ChonTep tep={tep} onDoi={setTep} loaiMacDinh="Bang chung" />
      {error && <div className="alert alert-error">{error}</div>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          {t("Huỷ")}
        </button>
        <button className="btn btn-primary" disabled={saving} onClick={submit}>
          {saving ? t("Đang lưu...") : t("Tạo phiếu ({size} TS)", { size: selected.size })}
        </button>
      </div>
    </Modal>
  );
}
