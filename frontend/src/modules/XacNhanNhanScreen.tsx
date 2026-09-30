import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Inbox, Package, PackageCheck, Search, Wrench } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { FilterTabs } from "../components/FilterTabs";
import { StatusBadge } from "../components/StatusBadge";
import { useChiTiet } from "../components/ChiTiet";
import { QrScanButton } from "../components/QrScanner";
import { useDuLieuChung } from "../lib/duLieuChung";
import { fmtGiaTri, fmtGiaTriDong, fmtNgay, fmtNgayGio, fmtSo } from "../lib/format";
import { baoThayDoi, useKhiThayDoi } from "../lib/suKien";
import { LOAI_KHO, TRANG_THAI_TS, tenVaiTro, thongBaoLoi } from "../lib/nhan";

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
const LOAI_GN: Record<string, string> = { "Cap phat": "Cấp phát", "Thu hoi": "Thu hồi", "Dieu chuyen": "Điều chuyển", "Chuyen kho": "Chuyển kho" };

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
      setLoi(thongBaoLoi(e, "Không tải được dữ liệu."));
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

  const t = tim.trim().toLowerCase();
  const dsTs = useMemo(() => (ccdcs ?? []).filter((c) => !t || `${c.id} ${c.ten_ccdc} ${c.so_seri ?? ""}`.toLowerCase().includes(t)), [ccdcs, t]);
  const dsTh = useMemo(() => tieuHao.filter((p) => !t || `${p.ma_phieu ?? ""} ${p.tom_tat ?? ""}`.toLowerCase().includes(t)), [tieuHao, t]);
  const dsGn = useMemo(() => gn.filter((p) => !t || `${p.ma_phieu ?? ""} ${p.tom_tat ?? ""}`.toLowerCase().includes(t)), [gn, t]);

  if (!user) return null;
  const khoInfo = user.kho_phu_trach.filter((k) => k.loai !== "Mua hang");
  const moTa = `${tenVaiTro(user.vai_tro)}${khoInfo.length ? ` · Thủ kho: ${khoInfo.map((k) => `${k.ten_kho} (${LOAI_KHO[k.loai]})`).join(", ")}` : ""}`;

  if (!maNv) {
    return (
      <div className="dashboard-container">
        <PageHeader title="Tài sản của tôi" filters={<span className="muted small">{moTa}</span>} />
        <div className="content-card task-empty">
          Tài khoản <b>{user.email}</b> chưa được liên kết với hồ sơ nhân viên nào - nhờ HCNS nhập email này vào mục “Email đăng nhập” của bạn ở màn Nhân viên.
        </div>
      </div>
    );
  }

  const tongGt = (ccdcs ?? []).reduce((s, c) => s + (c.nguyen_gia ?? 0), 0);
  const soHong = (ccdcs ?? []).filter((c) => c.trang_thai_hien_tai === "Hong" || c.trang_thai_hien_tai === "Cho duyet bao hong").length;

  return (
    <div className="dashboard-container">
      <PageHeader
        title="Tài sản của tôi"
        filters={<span className="muted small">{moTa}</span>}
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
          label="Tài sản cố định đang giữ"
          value={fmtSo(ccdcs?.length ?? 0)}
          trend={<div className="kpi-trend"><span className="trend-sub">{fmtGiaTriDong(tongGt)}</span></div>}
          onClick={() => setTab("tscd")}
        />
        <KpiCard
          tone={gnCho.length + thCho.length ? "yellow" : "blue-light"}
          icon={<Inbox size={20} className="text-white" />}
          watermark={<Inbox size={52} />}
          label="Chờ tôi xác nhận đã nhận"
          value={fmtSo(gnCho.length + thCho.length)}
          trend={
            <div className="kpi-trend">
              <span className="trend-sub">
                {fmtSo(gnCho.length)} phiếu TSCĐ · {fmtSo(thCho.length)} phiếu tiêu hao
              </span>
            </div>
          }
        />
        <KpiCard
          tone="purple"
          icon={<PackageCheck size={20} className="text-white" />}
          watermark={<PackageCheck size={52} />}
          label="Tiêu hao nhận tháng này"
          value={fmtSo(thThang.length)}
          trend={<div className="kpi-trend"><span className="trend-sub">phiếu · {fmtGiaTri(thThang.reduce((s, p) => s + (p.tong_tien ?? 0), 0))}</span></div>}
          onClick={() => setTab("tieu-hao")}
        />
        <KpiCard
          tone={soHong ? "red" : "blue"}
          icon={<Wrench size={20} className="text-white" />}
          watermark={<Wrench size={52} />}
          label="Báo hỏng chờ kế toán duyệt"
          value={fmtSo(baoHong.length)}
          tangLaXau
          trend={<div className="kpi-trend"><span className="trend-sub">{fmtSo(soHong)} tài sản tôi giữ đang hỏng / chờ duyệt</span></div>}
        />
      </div>

      {(gnCho.length > 0 || thCho.length > 0) && (
        <div className="content-card">
          <div className="card-header">
            <div className="card-title-wrap">
              <AlertTriangle size={17} className="card-title-icon text-teal" />
              <h2 className="card-title">Cần xác nhận đã nhận</h2>
            </div>
          </div>
          <div className="task-table-wrapper">
            <table className="task-table">
              <thead>
                <tr>
                  <th style={{ width: "14%" }}>Mã phiếu</th>
                  <th style={{ width: "13%" }}>Loại</th>
                  <th>Nội dung</th>
                  <th style={{ width: "18%" }}>Từ</th>
                  <th style={{ width: "12%" }}>Ngày</th>
                  <th style={{ width: "12%", textAlign: "right" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {gnCho.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Mã phiếu">
                      <span className="code-link" onClick={() => moPhieu("giao_nhan", p.id)}>
                        {p.ma_phieu ?? p.id.slice(0, 8)}
                      </span>
                    </td>
                    <td data-label="Loại">TSCĐ · {LOAI_GN[p.loai_phieu] ?? p.loai_phieu}</td>
                    <td data-label="Nội dung">
                      {fmtSo(p.so_luong_ccdc)} TS: {p.tom_tat ?? "-"}
                    </td>
                    <td data-label="Từ">{p.tu_kho_ten ?? p.nhan_vien_ten ?? "-"}</td>
                    <td data-label="Ngày">{fmtNgay(p.ngay_lap)}</td>
                    <td data-label="Thao tác" style={{ textAlign: "right" }}>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={busy !== null}
                        onClick={() => xacNhan(`/phieu-giao-nhan/${p.id}/xac-nhan`, `Đã xác nhận nhận ${p.ma_phieu ?? "phiếu"}.`)}
                      >
                        <CheckCircle2 size={13} /> Đã nhận
                      </button>
                    </td>
                  </tr>
                ))}
                {thCho.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Mã phiếu">
                      <span className="code-link" onClick={() => moPhieu("chuyen_kho", p.id)}>
                        {p.ma_phieu ?? p.id.slice(0, 8)}
                      </span>
                    </td>
                    <td data-label="Loại">Tiêu hao</td>
                    <td data-label="Nội dung">{p.tom_tat ?? "-"}</td>
                    <td data-label="Từ">{p.tu_kho_ten ?? "-"}</td>
                    <td data-label="Ngày">{fmtNgay(p.created_at)}</td>
                    <td data-label="Thao tác" style={{ textAlign: "right" }}>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={busy !== null}
                        onClick={() => xacNhan(`/phieu-chuyen-kho/${p.id}/xac-nhan`, `Đã xác nhận nhận ${p.ma_phieu ?? "phiếu"}.`)}
                      >
                        <CheckCircle2 size={13} /> Đã nhận
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="content-card task-card-full">
        <div className="card-header">
          <FilterTabs<Tab>
            value={tab}
            onChange={setTab}
            tabs={[
              { key: "tscd", label: "Tài sản cố định", count: ccdcs?.length ?? 0 },
              { key: "tieu-hao", label: "Tiêu hao đã nhận", count: tieuHao.length },
              { key: "lich-su", label: "Lịch sử giao nhận", count: gn.length },
            ]}
          />
          <div className="topbar-search filter-search">
            <Search size={15} className="search-icon" />
            <input className="search-input" placeholder="Tìm mã, tên..." value={tim} onChange={(e) => setTim(e.target.value)} />
          </div>
        </div>
        <div className="task-table-wrapper">
          {tab === "tscd" && (
            <table className="task-table">
              <thead>
                <tr>
                  <th style={{ width: "16%" }}>Mã tài sản</th>
                  <th>Tên tài sản</th>
                  <th style={{ width: "16%" }}>Nhóm</th>
                  <th style={{ width: "12%", textAlign: "right" }}>Nguyên giá</th>
                  <th style={{ width: "15%", textAlign: "center" }}>Trạng thái</th>
                  <th style={{ width: "12%", textAlign: "right" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {ccdcs === null && (
                  <tr>
                    <td colSpan={6} className="task-empty">
                      Đang tải…
                    </td>
                  </tr>
                )}
                {ccdcs !== null && dsTs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="task-empty">
                      {t ? "Không tìm thấy tài sản phù hợp." : "Bạn hiện không giữ tài sản cố định nào."}
                    </td>
                  </tr>
                )}
                {dsTs.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Mã tài sản">
                      <span className="code-link" onClick={() => moTaiSan(c.id)}>
                        {c.id}
                      </span>
                    </td>
                    <td data-label="Tên tài sản">
                      <div className="cell-stack">
                        <span className="strong">{c.ten_ccdc}</span>
                        {c.so_seri && <span className="small text-secondary">Seri: {c.so_seri}</span>}
                      </div>
                    </td>
                    <td data-label="Nhóm" className="text-secondary">
                      {c.ten_nhom ?? "-"}
                    </td>
                    <td data-label="Nguyên giá" style={{ textAlign: "right" }}>
                      {c.nguyen_gia ? fmtGiaTri(c.nguyen_gia) : "-"}
                    </td>
                    <td data-label="Trạng thái" style={{ textAlign: "center" }}>
                      <StatusBadge label={TRANG_THAI_TS[c.trang_thai_hien_tai]?.label ?? c.trang_thai_hien_tai} tone={TRANG_THAI_TS[c.trang_thai_hien_tai]?.tone} />
                    </td>
                    <td data-label="Thao tác" style={{ textAlign: "right" }}>
                      {c.trang_thai_hien_tai === "Dang cap phat" ? (
                        <button className="btn btn-outline btn-sm danger-outline" onClick={() => moTaiSan(c.id)}>
                          Báo hỏng
                        </button>
                      ) : (
                        <button className="btn btn-outline btn-sm" onClick={() => moTaiSan(c.id)}>
                          Chi tiết
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
                  <th style={{ width: "14%" }}>Mã phiếu</th>
                  <th style={{ width: "12%" }}>Ngày</th>
                  <th>Vật tư</th>
                  <th style={{ width: "18%" }}>Từ kho</th>
                  <th style={{ width: "12%", textAlign: "right" }}>Giá trị</th>
                  <th style={{ width: "14%", textAlign: "center" }}>Xác nhận</th>
                </tr>
              </thead>
              <tbody>
                {dsTh.length === 0 && (
                  <tr>
                    <td colSpan={6} className="task-empty">
                      Chưa có phiếu cấp phát tiêu hao nào cho bạn.
                    </td>
                  </tr>
                )}
                {dsTh.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Mã phiếu">
                      <span className="code-link" onClick={() => moPhieu("chuyen_kho", p.id)}>
                        {p.ma_phieu ?? p.id.slice(0, 8)}
                      </span>
                    </td>
                    <td data-label="Ngày">{fmtNgayGio(p.created_at)}</td>
                    <td data-label="Vật tư">{p.tom_tat ?? "-"}</td>
                    <td data-label="Từ kho">{p.tu_kho_ten ?? "-"}</td>
                    <td data-label="Giá trị" style={{ textAlign: "right" }}>
                      {p.tong_tien ? fmtGiaTri(p.tong_tien) : "-"}
                    </td>
                    <td data-label="Xác nhận" style={{ textAlign: "center" }}>
                      {p.da_xac_nhan ? <StatusBadge label="Đã xác nhận" tone="success" /> : <StatusBadge label="Chưa xác nhận" tone="warning" />}
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
                  <th style={{ width: "14%" }}>Mã phiếu</th>
                  <th style={{ width: "12%" }}>Loại</th>
                  <th>Tài sản</th>
                  <th style={{ width: "18%" }}>Từ / đến</th>
                  <th style={{ width: "11%" }}>Ngày</th>
                  <th style={{ width: "13%", textAlign: "center" }}>Xác nhận</th>
                </tr>
              </thead>
              <tbody>
                {dsGn.length === 0 && (
                  <tr>
                    <td colSpan={6} className="task-empty">
                      Chưa có phiếu giao nhận tài sản nào liên quan đến bạn.
                    </td>
                  </tr>
                )}
                {dsGn.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Mã phiếu">
                      <span className="code-link" onClick={() => moPhieu("giao_nhan", p.id)}>
                        {p.ma_phieu ?? p.id.slice(0, 8)}
                      </span>
                    </td>
                    <td data-label="Loại">{LOAI_GN[p.loai_phieu] ?? p.loai_phieu}</td>
                    <td data-label="Tài sản">
                      {fmtSo(p.so_luong_ccdc)} TS: {p.tom_tat ?? "-"}
                    </td>
                    <td data-label="Từ / đến" className="text-secondary">
                      {p.loai_phieu === "Thu hoi" ? `→ ${p.den_kho_ten ?? "-"}` : `${p.tu_kho_ten ?? p.nhan_vien_ten ?? "-"} →`}
                    </td>
                    <td data-label="Ngày">{fmtNgay(p.ngay_lap)}</td>
                    <td data-label="Xác nhận" style={{ textAlign: "center" }}>
                      {p.da_xac_nhan ? (
                        <StatusBadge label="Đã xác nhận" tone="success" />
                      ) : laBenNhan(p) ? (
                        <StatusBadge label="Chờ tôi xác nhận" tone="warning" />
                      ) : (
                        <StatusBadge label="Chưa xác nhận" tone="neutral" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
