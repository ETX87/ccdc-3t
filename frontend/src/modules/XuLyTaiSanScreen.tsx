import { t } from "../lib/i18n";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, Coins, Plus, Trash2, Wrench, XCircle } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Modal } from "../components/Modal";
import { ChonTep } from "../components/DinhKem";
import { taiLenTepCho, type TepCho } from "../lib/dinhKem";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { FilterTabs } from "../components/FilterTabs";
import { StatusBadge } from "../components/StatusBadge";
import { useChiTiet } from "../components/ChiTiet";
import { useDuLieuChung } from "../lib/duLieuChung";
import { useNav } from "../lib/navigation";
import { baoThayDoi, useKhiThayDoi } from "../lib/suKien";
import { fmtGiaTri, fmtGiaTriDong, fmtNgayGio, fmtSo, homNayVN } from "../lib/format";
import { LOAI_XU_LY, TRANG_THAI_TS, TRANG_THAI_XU_LY, isHcns, thongBaoLoi } from "../lib/nhan";
import { PhanTrang, useTrangKhach } from "../components/PhanTrang";
import { LoaiChip, NgayCho, soGioTu, TienTe } from "../components/NoiBat";
import { ChonLoc } from "../components/ChonLoc";

interface PhieuRow {
  id: string;
  ma_phieu: string | null;
  loai: string;
  ly_do: string | null;
  ngay_de_xuat: string;
  nguoi_de_xuat: string;
  trang_thai: string;
  gia_tri_thu_hoi: number | null;
  so_luong_ccdc: number;
  tom_tat: string | null;
  nguyen_gia: number | null;
}
interface CcdcRow {
  id: string;
  ten_ccdc: string;
  trang_thai_hien_tai: string;
  nguoi_dang_giu: string | null;
  nguoi_dang_giu_ten: string | null;
  ten_kho: string | null;
  nguyen_gia: number | null;
}
type LoaiDeXuat = "Bao hong" | "Thanh ly" | "Tieu huy";
type TabTT = "" | "Cho ke toan duyet" | "Da duyet" | "Da hoan tat" | "Tu choi";

// 2 man dung chung: "bao-hong" (moi nguoi bao hong TS minh giu / nhom / kho minh; HCNS xu ly TS hong)
// va "thanh-ly" (HCNS de xuat thanh ly / tieu huy TS dang trong kho). Duyet / tu choi / hoan tat o popup
// chi tiet phieu (useChiTiet) - khong con prompt()/alert()/confirm().
export function XuLyTaiSanScreen() {
  const auth = useAuth();
  const { tab: manHinh, params } = useNav();
  const { moPhieu, moTaiSan } = useChiTiet();
  const { reload: reloadViec } = useDuLieuChung();
  const user = auth.status === "authenticated" ? auth.user : null;
  const laBaoHong = manHinh === "bao-hong";
  const loaiMan = laBaoHong ? "Bao hong" : "Thanh ly,Tieu huy";

  const [rows, setRows] = useState<PhieuRow[] | null>(null);
  const [nam, setNam] = useState(params.nam ?? homNayVN().slice(0, 4));
  const [loaiLoc, setLoaiLoc] = useState("");
  const [tabTT, setTabTT] = useState<TabTT>((params.trang_thai as TabTT) ?? "");
  const [tsHong, setTsHong] = useState<CcdcRow[]>([]);
  const [form, setForm] = useState<LoaiDeXuat | null>(null);
  const [suaXong, setSuaXong] = useState<CcdcRow | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const [capNhatLuc, setCapNhatLuc] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loi, setLoi] = useState<string | null>(null);

  const load = useCallback(async () => {
    setDangTai(true);
    setLoi(null);
    const qs = new URLSearchParams({ loai: loaiLoc || loaiMan });
    if (nam) qs.set("nam", nam);
    try {
      const [r, h] = await Promise.all([
        api.get<{ rows: PhieuRow[] }>(`/phieu-xu-ly-ts?${qs}`),
        user && isHcns(user) ? api.get<{ rows: CcdcRow[] }>("/ccdc?trang_thai=Hong") : Promise.resolve({ rows: [] as CcdcRow[] }),
      ]);
      setRows(r.rows);
      setTsHong(h.rows);
      setCapNhatLuc(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace("T", " "));
    } catch (e) {
      setLoi(thongBaoLoi(e, t("Không tải được danh sách phiếu.")));
      setRows([]);
    } finally {
      setDangTai(false);
    }
  }, [loaiLoc, loaiMan, nam, user]);
  useEffect(() => {
    load();
  }, [load]);
  useKhiThayDoi(load);

  const all = rows ?? [];
  const dem = (tt: string) => all.filter((r) => r.trang_thai === tt);
  const tong = (ds: PhieuRow[], k: "so_luong_ccdc" | "nguyen_gia" | "gia_tri_thu_hoi") => ds.reduce((s, r) => s + (r[k] ?? 0), 0);
  const hienThi = tabTT ? all.filter((r) => r.trang_thai === tabTT) : all;
  const tXl = useTrangKhach(hienThi, [tabTT]);
  const tHong = useTrangKhach(tsHong);

  async function xacNhanSuaXong(c: CcdcRow) {
    setSuaXong(null);
    try {
      await api.post(`/ccdc/${encodeURIComponent(c.id)}/sua-xong`);
      setMsg(t("Đã đưa {id} trở lại kho sau sửa chữa.", { id: c.id }));
      baoThayDoi();
      await reloadViec();
    } catch (e) {
      setLoi(thongBaoLoi(e));
    }
  }

  if (!user) return null;
  const hc = isHcns(user);
  const namHienTai = Number(homNayVN().slice(0, 4));

  return (
    <div className="dashboard-container">
      <PageHeader
        title={laBaoHong ? t("Báo hỏng tài sản") : t("Thanh lý & tiêu hủy")}
        filters={
          <>
            <label className="header-dropdown select-dropdown">
              <ChonLoc value={nam} onChange={(e) => setNam(e.target.value)} aria-label={t("Năm")}>
                <option value="">{t("Mọi năm")}</option>
                {[0, 1, 2].map((i) => (
                  <option key={i} value={String(namHienTai - i)}>
                    {t("Năm")} {namHienTai - i}
                  </option>
                ))}
              </ChonLoc>
              <ChevronDown size={13} className="dropdown-arrow" />
            </label>
            {!laBaoHong && (
              <label className="header-dropdown select-dropdown">
                <ChonLoc value={loaiLoc} onChange={(e) => setLoaiLoc(e.target.value)} aria-label={t("Hình thức")}>
                  <option value="">{t("Thanh lý + tiêu hủy")}</option>
                  <option value="Thanh ly">{t("Chỉ thanh lý")}</option>
                  <option value="Tieu huy">{t("Chỉ tiêu hủy")}</option>
                </ChonLoc>
                <ChevronDown size={13} className="dropdown-arrow" />
              </label>
            )}
          </>
        }
        actions={
          laBaoHong ? (
            <button className="btn btn-primary" onClick={() => setForm("Bao hong")}>
              <Plus size={15} /> {t("Báo hỏng")}
            </button>
          ) : (
            hc && (
              <>
                <button className="btn btn-outline" onClick={() => setForm("Tieu huy")}>
                  <Trash2 size={14} /> {t("Đề xuất tiêu hủy")}
                </button>
                <button className="btn btn-primary" onClick={() => setForm("Thanh ly")}>
                  <Plus size={15} /> {t("Đề xuất thanh lý")}
                </button>
              </>
            )
          )
        }
        capNhatLuc={capNhatLuc}
        onRefresh={load}
        dangTai={dangTai}
      />

      <div className="kpi-grid kpi-grid-4">
        <KpiCard
          tone="yellow"
          icon={<Clock size={20} className="text-white" />}
          watermark={<Clock size={52} />}
          label={t("Chờ Kế toán duyệt")}
          value={fmtSo(dem("Cho ke toan duyet").length)}
          tangLaXau
          trend={<div className="kpi-trend trend-warning"><span className="trend-sub">{fmtSo(tong(dem("Cho ke toan duyet"), "so_luong_ccdc"))} {t("tài sản")}</span></div>}
          subtext={t("Nguyên giá: {x}", { x: fmtGiaTriDong(tong(dem("Cho ke toan duyet"), "nguyen_gia")) })}
          onClick={() => setTabTT("Cho ke toan duyet")}
        />
        {laBaoHong ? (
          <KpiCard
            tone="red"
            icon={<AlertTriangle size={20} className="text-white" />}
            watermark={<AlertTriangle size={52} />}
            label={t("Tài sản hỏng chờ xử lý")}
            value={hc ? fmtSo(tsHong.length) : fmtSo(tong(dem("Da duyet"), "so_luong_ccdc"))}
            trend={<div className="kpi-trend trend-danger"><span className="trend-sub">{hc ? t("Sửa xong hoặc đề xuất thanh lý / tiêu hủy") : t("Đã được KT xác nhận hỏng")}</span></div>}
            subtext={hc ? t("Nguyên giá: {x}", { x: fmtGiaTriDong(tsHong.reduce((s, c) => s + (c.nguyen_gia ?? 0), 0)) }) : undefined}
            onClick={() => setTabTT("Da duyet")}
          />
        ) : (
          <KpiCard
            tone="blue"
            icon={<Wrench size={20} className="text-white" />}
            watermark={<Wrench size={52} />}
            label={t("Đã duyệt - chờ hoàn tất")}
            value={fmtSo(dem("Da duyet").length)}
            trend={<div className="kpi-trend"><span className="trend-sub">{t("HCNS xử lý vật lý rồi bấm hoàn tất")}</span></div>}
            subtext={t("{x} tài sản", { x: fmtSo(tong(dem("Da duyet"), "so_luong_ccdc")) })}
            onClick={() => setTabTT("Da duyet")}
          />
        )}
        <KpiCard
          tone="cyan"
          icon={<CheckCircle2 size={20} className="text-white" />}
          watermark={<CheckCircle2 size={52} />}
          label={laBaoHong ? t("Phiếu báo hỏng {x}", { x: nam ? t("năm {nam}", { nam }) : "" }) : t("Đã hoàn tất {x}", { x: nam ? t("năm {nam}", { nam }) : "" })}
          value={fmtSo(laBaoHong ? all.length : dem("Da hoan tat").length)}
          trend={
            <div className="kpi-trend trend-up">
              <span className="trend-sub">
                {laBaoHong ? t("{x} tài sản được báo hỏng", { x: fmtSo(tong(all, "so_luong_ccdc")) }) : t("{x} tài sản đã xử lý", { x: fmtSo(tong(dem("Da hoan tat"), "so_luong_ccdc")) })}
              </span>
            </div>
          }
          subtext={laBaoHong ? t("Nguyên giá: {x}", { x: fmtGiaTriDong(tong(all, "nguyen_gia")) }) : t("Nguyên giá: {x}", { x: fmtGiaTriDong(tong(dem("Da hoan tat"), "nguyen_gia")) })}
          onClick={() => setTabTT(laBaoHong ? "" : "Da hoan tat")}
        />
        {laBaoHong ? (
          <KpiCard
            tone="purple"
            icon={<XCircle size={20} className="text-white" />}
            watermark={<XCircle size={52} />}
            label={t("KT từ chối")}
            value={fmtSo(dem("Tu choi").length)}
            trend={<div className="kpi-trend"><span className="trend-sub">{t("Tài sản đã trả về trạng thái cũ")}</span></div>}
            onClick={() => setTabTT("Tu choi")}
          />
        ) : (
          <KpiCard
            tone="purple"
            icon={<Coins size={20} className="text-white" />}
            watermark={<Coins size={52} />}
            label={t("Giá trị thu hồi (thanh lý)")}
            value={fmtGiaTri(tong(dem("Da hoan tat"), "gia_tri_thu_hoi"))}
            trend={
              <div className="kpi-trend">
                <span className="trend-sub">
                  {t("so với nguyên giá")} {fmtGiaTri(tong(dem("Da hoan tat").filter((r) => r.loai === "Thanh ly"), "nguyen_gia"))}
                </span>
              </div>
            }
            onClick={() => setTabTT("Da hoan tat")}
          />
        )}
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}
      {loi && <div className="alert alert-error">{loi}</div>}

      {hc && tsHong.length > 0 && (
        <div className="content-card">
          <div className="card-header">
            <div className="card-title-wrap">
              <AlertTriangle size={17} className="card-title-icon text-red" />
              <h2 className="card-title">{t("Tài sản hỏng đang ở kho (")}{tsHong.length}{t(") - chờ sửa hoặc đề xuất thanh lý / tiêu hủy")}</h2>
            </div>
          </div>
          <div className="task-table-wrapper table-scroll-y">
            <table className="task-table">
              <thead>
                <tr>
                  <th>{t("Mã tài sản")}</th>
                  <th>{t("Tên tài sản")}</th>
                  <th>{t("Kho")}</th>
                  <th style={{ textAlign: "right" }}>{t("Nguyên giá")}</th>
                  <th style={{ textAlign: "right" }}>{t("Thao tác")}</th>
                </tr>
              </thead>
              <tbody>
                {tHong.dongTrang.map((c) => (
                  <tr key={c.id}>
                    <td data-label={t("Mã tài sản")}>
                      <span className="code-link" onClick={() => moTaiSan(c.id)}>
                        {c.id}
                      </span>
                    </td>
                    <td data-label={t("Tên tài sản")}>{c.ten_ccdc}</td>
                    <td data-label={t("Kho")} className="text-secondary">
                      {c.ten_kho ?? "-"}
                    </td>
                    <td data-label={t("Nguyên giá")} style={{ textAlign: "right" }}>
                      {c.nguyen_gia != null ? fmtSo(c.nguyen_gia) : "-"}
                    </td>
                    <td data-label={t("Thao tác")} style={{ textAlign: "right" }}>
                      <div className="row-actions">
                        <button className="btn btn-outline btn-sm" onClick={() => setSuaXong(c)}>
                          {t("Sửa xong")}
                        </button>
                        <button className="btn btn-outline btn-sm" onClick={() => moTaiSan(c.id)}>
                          {t("Thanh lý / tiêu hủy…")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PhanTrang trang={tHong.trang} tong={tHong.tong} onDoi={tHong.setTrang} donVi={t("tài sản")} />
        </div>
      )}

      <div className="content-card task-card-full">
        <div className="card-header">
          <div className="card-title-wrap">
            {laBaoHong ? <AlertTriangle size={18} className="card-title-icon text-teal" /> : <Trash2 size={18} className="card-title-icon text-teal" />}
            <h2 className="card-title">{laBaoHong ? t("Phiếu báo hỏng") : t("Phiếu thanh lý / tiêu hủy")}</h2>
          </div>
          <FilterTabs<TabTT>
            value={tabTT}
            onChange={setTabTT}
            tabs={[
              { key: "", label: t("Tất cả"), count: all.length },
              { key: "Cho ke toan duyet", label: t("Chờ duyệt"), count: dem("Cho ke toan duyet").length },
              { key: "Da duyet", label: laBaoHong ? t("Đã duyệt") : t("Chờ hoàn tất"), count: dem("Da duyet").length },
              ...(laBaoHong ? [] : [{ key: "Da hoan tat" as TabTT, label: t("Hoàn tất"), count: dem("Da hoan tat").length }]),
              { key: "Tu choi", label: t("Từ chối"), count: dem("Tu choi").length },
            ]}
          />
        </div>
        <div className="task-table-wrapper">
          <table className="task-table">
            <thead>
              <tr>
                <th style={{ width: "12%" }}>{t("Mã phiếu")}</th>
                <th style={{ width: "9%" }}>{t("Loại")}</th>
                <th>{t("Tài sản")}</th>
                <th style={{ width: "20%" }}>{t("Lý do")}</th>
                <th style={{ width: "10%", textAlign: "right" }}>{t("Nguyên giá")}</th>
                <th style={{ width: "11%", textAlign: "center" }}>{t("Trạng thái")}</th>
                <th style={{ width: "14%" }}>{t("Đề xuất")}</th>
              </tr>
            </thead>
            <tbody>
              {rows === null && (
                <tr>
                  <td colSpan={7} className="task-empty">
                    {t("Đang tải…")}
                  </td>
                </tr>
              )}
              {rows !== null && hienThi.length === 0 && (
                <tr>
                  <td colSpan={7} className="task-empty">
                    {t("Không có phiếu nào.")}
                  </td>
                </tr>
              )}
              {tXl.dongTrang.map((p) => (
                <tr key={p.id} className={p.trang_thai === "Cho ke toan duyet" ? ((soGioTu(p.ngay_de_xuat) ?? 0) > 48 ? "row-canh-bao" : "row-chu-y") : undefined}>
                  <td data-label={t("Mã phiếu")}>
                    <span className="code-link" role="button" tabIndex={0} onClick={() => moPhieu("xu_ly", p.id)}>
                      {p.ma_phieu ?? p.id.slice(0, 8)}
                    </span>
                  </td>
                  <td data-label={t("Loại")}>
                    <LoaiChip loai={p.loai} nhan={LOAI_XU_LY[p.loai] ?? p.loai} />
                  </td>
                  <td data-label={t("Tài sản")}>
                    <span className="strong">{p.so_luong_ccdc} TS</span>
                    {p.tom_tat && <span className="muted small"> · {p.tom_tat}</span>}
                  </td>
                  <td data-label={t("Lý do")}>{p.ly_do ?? "-"}</td>
                  <td data-label={t("Nguyên giá")} style={{ textAlign: "right" }}>
                    <TienTe so={p.nguyen_gia || null} />
                    {p.gia_tri_thu_hoi != null && <div className="muted small">{t("Thu hồi")} {fmtSo(p.gia_tri_thu_hoi)}</div>}
                  </td>
                  <td data-label={t("Trạng thái")} style={{ textAlign: "center" }}>
                    <StatusBadge label={TRANG_THAI_XU_LY[p.trang_thai]?.label ?? p.trang_thai} tone={TRANG_THAI_XU_LY[p.trang_thai]?.tone} />
                  </td>
                  <td data-label={t("Đề xuất")}>
                    <NgayCho ngay={p.ngay_de_xuat} dangCho={p.trang_thai === "Cho ke toan duyet"} />
                    <div className="small text-secondary">{p.nguoi_de_xuat}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PhanTrang trang={tXl.trang} tong={tXl.tong} onDoi={tXl.setTrang} donVi={t("phiếu")} />
      </div>

      {form && (
        <DeXuatModal
          loai={form}
          onClose={() => setForm(null)}
          onDone={async (id) => {
            setForm(null);
            setMsg(t("Đã gửi phiếu {x} - chờ Kế toán duyệt.", { x: LOAI_XU_LY[form].toLowerCase() }));
            baoThayDoi();
            await reloadViec();
            moPhieu("xu_ly", id);
          }}
        />
      )}

      {suaXong && (
        <Modal title={t("Xác nhận sửa xong")} onClose={() => setSuaXong(null)}>
          <p>
            {t("Tài sản")} <b>{suaXong.id}</b> - {suaXong.ten_ccdc} {t("đã sửa xong, đưa lại trạng thái")} <b>{t("Trong kho")}</b> {t("để cấp phát tiếp?")}
          </p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setSuaXong(null)}>
              {t("Huỷ")}
            </button>
            <button className="btn btn-primary" onClick={() => xacNhanSuaXong(suaXong)}>
              {t("Đã sửa xong")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
function DeXuatModal({ loai, onClose, onDone }: { loai: LoaiDeXuat; onClose: () => void; onDone: (id: string) => void }) {
  const [ungVien, setUngVien] = useState<CcdcRow[] | null>(null);
  const [chon, setChon] = useState<Set<string>>(new Set());
  const [lyDo, setLyDo] = useState("");
  const [tep, setTep] = useState<TepCho[]>([]);
  const [tim, setTim] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const trangThais = loai === "Bao hong" ? ["Trong kho", "Dang cap phat", "Dang bao tri"] : ["Trong kho", "Hong"];
    Promise.all(trangThais.map((t) => api.get<{ rows: CcdcRow[] }>(`/ccdc?trang_thai=${encodeURIComponent(t)}`)))
      .then((lists) => setUngVien(lists.flatMap((l) => l.rows).filter((c) => loai === "Bao hong" || !c.nguoi_dang_giu)))
      .catch((e) => setErr(thongBaoLoi(e)));
  }, [loai]);

  const loc = useMemo(() => {
    const q = tim.trim().toLowerCase();
    const ds = ungVien ?? [];
    return (q ? ds.filter((c) => `${c.id} ${c.ten_ccdc} ${c.nguoi_dang_giu_ten ?? ""} ${c.ten_kho ?? ""}`.toLowerCase().includes(q)) : ds).slice(0, 300);
  }, [ungVien, tim]);

  async function gui() {
    if (!lyDo.trim()) return setErr(t("Vui lòng nhập lý do."));
    if (chon.size === 0) return setErr(t("Chọn ít nhất 1 tài sản."));
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post<{ id: string }>("/phieu-xu-ly-ts", { loai, ccdc_ids: [...chon], ly_do: lyDo.trim() });
      // Tep loi van mo phieu binh thuong - nguoi dung tai lai trong popup chi tiet phieu.
      if (tep.length) await taiLenTepCho("xu_ly", r.id, tep);
      onDone(r.id);
    } catch (e) {
      setErr(thongBaoLoi(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal size="lg" title={loai === "Bao hong" ? t("Báo hỏng tài sản") : t("Đề xuất {x}", { x: LOAI_XU_LY[loai].toLowerCase() })} onClose={onClose}>
      <div className="field-group">
        <label className="field-label">
          {t("Chọn tài sản (")}{chon.size} {t("đã chọn)")}
          {loai !== "Bao hong" && t(" - chỉ tài sản đang nằm trong kho (Trong kho / Hỏng), không có người giữ")}
        </label>
        <input type="text" placeholder={t("Tìm mã, tên, người giữ, kho...")} value={tim} onChange={(e) => setTim(e.target.value)} />
        <div className="pick-list">
          {ungVien === null && <div className="muted small">{t("Đang tải…")}</div>}
          {ungVien !== null && loc.length === 0 && <div className="muted small">{t("Không có tài sản phù hợp.")}</div>}
          {loc.map((c) => (
            <label key={c.id} className="check-label">
              <input
                type="checkbox"
                checked={chon.has(c.id)}
                onChange={() => {
                  const n = new Set(chon);
                  if (n.has(c.id)) n.delete(c.id);
                  else n.add(c.id);
                  setChon(n);
                }}
              />
              <span className="code-text">{c.id}</span> {c.ten_ccdc}
              <span className="muted small">
                · {TRANG_THAI_TS[c.trang_thai_hien_tai]?.label ?? c.trang_thai_hien_tai} · {c.nguoi_dang_giu_ten ?? c.ten_kho ?? ""}
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="field-group">
        <label className="field-label">{loai === "Bao hong" ? t("Mô tả hư hỏng *") : t("Lý do *")}</label>
        <textarea rows={2} value={lyDo} onChange={(e) => setLyDo(e.target.value)} />
      </div>
      <ChonTep tep={tep} onDoi={setTep} loaiMacDinh={loai === "Bao hong" ? "Bang chung" : "Chung tu"} />
      {err && <div className="alert alert-error">{err}</div>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          {t("Huỷ")}
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={gui}>
          {busy ? t("Đang gửi…") : t("Gửi Kế toán duyệt ({size} TS)", { size: chon.size })}
        </button>
      </div>
    </Modal>
  );
}
