import { t } from "../lib/i18n";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Inbox, Package, PackageCheck, Search, Wrench } from "lucide-react";
import { api } from "../api/client";
import { useAuth, useRefreshUser } from "../auth/AuthContext";
import { SearchSelect } from "../components/SearchSelect";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { FilterTabs } from "../components/FilterTabs";
import { StatusBadge } from "../components/StatusBadge";
import { useChiTiet } from "../components/ChiTiet";
import { QrScanButton } from "../components/QrScanner";
import { useDuLieuChung } from "../lib/duLieuChung";
import { fmtGiaTri, fmtGiaTriDong, fmtNgay, fmtNgayGio, fmtSo } from "../lib/format";
import { baoThayDoi, useKhiThayDoi } from "../lib/suKien";
import { LOAI_KHO, TRANG_THAI_TS, isHcns, laKhoTon, tenVaiTro, thongBaoLoi } from "../lib/nhan";
import { PhanTrang, useTrangKhach } from "../components/PhanTrang";

interface CcdcRow {
  id: string;
  ten_ccdc: string;
  ten_nhom: string | null;
  so_seri: string | null;
  nguyen_gia: number | null;
  trang_thai_hien_tai: string;
}
interface PhieuGnRow {
  id: string;
  ma_phieu: string | null;
  loai_phieu: string;
  nhan_vien_id: string | null;
  nhan_vien_ten: string | null;
  nhan_vien_nhan_moi_id: string | null;
  tu_kho_ten: string | null;
  den_kho_ten: string | null;
  ngay_lap: string;
  da_xac_nhan: number;
  so_luong_ccdc: number;
  tom_tat: string | null;
}
interface TieuHaoRow {
  id: string;
  ma_phieu: string | null;
  tu_kho_ten: string | null;
  tom_tat: string | null;
  tong_tien: number | null;
  trang_thai: string;
  created_at: string;
  da_xac_nhan: number;
}
interface BaoHongRow {
  id: string;
  ma_phieu: string | null;
  nguoi_de_xuat: string;
  trang_thai: string;
}

type Tab = "tscd" | "tieu-hao" | "lich-su";
const LOAI_GN: Record<string, string> = { "Cap phat": t("Cấp phát"), "Thu hoi": t("Thu hồi"), "Dieu chuyen": t("Điều chuyển"), "Chuyen kho": t("Chuyển kho") };

// "Tai san cua toi" cho moi nguoi: TSCD dang giu (+ bao hong qua popup tai san), phieu can xac nhan
// da nhan (TSCD + tieu hao), lich su giao nhan. Ho so NV lay tu user.ma_nv (nhan_vien.email_dang_nhap).
export function XacNhanNhanScreen() {
  const auth = useAuth();
  const user = auth.status === "authenticated" ? auth.user : null;
  const maNv = user?.ma_nv ?? null;
  const { moTaiSan, moPhieu } = useChiTiet();
  const { reload: reloadViec } = useDuLieuChung();

  const [ccdcs, setCcdcs] = useState<CcdcRow[] | null>(null);
  const [gn, setGn] = useState<PhieuGnRow[]>([]);
  const [tieuHao, setTieuHao] = useState<TieuHaoRow[]>([]);
  const [baoHong, setBaoHong] = useState<BaoHongRow[]>([]);
  const [tab, setTab] = useState<Tab>("tscd");
  const [tim, setTim] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const [capNhatLuc, setCapNhatLuc] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!maNv) return;
    setDangTai(true);
    try {
      const nv = encodeURIComponent(maNv);
      const [cc, ph, th, bh] = await Promise.all([
        api.get<{ rows: CcdcRow[] }>(`/ccdc?nguoi_dang_giu=${nv}`),
        api.get<{ rows: PhieuGnRow[] }>(`/phieu-giao-nhan?nhan_vien_id=${nv}`),
        api.get<{ rows: TieuHaoRow[] }>(`/phieu-chuyen-kho?nhan_vien_id=${nv}&limit=200`),
        api.get<{ rows: BaoHongRow[] }>(`/phieu-xu-ly-ts?loai=Bao hong&trang_thai=Cho ke toan duyet`).catch(() => ({ rows: [] as BaoHongRow[] })),
      ]);
      setCcdcs(cc.rows.filter((c) => !["Da thanh ly", "Da tieu huy"].includes(c.trang_thai_hien_tai)));
      setGn(ph.rows);
      setTieuHao(th.rows);
      setBaoHong(bh.rows.filter((r) => r.nguoi_de_xuat === user?.email));
      setCapNhatLuc(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace("T", " "));
    } catch (e) {
      setLoi(thongBaoLoi(e, t("Không tải được dữ liệu.")));
      setCcdcs([]);
    } finally {
      setDangTai(false);
    }
  }, [maNv, user?.email]);

  useEffect(() => {
    load();
  }, [load]);
  useKhiThayDoi(load);

  // Phieu MINH la ben nhan: Cap phat cho minh / Dieu chuyen toi minh (Thu hoi thi minh la ben giao).
  const laBenNhan = (p: PhieuGnRow) => (p.loai_phieu === "Cap phat" && p.nhan_vien_id === maNv) || (p.loai_phieu === "Dieu chuyen" && p.nhan_vien_nhan_moi_id === maNv);
  const gnCho = gn.filter((p) => laBenNhan(p) && !p.da_xac_nhan);
  const thCho = tieuHao.filter((p) => p.trang_thai === "Da giao" && !p.da_xac_nhan);
  const thang = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7);
  const thThang = tieuHao.filter((p) => p.created_at.slice(0, 7) === thang);

  async function xacNhan(path: string, okMsg: string) {
    setBusy(path);
    setMsg(null);
    setLoi(null);
    try {
      await api.post(path);
      setMsg(okMsg);
      baoThayDoi();
      await Promise.all([load(), reloadViec()]);
    } catch (e) {
      setLoi(thongBaoLoi(e));
    } finally {
      setBusy(null);
    }
  }

  const tuKhoa = tim.trim().toLowerCase();
  const dsTs = useMemo(() => (ccdcs ?? []).filter((c) => !tuKhoa || `${c.id} ${c.ten_ccdc} ${c.so_seri ?? ""}`.toLowerCase().includes(tuKhoa)), [ccdcs, tuKhoa]);
  const dsTh = useMemo(() => tieuHao.filter((p) => !tuKhoa || `${p.ma_phieu ?? ""} ${p.tom_tat ?? ""}`.toLowerCase().includes(tuKhoa)), [tieuHao, tuKhoa]);
  const dsGn = useMemo(() => gn.filter((p) => !tuKhoa || `${p.ma_phieu ?? ""} ${p.tom_tat ?? ""}`.toLowerCase().includes(tuKhoa)), [gn, tuKhoa]);
  const tCho = useTrangKhach([...gnCho.map((p) => ({ k: "gn" as const, p })), ...thCho.map((p) => ({ k: "th" as const, p }))]);
  const tTs = useTrangKhach(dsTs, [tuKhoa]);
  const tTh = useTrangKhach(dsTh, [tuKhoa]);
  const tLs = useTrangKhach(dsGn, [tuKhoa]);

  if (!user) return null;
  // Admin/HCNS/KT "phu trach" moi kho (~70) - liet ke het thanh 1 khoi chu dai: >3 kho chi hien so luong,
  // ten day du o tooltip.
  const khoInfo = user.kho_phu_trach.filter(laKhoTon);
  const tenKho = khoInfo.map((k) => `${k.ten_kho} (${LOAI_KHO[k.loai]})`).join(", ");
  const moTa = `${tenVaiTro(user.vai_tro)}${khoInfo.length ? t(" · Thủ kho: {x}", { x: khoInfo.length <= 3 ? tenKho : `${fmtSo(khoInfo.length)} kho` }) : ""}`;
  const phuDe = <span className="muted small" title={khoInfo.length > 3 ? tenKho : undefined}>{moTa}</span>;

  if (!maNv) {
    return (
      <div className="dashboard-container">
        <PageHeader title={t("Tài sản của tôi")} filters={phuDe} />
        <div className="content-card task-empty">
          {t("Tài khoản")} <b>{user.email}</b> {t("chưa được liên kết với hồ sơ nhân viên nào")}
          {isHcns(user) ? t(" - chọn hồ sơ của bạn bên dưới để liên kết.") : t(" - nhờ HCNS nhập email này vào mục “Email đăng nhập” của bạn ở màn Nhân viên.")}
        </div>
        {isHcns(user) && <LienKetHoSo email={user.email} />}
      </div>
    );
  }

  const tongGt = (ccdcs ?? []).reduce((s, c) => s + (c.nguyen_gia ?? 0), 0);
  const soHong = (ccdcs ?? []).filter((c) => c.trang_thai_hien_tai === "Hong" || c.trang_thai_hien_tai === "Cho duyet bao hong").length;

  return (
    <div className="dashboard-container">
      <PageHeader
        title={t("Tài sản của tôi")}
        filters={phuDe}
        actions={<QrScanButton />}
        capNhatLuc={capNhatLuc}
        onRefresh={load}
        dangTai={dangTai}
      />
      {msg && <div className="alert alert-success">{msg}</div>}
      {loi && <div className="alert alert-error">{loi}</div>}

      <div className="kpi-grid kpi-grid-4">
        <KpiCard
          tone="cyan"
          icon={<Package size={20} className="text-white" />}
          watermark={<Package size={52} />}
          label={t("Tài sản cố định đang giữ")}
          value={fmtSo(ccdcs?.length ?? 0)}
          trend={<div className="kpi-trend"><span className="trend-sub">{fmtGiaTriDong(tongGt)}</span></div>}
          onClick={() => setTab("tscd")}
        />
        <KpiCard
          tone={gnCho.length + thCho.length ? "yellow" : "blue-light"}
          icon={<Inbox size={20} className="text-white" />}
          watermark={<Inbox size={52} />}
          label={t("Chờ tôi xác nhận đã nhận")}
          value={fmtSo(gnCho.length + thCho.length)}
          trend={
            <div className="kpi-trend">
              <span className="trend-sub">
                {fmtSo(gnCho.length)} {t("phiếu TSCĐ ·")} {fmtSo(thCho.length)} {t("phiếu tiêu hao")}
              </span>
            </div>
          }
        />
        <KpiCard
          tone="purple"
          icon={<PackageCheck size={20} className="text-white" />}
          watermark={<PackageCheck size={52} />}
          label={t("Tiêu hao nhận tháng này")}
          value={fmtSo(thThang.length)}
          trend={<div className="kpi-trend"><span className="trend-sub">{t("phiếu ·")} {fmtGiaTri(thThang.reduce((s, p) => s + (p.tong_tien ?? 0), 0))}</span></div>}
          onClick={() => setTab("tieu-hao")}
        />
        <KpiCard
          tone={soHong ? "red" : "blue"}
          icon={<Wrench size={20} className="text-white" />}
          watermark={<Wrench size={52} />}
          label={t("Báo hỏng chờ kế toán duyệt")}
          value={fmtSo(baoHong.length)}
          tangLaXau
          trend={<div className="kpi-trend"><span className="trend-sub">{fmtSo(soHong)} {t("tài sản tôi giữ đang hỏng / chờ duyệt")}</span></div>}
        />
      </div>

      {(gnCho.length > 0 || thCho.length > 0) && (
        <div className="content-card">
          <div className="card-header">
            <div className="card-title-wrap">
              <AlertTriangle size={17} className="card-title-icon text-teal" />
              <h2 className="card-title">{t("Cần xác nhận đã nhận")}</h2>
            </div>
          </div>
          <div className="task-table-wrapper">
            <table className="task-table">
              <thead>
                <tr>
                  <th style={{ width: "14%" }}>{t("Mã phiếu")}</th>
                  <th style={{ width: "13%" }}>{t("Loại")}</th>
                  <th>{t("Nội dung")}</th>
                  <th style={{ width: "18%" }}>{t("Từ")}</th>
                  <th style={{ width: "12%" }}>{t("Ngày")}</th>
                  <th style={{ width: "12%", textAlign: "right" }}>{t("Thao tác")}</th>
                </tr>
              </thead>
              <tbody>
                {tCho.dongTrang.flatMap((x) => (x.k === "gn" ? [x.p] : [])).map((p) => (
                  <tr key={p.id}>
                    <td data-label={t("Mã phiếu")}>
                      <span className="code-link" onClick={() => moPhieu("giao_nhan", p.id)}>
                        {p.ma_phieu ?? p.id.slice(0, 8)}
                      </span>
                    </td>
                    <td data-label={t("Loại")}>{t("TSCĐ ·")} {LOAI_GN[p.loai_phieu] ?? p.loai_phieu}</td>
                    <td data-label={t("Nội dung")}>
                      {fmtSo(p.so_luong_ccdc)} TS: {p.tom_tat ?? "-"}
                    </td>
                    <td data-label={t("Từ")}>{p.tu_kho_ten ?? p.nhan_vien_ten ?? "-"}</td>
                    <td data-label={t("Ngày")}>{fmtNgay(p.ngay_lap)}</td>
                    <td data-label={t("Thao tác")} style={{ textAlign: "right" }}>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={busy !== null}
                        onClick={() => xacNhan(`/phieu-giao-nhan/${p.id}/xac-nhan`, t("Đã xác nhận nhận {x}.", { x: p.ma_phieu ?? t("phiếu") }))}
                      >
                        <CheckCircle2 size={13} /> {t("Đã nhận")}
                      </button>
                    </td>
                  </tr>
                ))}
                {tCho.dongTrang.flatMap((x) => (x.k === "th" ? [x.p] : [])).map((p) => (
                  <tr key={p.id}>
                    <td data-label={t("Mã phiếu")}>
                      <span className="code-link" onClick={() => moPhieu("chuyen_kho", p.id)}>
                        {p.ma_phieu ?? p.id.slice(0, 8)}
                      </span>
                    </td>
                    <td data-label={t("Loại")}>{t("Tiêu hao")}</td>
                    <td data-label={t("Nội dung")}>{p.tom_tat ?? "-"}</td>
                    <td data-label={t("Từ")}>{p.tu_kho_ten ?? "-"}</td>
                    <td data-label={t("Ngày")}>{fmtNgay(p.created_at)}</td>
                    <td data-label={t("Thao tác")} style={{ textAlign: "right" }}>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={busy !== null}
                        onClick={() => xacNhan(`/phieu-chuyen-kho/${p.id}/xac-nhan`, t("Đã xác nhận nhận {x}.", { x: p.ma_phieu ?? t("phiếu") }))}
                      >
                        <CheckCircle2 size={13} /> {t("Đã nhận")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PhanTrang trang={tCho.trang} tong={tCho.tong} onDoi={tCho.setTrang} donVi={t("phiếu")} />
        </div>
      )}

      <div className="content-card task-card-full">
        <div className="card-header">
          <FilterTabs<Tab>
            value={tab}
            onChange={setTab}
            tabs={[
              { key: "tscd", label: t("Tài sản cố định"), count: ccdcs?.length ?? 0 },
              { key: "tieu-hao", label: t("Tiêu hao đã nhận"), count: tieuHao.length },
              { key: "lich-su", label: t("Lịch sử giao nhận"), count: gn.length },
            ]}
          />
          <div className="topbar-search filter-search">
            <Search size={15} className="search-icon" />
            <input className="search-input" placeholder={t("Tìm mã, tên...")} value={tim} onChange={(e) => setTim(e.target.value)} />
          </div>
        </div>
        <div className="task-table-wrapper">
          {tab === "tscd" && (
            <table className="task-table">
              <thead>
                <tr>
                  <th style={{ width: "16%" }}>{t("Mã tài sản")}</th>
                  <th>{t("Tên tài sản")}</th>
                  <th style={{ width: "16%" }}>{t("Nhóm")}</th>
                  <th style={{ width: "12%", textAlign: "right" }}>{t("Nguyên giá")}</th>
                  <th style={{ width: "15%", textAlign: "center" }}>{t("Trạng thái")}</th>
                  <th style={{ width: "12%", textAlign: "right" }}>{t("Thao tác")}</th>
                </tr>
              </thead>
              <tbody>
                {ccdcs === null && (
                  <tr>
                    <td colSpan={6} className="task-empty">
                      {t("Đang tải…")}
                    </td>
                  </tr>
                )}
                {ccdcs !== null && dsTs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="task-empty">
                      {tuKhoa ? t("Không tìm thấy tài sản phù hợp.") : t("Bạn hiện không giữ tài sản cố định nào.")}
                    </td>
                  </tr>
                )}
                {tTs.dongTrang.map((c) => (
                  <tr key={c.id}>
                    <td data-label={t("Mã tài sản")}>
                      <span className="code-link" onClick={() => moTaiSan(c.id)}>
                        {c.id}
                      </span>
                    </td>
                    <td data-label={t("Tên tài sản")}>
                      <div className="cell-stack">
                        <span className="strong">{c.ten_ccdc}</span>
                        {c.so_seri && <span className="small text-secondary">Seri: {c.so_seri}</span>}
                      </div>
                    </td>
                    <td data-label={t("Nhóm")} className="text-secondary">
                      {c.ten_nhom ?? "-"}
                    </td>
                    <td data-label={t("Nguyên giá")} style={{ textAlign: "right" }}>
                      {c.nguyen_gia ? fmtGiaTri(c.nguyen_gia) : "-"}
                    </td>
                    <td data-label={t("Trạng thái")} style={{ textAlign: "center" }}>
                      <StatusBadge label={TRANG_THAI_TS[c.trang_thai_hien_tai]?.label ?? c.trang_thai_hien_tai} tone={TRANG_THAI_TS[c.trang_thai_hien_tai]?.tone} />
                    </td>
                    <td data-label={t("Thao tác")} style={{ textAlign: "right" }}>
                      {c.trang_thai_hien_tai === "Dang cap phat" ? (
                        <button className="btn btn-outline btn-sm danger-outline" onClick={() => moTaiSan(c.id)}>
                          {t("Báo hỏng")}
                        </button>
                      ) : (
                        <button className="btn btn-outline btn-sm" onClick={() => moTaiSan(c.id)}>
                          {t("Chi tiết")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "tieu-hao" && (
            <table className="task-table">
              <thead>
                <tr>
                  <th style={{ width: "14%" }}>{t("Mã phiếu")}</th>
                  <th style={{ width: "12%" }}>{t("Ngày")}</th>
                  <th>{t("Vật tư")}</th>
                  <th style={{ width: "18%" }}>{t("Từ kho")}</th>
                  <th style={{ width: "12%", textAlign: "right" }}>{t("Giá trị")}</th>
                  <th style={{ width: "14%", textAlign: "center" }}>{t("Xác nhận")}</th>
                </tr>
              </thead>
              <tbody>
                {dsTh.length === 0 && (
                  <tr>
                    <td colSpan={6} className="task-empty">
                      {t("Chưa có phiếu cấp phát tiêu hao nào cho bạn.")}
                    </td>
                  </tr>
                )}
                {tTh.dongTrang.map((p) => (
                  <tr key={p.id}>
                    <td data-label={t("Mã phiếu")}>
                      <span className="code-link" onClick={() => moPhieu("chuyen_kho", p.id)}>
                        {p.ma_phieu ?? p.id.slice(0, 8)}
                      </span>
                    </td>
                    <td data-label={t("Ngày")}>{fmtNgayGio(p.created_at)}</td>
                    <td data-label={t("Vật tư")}>{p.tom_tat ?? "-"}</td>
                    <td data-label={t("Từ kho")}>{p.tu_kho_ten ?? "-"}</td>
                    <td data-label={t("Giá trị")} style={{ textAlign: "right" }}>
                      {p.tong_tien ? fmtGiaTri(p.tong_tien) : "-"}
                    </td>
                    <td data-label={t("Xác nhận")} style={{ textAlign: "center" }}>
                      {p.da_xac_nhan ? <StatusBadge label={t("Đã xác nhận")} tone="success" /> : <StatusBadge label={t("Chưa xác nhận")} tone="warning" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "lich-su" && (
            <table className="task-table">
              <thead>
                <tr>
                  <th style={{ width: "14%" }}>{t("Mã phiếu")}</th>
                  <th style={{ width: "12%" }}>{t("Loại")}</th>
                  <th>{t("Tài sản")}</th>
                  <th style={{ width: "18%" }}>{t("Từ / đến")}</th>
                  <th style={{ width: "11%" }}>{t("Ngày")}</th>
                  <th style={{ width: "13%", textAlign: "center" }}>{t("Xác nhận")}</th>
                </tr>
              </thead>
              <tbody>
                {dsGn.length === 0 && (
                  <tr>
                    <td colSpan={6} className="task-empty">
                      {t("Chưa có phiếu giao nhận tài sản nào liên quan đến bạn.")}
                    </td>
                  </tr>
                )}
                {tLs.dongTrang.map((p) => (
                  <tr key={p.id}>
                    <td data-label={t("Mã phiếu")}>
                      <span className="code-link" onClick={() => moPhieu("giao_nhan", p.id)}>
                        {p.ma_phieu ?? p.id.slice(0, 8)}
                      </span>
                    </td>
                    <td data-label={t("Loại")}>{LOAI_GN[p.loai_phieu] ?? p.loai_phieu}</td>
                    <td data-label={t("Tài sản")}>
                      {fmtSo(p.so_luong_ccdc)} TS: {p.tom_tat ?? "-"}
                    </td>
                    <td data-label={t("Từ / đến")} className="text-secondary">
                      {p.loai_phieu === "Thu hoi" ? `→ ${p.den_kho_ten ?? "-"}` : `${p.tu_kho_ten ?? p.nhan_vien_ten ?? "-"} →`}
                    </td>
                    <td data-label={t("Ngày")}>{fmtNgay(p.ngay_lap)}</td>
                    <td data-label={t("Xác nhận")} style={{ textAlign: "center" }}>
                      {p.da_xac_nhan ? (
                        <StatusBadge label={t("Đã xác nhận")} tone="success" />
                      ) : laBenNhan(p) ? (
                        <StatusBadge label={t("Chờ tôi xác nhận")} tone="warning" />
                      ) : (
                        <StatusBadge label={t("Chưa xác nhận")} tone="neutral" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {tab === "tscd" && <PhanTrang trang={tTs.trang} tong={tTs.tong} onDoi={tTs.setTrang} donVi={t("tài sản")} />}
        {tab === "tieu-hao" && <PhanTrang trang={tTh.trang} tong={tTh.tong} onDoi={tTh.setTrang} donVi={t("phiếu")} />}
        {tab === "lich-su" && <PhanTrang trang={tLs.trang} tong={tLs.tong} onDoi={tLs.setTrang} donVi={t("phiếu")} />}
      </div>
    </div>
  );
}

// Admin/HCNS tu lien ket tai khoan cua minh voi 1 ho so nhan vien dang lam viec (chi gan email_dang_nhap,
// server chan neu ho so / email da lien ket noi khac).
function LienKetHoSo({ email }: { email: string }) {
  const refreshUser = useRefreshUser();
  const [ds, setDs] = useState<{ ma_nv: string; ten_nv: string }[]>([]);
  const [maNv, setMaNv] = useState("");
  const [busy, setBusy] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ rows: { ma_nv: string; ten_nv: string }[] }>("/nhan-vien?gon=1")
      .then((r) => setDs(r.rows))
      .catch((e) => setLoi(thongBaoLoi(e, t("Không tải được danh sách nhân viên."))));
  }, []);
  const options = useMemo(() => ds.map((n) => ({ value: n.ma_nv, label: `${n.ten_nv} (${n.ma_nv})` })), [ds]);

  async function lienKet() {
    setBusy(true);
    setLoi(null);
    try {
      await api.post(`/nhan-vien/${encodeURIComponent(maNv)}/lien-ket-tai-khoan`, { email });
      baoThayDoi();
      await refreshUser();
    } catch (e) {
      setLoi(thongBaoLoi(e, t("Không liên kết được.")));
      setBusy(false);
    }
  }

  return (
    <div className="content-card">
      <div className="card-header">
        <h3 className="card-title">{t("Liên kết hồ sơ nhân viên")}</h3>
      </div>
      {loi && <div className="alert alert-error">{loi}</div>}
      <div className="field-group">
        <label className="field-label">{t("Hồ sơ của bạn")}</label>
        <SearchSelect options={options} value={maNv} onChange={setMaNv} placeholder={t("Tìm theo họ tên hoặc mã NV...")} />
      </div>
      <button className="btn btn-primary" disabled={!maNv || busy} onClick={lienKet}>
        {busy ? t("Đang liên kết...") : t("Liên kết với {email}", { email })}
      </button>
    </div>
  );
}
