import { t } from "../lib/i18n";
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
import { PhanTrang, useTrangKhach } from "../components/PhanTrang";
import { TruongCongTy } from "../components/ChonCongTy";
import { congTyMacDinh, hienCongTy, maCongTy } from "../lib/congTy";
import { SearchSelect } from "../components/SearchSelect";
import { KhoTag } from "../components/NoiBat";
import { ChonLoc } from "../components/ChonLoc";

const LOAI_DOI: LoaiKho[] = ["Mien", "Trung chuyen", "Quan ly"];

interface TongHopKho {
  id: number;
  ten_kho: string;
  loai: LoaiKho;
  bat_tat: number;
  cong_ty_id: number;
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
  cong_ty_id: number;
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
      setLoi(thongBaoLoi(e, t("Không tải được số liệu kho.")));
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
  const tKho = useTrangKhach(hienThi, [loaiLoc, tim, anKhoTrong]);
  const soKhoTrongAn = rows.filter((k) => k.loai === "Quan ly" && !khoConSoLieu(k)).length;
  const coTab = (t: Parameters<typeof duocMoTab>[1]) => !!user && duocMoTab(user, t);

  return (
    <div className="dashboard-container">
      <PageHeader
        title={t("Kho & tồn")}
        filters={
          quanTriKho ? (
            <FilterTabs<Tab>
              value={tab}
              onChange={setTab}
              tabs={[
                { key: "ton", label: t("Tồn theo kho") },
                { key: "cau-hinh", label: t("Cấu hình kho & thủ kho") },
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
          label={tongHop && !quanTriKho ? t("Kho tôi phụ trách") : t("Kho đang hoạt động")}
          value={fmtSo(hoatDong.length)}
          trend={
            <div className="kpi-trend">
              <span className="trend-sub">
                {demLoai("HCNS")} HCNS · {demLoai("Mien")} {t("miền ·")} {demLoai("Trung chuyen") > 0 && <>{demLoai("Trung chuyen")} {t("trung chuyển ·")} </>}
                {demLoai("Quan ly")} {t("quản lý")}
              </span>
            </div>
          }
          subtext={rows.length > hoatDong.length ? t("{x} kho đã ngừng", { x: rows.length - hoatDong.length }) : t("Không có kho ngừng hoạt động")}
          onClick={() => setTab("ton")}
        />
        <KpiCard
          tone="blue-light"
          icon={<Package size={20} className="text-white" />}
          watermark={<Package size={52} />}
          label={t("Tài sản cố định trong kho")}
          value={fmtSo(tong.ts)}
          trend={<div className="kpi-trend"><span className="trend-sub">{t("Sẵn sàng cấp phát / điều chuyển")}</span></div>}
          subtext={t("Giá trị: {x}", { x: fmtGiaTriDong(tong.gtTs) })}
          onClick={coTab("tai-san") ? () => navigate("tai-san", { trang_thai: "Trong kho" }) : undefined}
        />
        <KpiCard
          tone="purple"
          icon={<Store size={20} className="text-white" />}
          watermark={<Store size={52} />}
          label={t("Tồn tiêu hao (giá tham khảo)")}
          value={fmtGiaTri(tong.gtTh)}
          trend={
            tong.am > 0 ? (
              <div className="kpi-trend trend-warning">
                <span className="trend-bold">{fmtSo(tong.am)}</span>
                <span className="trend-sub">{t("vật tư tồn âm cần điều chỉnh")}</span>
              </div>
            ) : (
              <div className="kpi-trend trend-up">
                <span className="trend-sub">{t("Không có vật tư tồn âm")}</span>
              </div>
            )
          }
          subtext={t("{x} dòng tồn (mặt hàng × kho)", { x: fmtSo(tong.mh) })}
          onClick={coTab("cap-phat") ? () => navigate("cap-phat", { tab: "ton-kho" }) : undefined}
        />
        <KpiCard
          tone={tong.quaHan ? "red" : "yellow"}
          icon={<Truck size={20} className="text-white" />}
          watermark={<Truck size={52} />}
          label={t("Phiếu chuyển kho chờ nhận")}
          value={fmtSo(tong.choNhan)}
          tangLaXau
          trend={
            <div className={`kpi-trend ${tong.quaHan ? "trend-danger" : ""}`}>
              <span className="trend-bold">{fmtSo(tong.quaHan)}</span>
              <span className="trend-sub">{t("phiếu quá 48 giờ")}</span>
            </div>
          }
          subtext={t("Kho nhận xác nhận ở Việc cần làm")}
          onClick={() => navigate("viec-can-lam", { tab: "ban-giao" })}
        />
      </div>

      {tab === "ton" ? (
        <div className="content-card task-card-full">
          <div className="card-header">
            <div className="card-title-wrap">
              <Store size={18} className="card-title-icon text-teal" />
              <h2 className="card-title">{t("Tồn theo kho")}</h2>
            </div>
          </div>
          <div className="filter-bar">
            <div className="topbar-search filter-search">
              <Search size={15} className="search-icon" />
              <input className="search-input" placeholder={t("Tìm tên kho...")} value={tim} onChange={(e) => setTim(e.target.value)} />
            </div>
            <label className="header-dropdown select-dropdown">
              <ChonLoc value={loaiLoc} onChange={(e) => setLoaiLoc(e.target.value)} aria-label={t("Loại kho")}>
                <option value="">{t("Tất cả loại kho")}</option>
                <option value="HCNS">{LOAI_KHO.HCNS}</option>
                <option value="Mien">{LOAI_KHO.Mien}</option>
                <option value="Trung chuyen">{LOAI_KHO["Trung chuyen"]}</option>
                <option value="Quan ly">{LOAI_KHO["Quan ly"]}</option>
              </ChonLoc>
              <ChevronDown size={13} className="dropdown-arrow" />
            </label>
            {soKhoTrongAn > 0 && (
              <label className="check-label">
                <input type="checkbox" checked={anKhoTrong} onChange={(e) => setAnKhoTrong(e.target.checked)} />
                {t("Ẩn")} {soKhoTrongAn} {t("kho quản lý chưa có hàng")}
              </label>
            )}
          </div>
          <div className="task-table-wrapper">
            <table className="task-table">
              <thead>
                <tr>
                  <th style={{ width: "24%" }}>{t("Kho")}</th>
                  <th style={{ width: "10%" }}>{t("Loại")}</th>
                  <th style={{ width: "14%", textAlign: "right" }}>{t("TSCĐ trong kho")}</th>
                  <th style={{ width: "14%", textAlign: "right" }}>{t("Tồn tiêu hao")}</th>
                  <th style={{ width: "9%", textAlign: "center" }}>{t("Tồn âm")}</th>
                  <th style={{ width: "11%", textAlign: "center" }}>{t("Chờ nhận")}</th>
                  <th style={{ width: "18%", textAlign: "right" }}>{t("Xem")}</th>
                </tr>
              </thead>
              <tbody>
                {!tongHop && (
                  <tr>
                    <td colSpan={7} className="task-empty">
                      {t("Đang tải…")}
                    </td>
                  </tr>
                )}
                {tongHop && hienThi.length === 0 && (
                  <tr>
                    <td colSpan={7} className="task-empty">
                      {t("Không có kho khớp bộ lọc.")}
                    </td>
                  </tr>
                )}
                {tKho.dongTrang.map((k) => (
                  <tr key={k.id} className={k.ton_am || k.cho_nhan_qua_han ? "row-canh-bao" : undefined}>
                    <td data-label={t("Kho")}>
                      <span className="strong">
                        <KhoTag ten={k.ten_kho} loai={k.loai} />
                      </span>
                      {hienCongTy(user) && <span className="muted small"> · {maCongTy(user, k.cong_ty_id)}</span>}
                      {!k.bat_tat && <span className="muted small"> {t("(đã ngừng)")}</span>}
                    </td>
                    <td data-label={t("Loại")}>
                      <span className="nb-chip nb-slate">{LOAI_KHO[k.loai]}</span>
                    </td>
                    <td data-label={t("TSCĐ trong kho")} style={{ textAlign: "right" }}>
                      {coTab("tai-san") && k.ts_trong_kho > 0 ? (
                        <button type="button" className="so-link" title={t("Xem tài sản trong kho")} onClick={() => navigate("tai-san", { kho_id: String(k.id), trang_thai: "Trong kho" })}>
                          {fmtSo(k.ts_trong_kho)}
                        </button>
                      ) : (
                        <div className="strong">{fmtSo(k.ts_trong_kho)}</div>
                      )}
                      {k.gt_ts > 0 && <div className="muted small">{fmtGiaTri(k.gt_ts)}</div>}
                    </td>
                    <td data-label={t("Tồn tiêu hao")} style={{ textAlign: "right" }}>
                      {coTab("cap-phat") ? (
                        <button type="button" className="so-link" title={t("Xem tồn tiêu hao của kho")} onClick={() => navigate("cap-phat", { tab: "ton-kho", kho_id: String(k.id) })}>
                          {fmtSo(k.so_mat_hang)} {t("mặt hàng")}
                        </button>
                      ) : (
                        <div className="strong">{fmtSo(k.so_mat_hang)} {t("mặt hàng")}</div>
                      )}
                      {k.gt_tieu_hao > 0 && <div className="muted small">{fmtGiaTri(k.gt_tieu_hao)}</div>}
                    </td>
                    <td data-label={t("Tồn âm")} style={{ textAlign: "center" }}>
                      {k.ton_am ? <StatusBadge label={String(k.ton_am)} tone="danger" /> : <span className="muted">0</span>}
                    </td>
                    <td data-label={t("Chờ nhận")} style={{ textAlign: "center" }}>
                      {k.cho_nhan ? (
                        <StatusBadge label={`${k.cho_nhan}${k.cho_nhan_qua_han ? t(" ({cho_nhan_qua_han} quá hạn)", { cho_nhan_qua_han: k.cho_nhan_qua_han }) : ""}`} tone={k.cho_nhan_qua_han ? "danger" : "warning"} />
                      ) : (
                        <span className="muted">0</span>
                      )}
                    </td>
                    <td data-label={t("Xem")} style={{ textAlign: "right" }}>
                      <div className="row-actions">
                        {coTab("tai-san") && k.ts_trong_kho > 0 && (
                          <button className="btn btn-outline btn-sm" onClick={() => navigate("tai-san", { kho_id: String(k.id), trang_thai: "Trong kho" })}>
                            {t("TSCĐ")}
                          </button>
                        )}
                        {coTab("cap-phat") && (
                          <button className="btn btn-outline btn-sm" onClick={() => navigate("cap-phat", { tab: "ton-kho", kho_id: String(k.id) })}>
                            {t("Tồn tiêu hao")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PhanTrang trang={tKho.trang} tong={tKho.tong} onDoi={tKho.setTrang} donVi="kho" />
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
  const auth = useAuth();
  const user = auth.status === "authenticated" ? auth.user : null;
  // Da phap nhan: kho thuoc 1 cong ty - them kho khi dang xem nhieu cong ty thi chon cong ty.
  const ctTao = congTyMacDinh(user);
  const nhieuCt = hienCongTy(user);
  const [congTyMoi, setCongTyMoi] = useState<number | null>(ctTao.macDinh);
  const [rows, setRows] = useState<KhoRow[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [tenMoi, setTenMoi] = useState("");
  const [loaiMoi, setLoaiMoi] = useState<LoaiKho>("Mien");
  const [emailThuKho, setEmailThuKho] = useState<Record<number, string>>({});
  const [xoa, setXoa] = useState<{ kho: KhoRow; email: string } | null>(null);
  const [doiLoai, setDoiLoai] = useState<{ kho: KhoRow; ten: string; loai: LoaiKho; nv: string } | null>(null);
  const [dsNv, setDsNv] = useState<{ ma_nv: string; ten_nv: string; cong_ty_id: number | null }[]>([]);
  const canChonNv = !!doiLoai && doiLoai.loai === "Quan ly" && !doiLoai.kho.nhan_vien_id;
  useEffect(() => {
    if (canChonNv && !dsNv.length) api.get<{ rows: typeof dsNv }>("/nhan-vien?gon=1").then((r) => setDsNv(r.rows)).catch(() => undefined);
  }, [canChonNv, dsNv.length]);
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
  const tDsKho = useTrangKhach(hienThi, [showQl]);

  return (
    <div className="content-card task-card-full">
      <div className="card-header">
        <div className="card-title-wrap">
          <Store size={18} className="card-title-icon text-teal" />
          <h2 className="card-title">{t("Danh sách kho & phân quyền thủ kho")}</h2>
        </div>
        <div className="row-actions">
          <label className="check-label">
            <input type="checkbox" checked={showQl} onChange={(e) => setShowQl(e.target.checked)} />
            {t("Hiện")} {soKhoQl} {t("kho quản lý")}
          </label>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={15} /> {t("Thêm kho mới")}
          </button>
        </div>
      </div>
      <div className="alert alert-info">
        {t("Chuỗi điều chuyển: Kho mua hàng →")} <b>{t("Kho HCNS")}</b> → <b>{t("Kho miền")}</b> → <b>{t("Kho quản lý")}</b> {t("→ Nhân viên. Kho quản lý tự tạo khi gán quản lý trực tiếp ở")}
        {t("màn Nhân viên; thủ kho được phân quyền theo email đăng nhập.")}
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}
      <div className="task-table-wrapper">
        <table className="task-table">
          <thead>
            <tr>
              <th style={{ width: "22%" }}>{t("Tên kho")}</th>
              <th style={{ width: "14%" }}>{t("Loại kho")}</th>
              <th style={{ width: "40%" }}>{t("Thủ kho phụ trách")}</th>
              <th style={{ width: "12%", textAlign: "center" }}>{t("Trạng thái")}</th>
              <th style={{ width: "12%", textAlign: "right" }}>{t("Thao tác")}</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr>
                <td colSpan={5} className="task-empty">
                  {t("Đang tải…")}
                </td>
              </tr>
            )}
            {tDsKho.dongTrang.map((k) => (
              <tr key={k.id}>
                <td data-label={t("Tên kho")} className="strong">
                  {k.ten_kho}
                  {nhieuCt && <span className="muted small"> · {maCongTy(user, k.cong_ty_id)}</span>}
                </td>
                <td data-label={t("Loại kho")}>
                  <span className="status-badge badge-cyan-solid">{LOAI_KHO[k.loai]}</span>
                </td>
                <td data-label={t("Thủ kho")}>
                  <div className="cell-stack">
                    {k.loai === "Quan ly" && k.nhan_vien_ten && <div className="muted small">{t("Quản lý chủ kho:")} {k.nhan_vien_ten}</div>}
                    {(k.loai === "Mien" || k.loai === "Trung chuyen") && k.nhan_vien_ten && <div className="muted small">{t("Người phụ trách:")} {k.nhan_vien_ten}</div>}
                    {k.loai === "HCNS" && <div className="muted small">{t("Mọi tài khoản HCNS / Admin")}</div>}
                    {k.loai === "Mua hang" && <div className="muted small">{t("Kho nguồn ảo - chỉ dùng cho phiếu nhập mua")}</div>}
                    {k.loai === "Tieu hao" && <div className="muted small">{t("Điểm tiêu dùng văn phòng - xuất vào là tiêu hao hết, không tính tồn")}</div>}
                    {k.thu_kho.length > 0 && (
                      <div className="chip-list">
                        {k.thu_kho.map((e) => (
                          <span key={e} className="chip">
                            {e}
                            <button type="button" className="chip-remove" title={t("Bỏ quyền thủ kho")} onClick={() => setXoa({ kho: k, email: e })}>
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
                            }, t("Đã gán {email} làm thủ kho {ten_kho}.", { email, ten_kho: k.ten_kho }));
                        }}
                      >
                        <input
                          type="email"
                          placeholder={t("Email thủ kho…")}
                          value={emailThuKho[k.id] ?? ""}
                          onChange={(e) => setEmailThuKho({ ...emailThuKho, [k.id]: e.target.value })}
                        />
                        <button type="submit" className="btn btn-outline btn-sm" disabled={!emailThuKho[k.id]?.trim()}>
                          <UserPlus size={12} /> {t("Gán")}
                        </button>
                      </form>
                    )}
                  </div>
                </td>
                <td data-label={t("Trạng thái")} style={{ textAlign: "center" }}>
                  <StatusBadge label={k.bat_tat ? t("Hoạt động") : t("Ngừng")} tone={k.bat_tat ? "success" : "neutral"} />
                </td>
                <td data-label={t("Thao tác")} style={{ textAlign: "right" }}>
                  {LOAI_DOI.includes(k.loai) && (
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ marginRight: 6 }}
                      onClick={() => setDoiLoai({ kho: k, ten: k.ten_kho, loai: LOAI_DOI.find((l) => l !== k.loai)!, nv: "" })}
                    >
                      {t("Đổi loại kho")}
                    </button>
                  )}
                  {k.id > 2 && (
                    <button
                      className={`btn btn-outline btn-sm ${k.bat_tat ? "danger-outline" : ""}`}
                      onClick={() =>
                        run(
                          () => api.put(`/kho/${k.id}`, { ten_kho: k.ten_kho, ghi_chu: k.ghi_chu, bat_tat: !k.bat_tat }),
                          `${k.bat_tat ? t("Đã ngừng") : t("Đã kích hoạt")} ${k.ten_kho}.`,
                        )
                      }
                    >
                      {k.bat_tat ? t("Ngừng") : t("Kích hoạt")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PhanTrang trang={tDsKho.trang} tong={tDsKho.tong} onDoi={tDsKho.setTrang} donVi="kho" />

      {showAdd && (
        <Modal title={t("Thêm kho mới")} onClose={() => setShowAdd(false)}>
          {ctTao.canChon && <TruongCongTy value={congTyMoi} ds={ctTao.ds} onChange={setCongTyMoi} />}
          <div className="field-group">
            <label className="field-label">{t("Tên kho *")}</label>
            <input type="text" value={tenMoi} onChange={(e) => setTenMoi(e.target.value)} placeholder={t("vd: Kho vận Miền Trung")} autoFocus />
          </div>
          <div className="field-group">
            <label className="field-label">{t("Loại kho")}</label>
            <ChonLoc value={loaiMoi} onChange={(e) => setLoaiMoi(e.target.value as LoaiKho)}>
              <option value="Mien">{t("Kho miền")}</option>
              <option value="Trung chuyen">{t("Kho trung chuyển (đại diện văn phòng nhận rồi phát cho nhân viên)")}</option>
              <option value="Tieu hao">{t("Kho tiêu hao (điểm tiêu dùng văn phòng)")}</option>
              <option value="HCNS">{t("Kho HCNS")}</option>
              <option value="Mua hang">{t("Kho mua hàng (nguồn nhập)")}</option>
            </ChonLoc>
            <div className="field-hint">
              {loaiMoi === "Tieu hao"
                ? t("Kho tiêu hao: VPP, vệ sinh, đóng hàng… xuất vào là tiêu hao hết (trừ tồn kho xuất), không tính tồn, không chuyển đi được.")
                : loaiMoi === "Trung chuyen"
                  ? t("Kho trung chuyển hoạt động giống hệt kho miền: nhận hàng từ kho HCNS / kho miền, cấp phát cho mọi nhân viên công ty. Gán thủ kho (người đại diện) sau khi tạo.")
                  : t("Kho quản lý được tạo tự động khi gán quản lý trực tiếp cho nhân viên.")}
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => setShowAdd(false)}>
              {t("Hủy")}
            </button>
            <button
              className="btn btn-primary"
              disabled={!tenMoi.trim()}
              onClick={() =>
                run(async () => {
                  await api.post("/kho", { ten_kho: tenMoi.trim(), loai: loaiMoi, cong_ty_id: congTyMoi });
                  setShowAdd(false);
                  setTenMoi("");
                }, t("Đã thêm kho {x}.", { x: tenMoi.trim() }))
              }
            >
              {t("Lưu kho")}
            </button>
          </div>
        </Modal>
      )}

      {doiLoai && (
        <Modal title={t("Đổi loại kho · {x}", { x: doiLoai.kho.ten_kho })} onClose={() => setDoiLoai(null)}>
          <div className="field-group">
            <label className="field-label">{t("Chuyển thành")}</label>
            <ChonLoc value={doiLoai.loai} onChange={(e) => setDoiLoai({ ...doiLoai, loai: e.target.value as LoaiKho })}>
              {LOAI_DOI.filter((l) => l !== doiLoai.kho.loai).map((l) => (
                <option key={l} value={l}>
                  {LOAI_KHO[l]}
                </option>
              ))}
            </ChonLoc>
          </div>
          <div className="alert alert-info">
            {doiLoai.loai !== "Quan ly"
              ? t("{loai} được nhận hàng từ HCNS / kho miền khác, chuyển tiếp cho mọi kho và cấp phát / bàn giao cho TẤT CẢ nhân viên (không giới hạn nhóm). Tồn kho, lịch sử phiếu, thủ kho đã gán giữ nguyên.", { loai: LOAI_KHO[doiLoai.loai] })
              : t("Kho quản lý chỉ cấp phát cho {nv} và nhân viên cấp dưới trực tiếp, không chuyển sang kho quản lý khác. Tồn kho, lịch sử phiếu giữ nguyên.", {
                  nv: doiLoai.kho.nhan_vien_ten ?? dsNv.find((n) => n.ma_nv === doiLoai.nv)?.ten_nv ?? t("người phụ trách"),
                })}
          </div>
          {canChonNv && (
            <div className="field-group">
              <label className="field-label">{t("Người phụ trách (chủ kho quản lý) *")}</label>
              <SearchSelect
                options={dsNv.filter((n) => n.cong_ty_id == null || n.cong_ty_id === doiLoai.kho.cong_ty_id).map((n) => ({ value: n.ma_nv, label: `${n.ten_nv} (${n.ma_nv})` }))}
                value={doiLoai.nv}
                onChange={(nv) => setDoiLoai({ ...doiLoai, nv })}
                placeholder={t("Tìm nhân viên...")}
              />
            </div>
          )}
          <div className="field-group">
            <label className="field-label">{t("Tên kho *")}</label>
            <input type="text" value={doiLoai.ten} onChange={(e) => setDoiLoai({ ...doiLoai, ten: e.target.value })} autoFocus />
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => setDoiLoai(null)}>
              {t("Hủy")}
            </button>
            <button
              className="btn btn-primary"
              disabled={!doiLoai.ten.trim() || (canChonNv && !doiLoai.nv)}
              onClick={() => {
                const { kho: k, ten, loai, nv } = doiLoai;
                run(async () => {
                  await api.post(`/kho/${k.id}/doi-loai`, { loai, ten_kho: ten.trim(), nhan_vien_id: nv || undefined });
                  setDoiLoai(null);
                }, t("Đã chuyển {ten} thành {loai}.", { ten: ten.trim(), loai: LOAI_KHO[loai] }));
              }}
            >
              {t("Xác nhận chuyển")}
            </button>
          </div>
        </Modal>
      )}

      {xoa && (
        <Modal title={t("Bỏ quyền thủ kho")} onClose={() => setXoa(null)}>
          <p>
            <AlertTriangle size={14} className="text-orange" /> {t("Bỏ quyền thủ kho của")} <b>{xoa.email}</b> {t("tại")} <b>{xoa.kho.ten_kho}</b>{t("? Người này sẽ không còn")}
            {t("nhận/xuất hàng cho kho.")}
          </p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setXoa(null)}>
              {t("Hủy")}
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                const x = xoa;
                setXoa(null);
                run(() => api.delete(`/kho/${x.kho.id}/thu-kho/${encodeURIComponent(x.email)}`), t("Đã bỏ quyền thủ kho của {email}.", { email: x.email }));
              }}
            >
              {t("Bỏ quyền")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
