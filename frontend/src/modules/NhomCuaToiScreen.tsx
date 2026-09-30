import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Archive, Package, Search, UserX, Users } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { StatusBadge } from "../components/StatusBadge";
import { useChiTiet } from "../components/ChiTiet";
import { fmtGiaTri, fmtSo } from "../lib/format";
import { useNav } from "../lib/navigation";
import { baoThayDoi, useKhiThayDoi } from "../lib/suKien";
import { TRANG_THAI_TS, thongBaoLoi } from "../lib/nhan";

interface CapDuoiRow {
  ma_nv: string;
  ten_nv: string;
  bo_phan: string | null;
  chuc_vu: string | null;
  email_dang_nhap: string | null;
  so_ts_dang_giu: number;
}
interface CcdcRow {
  id: string;
  ten_ccdc: string;
  ten_nhom: string | null;
  nguyen_gia: number | null;
  trang_thai_hien_tai: string;
}
interface TonRow {
  ton: number;
  don_gia_tham_khao: number | null;
}
interface ThanhVien extends CapDuoiRow {
  la_toi: boolean;
}

// Quan ly: nhom cap duoi truc tiep, TS tung nguoi dang giu, dieu chuyen trong nhom (minh <-> cap duoi,
// cap duoi <-> cap duoi) va bao hong (qua popup tai san). Server kiem tra lai pham vi nhom.
export function NhomCuaToiScreen() {
  const auth = useAuth();
  const user = auth.status === "authenticated" ? auth.user : null;
  const { navigate } = useNav();
  const { moTaiSan } = useChiTiet();
  const khoQl = user?.kho_phu_trach.find((k) => k.loai === "Quan ly") ?? null;

  const [ds, setDs] = useState<CapDuoiRow[] | null>(null);
  const [soTsToi, setSoTsToi] = useState(0);
  const [ton, setTon] = useState<TonRow[]>([]);
  const [chon, setChon] = useState<string | null>(user?.ma_nv ?? null);
  const [ts, setTs] = useState<CcdcRow[] | null>(null);
  const [tim, setTim] = useState("");
  const [chuyen, setChuyen] = useState<CcdcRow | null>(null);
  const [den, setDen] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const [busy, setBusy] = useState(false);
  const [loiChuyen, setLoiChuyen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const [capNhatLuc, setCapNhatLuc] = useState<string | null>(null);

  const load = useCallback(async () => {
    setDangTai(true);
    setLoi(null);
    try {
      const [r, toi, tk] = await Promise.all([
        api.get<{ rows: CapDuoiRow[] }>("/nhan-vien/cap-duoi"),
        user?.ma_nv ? api.get<{ rows: CcdcRow[] }>(`/ccdc?nguoi_dang_giu=${encodeURIComponent(user.ma_nv)}`) : Promise.resolve({ rows: [] as CcdcRow[] }),
        khoQl ? api.get<{ rows: TonRow[] }>(`/bao-cao/ton-kho?kho_id=${khoQl.id}`).catch(() => ({ rows: [] as TonRow[] })) : Promise.resolve({ rows: [] as TonRow[] }),
      ]);
      setDs(r.rows);
      setSoTsToi(toi.rows.length);
      setTon(tk.rows);
      setCapNhatLuc(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace("T", " "));
    } catch (e) {
      setLoi(thongBaoLoi(e, "Không tải được nhóm."));
      setDs([]);
    } finally {
      setDangTai(false);
    }
  }, [user?.ma_nv, khoQl]);

  const loadTs = useCallback(async () => {
    if (!chon) return setTs(null);
    setTs(null);
    try {
      const r = await api.get<{ rows: CcdcRow[] }>(`/ccdc?nguoi_dang_giu=${encodeURIComponent(chon)}`);
      setTs(r.rows.filter((c) => !["Da thanh ly", "Da tieu huy"].includes(c.trang_thai_hien_tai)));
    } catch {
      setTs([]);
    }
  }, [chon]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadTs();
  }, [loadTs]);
  useKhiThayDoi(() => {
    load();
    loadTs();
  });

  const nhom: ThanhVien[] = useMemo(
    () => [
      ...(user?.ma_nv
        ? [{ ma_nv: user.ma_nv, ten_nv: user.ten || user.email, bo_phan: null, chuc_vu: null, email_dang_nhap: user.email, so_ts_dang_giu: soTsToi, la_toi: true }]
        : []),
      ...(ds ?? []).map((d) => ({ ...d, la_toi: false })),
    ],
    [user, ds, soTsToi],
  );

  if (!user) return null;

  const t = tim.trim().toLowerCase();
  const dsHien = nhom.filter((n) => !t || `${n.ma_nv} ${n.ten_nv} ${n.bo_phan ?? ""}`.toLowerCase().includes(t));
  const tongTs = nhom.reduce((s, n) => s + n.so_ts_dang_giu, 0);
  const chuaTk = (ds ?? []).filter((d) => !d.email_dang_nhap);
  const conTon = ton.filter((r) => r.ton > 0);
  const nguoiChon = nhom.find((n) => n.ma_nv === chon);

  async function xacNhanChuyen() {
    if (!chuyen || !den || !chon) return;
    setBusy(true);
    setLoiChuyen(null);
    try {
      await api.post("/phieu-giao-nhan", {
        loai_phieu: "Dieu chuyen",
        nhan_vien_id: chon,
        nhan_vien_nhan_moi_id: den,
        ghi_chu: ghiChu.trim() || undefined,
        items: [{ ccdc_id: chuyen.id }],
      });
      setMsg(`Đã lập phiếu điều chuyển ${chuyen.id} cho ${nhom.find((n) => n.ma_nv === den)?.ten_nv ?? den} - chờ người nhận xác nhận.`);
      setChuyen(null);
      baoThayDoi();
      await Promise.all([load(), loadTs()]);
    } catch (e) {
      setLoiChuyen(thongBaoLoi(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard-container">
      <PageHeader
        title="Nhóm của tôi"
        filters={khoQl ? <span className="muted small">Thủ kho: {khoQl.ten_kho}</span> : undefined}
        actions={
          khoQl && (
            <>
              <button className="btn btn-outline" onClick={() => navigate("cap-phat", { tab: "ton-kho", kho_id: String(khoQl.id) })}>
                <Archive size={14} /> Tồn kho nhóm
              </button>
              <button className="btn btn-primary" onClick={() => navigate("cap-phat", { tab: "phieu" })}>
                <ArrowRightLeft size={14} /> Cấp phát tiêu hao
              </button>
            </>
          )
        }
        capNhatLuc={capNhatLuc}
        onRefresh={load}
        dangTai={dangTai}
      />
      {!user.ma_nv && <div className="alert alert-error">Tài khoản chưa liên kết hồ sơ nhân viên - nhờ HCNS liên kết ở màn Nhân viên.</div>}
      {msg && <div className="alert alert-success">{msg}</div>}
      {loi && <div className="alert alert-error">{loi}</div>}

      <div className="kpi-grid kpi-grid-4">
        <KpiCard
          tone="cyan"
          icon={<Users size={20} className="text-white" />}
          watermark={<Users size={52} />}
          label="Cấp dưới trực tiếp"
          value={fmtSo(ds?.length ?? 0)}
          trend={<div className="kpi-trend"><span className="trend-sub">{fmtSo(new Set((ds ?? []).map((d) => d.bo_phan).filter(Boolean)).size)} bộ phận</span></div>}
        />
        <KpiCard
          tone="blue-light"
          icon={<Package size={20} className="text-white" />}
          watermark={<Package size={52} />}
          label="Tài sản nhóm đang giữ"
          value={fmtSo(tongTs)}
          trend={<div className="kpi-trend"><span className="trend-sub">{fmtSo(soTsToi)} của tôi · {fmtSo(tongTs - soTsToi)} của cấp dưới</span></div>}
        />
        <KpiCard
          tone="purple"
          icon={<Archive size={20} className="text-white" />}
          watermark={<Archive size={52} />}
          label="Tồn tiêu hao kho nhóm"
          value={khoQl ? fmtGiaTri(conTon.reduce((s, r) => s + r.ton * (r.don_gia_tham_khao ?? 0), 0)) : "-"}
          trend={<div className="kpi-trend"><span className="trend-sub">{khoQl ? `${fmtSo(conTon.length)} mặt hàng còn tồn` : "Chưa có kho quản lý"}</span></div>}
          onClick={khoQl ? () => navigate("cap-phat", { tab: "ton-kho", kho_id: String(khoQl.id) }) : undefined}
        />
        <KpiCard
          tone={chuaTk.length ? "yellow" : "blue"}
          icon={<UserX size={20} className="text-white" />}
          watermark={<UserX size={52} />}
          label="Cấp dưới chưa có tài khoản"
          value={fmtSo(chuaTk.length)}
          trend={<div className="kpi-trend"><span className="trend-sub">Chưa tự xác nhận nhận hàng được</span></div>}
        />
      </div>

      <div className="split-grid">
        <div className="content-card">
          <div className="card-header">
            <div className="card-title-wrap">
              <Users size={17} className="card-title-icon text-teal" />
              <h2 className="card-title">Thành viên nhóm</h2>
            </div>
            <div className="topbar-search filter-search">
              <Search size={15} className="search-icon" />
              <input className="search-input" placeholder="Tìm tên, mã NV..." value={tim} onChange={(e) => setTim(e.target.value)} />
            </div>
          </div>
          <div className="task-table-wrapper table-scroll-y">
            <table className="task-table">
              <thead>
                <tr>
                  <th>Nhân viên</th>
                  <th style={{ width: "32%" }}>Bộ phận</th>
                  <th style={{ width: "16%", textAlign: "right" }}>TS giữ</th>
                </tr>
              </thead>
              <tbody>
                {ds === null && (
                  <tr>
                    <td colSpan={3} className="task-empty">
                      Đang tải…
                    </td>
                  </tr>
                )}
                {ds !== null && dsHien.length === 0 && (
                  <tr>
                    <td colSpan={3} className="task-empty">
                      {nhom.length ? "Không tìm thấy thành viên." : "Bạn chưa có cấp dưới trực tiếp nào."}
                    </td>
                  </tr>
                )}
                {dsHien.map((n) => (
                  <tr key={n.ma_nv} className={`row-clickable${chon === n.ma_nv ? " row-selected" : ""}`} onClick={() => setChon(n.ma_nv)}>
                    <td data-label="Nhân viên">
                      <div className="cell-stack">
                        <span className="strong">
                          {n.ten_nv}
                          {n.la_toi && " (tôi)"}
                        </span>
                        <span className="small text-secondary">
                          {n.ma_nv}
                          {!n.email_dang_nhap && " · chưa có tài khoản"}
                        </span>
                      </div>
                    </td>
                    <td data-label="Bộ phận" className="text-secondary">
                      {n.bo_phan ?? "-"}
                    </td>
                    <td data-label="TS giữ" style={{ textAlign: "right" }} className="strong">
                      {fmtSo(n.so_ts_dang_giu)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="content-card">
          <div className="card-header">
            <div className="card-title-wrap">
              <Package size={17} className="card-title-icon text-teal" />
              <h2 className="card-title">{nguoiChon ? `Tài sản của ${nguoiChon.la_toi ? "tôi" : nguoiChon.ten_nv}` : "Tài sản đang giữ"}</h2>
            </div>
          </div>
          <div className="task-table-wrapper table-scroll-y">
            <table className="task-table">
              <thead>
                <tr>
                  <th style={{ width: "26%" }}>Mã tài sản</th>
                  <th>Tên tài sản</th>
                  <th style={{ width: "18%", textAlign: "center" }}>Trạng thái</th>
                  <th style={{ width: "24%", textAlign: "right" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {!chon && (
                  <tr>
                    <td colSpan={4} className="task-empty">
                      Chọn 1 thành viên để xem tài sản đang giữ.
                    </td>
                  </tr>
                )}
                {chon && ts === null && (
                  <tr>
                    <td colSpan={4} className="task-empty">
                      Đang tải…
                    </td>
                  </tr>
                )}
                {chon && ts?.length === 0 && (
                  <tr>
                    <td colSpan={4} className="task-empty">
                      Không giữ tài sản cố định nào.
                    </td>
                  </tr>
                )}
                {ts?.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Mã tài sản">
                      <span className="code-link" onClick={() => moTaiSan(c.id)}>
                        {c.id}
                      </span>
                    </td>
                    <td data-label="Tên tài sản">
                      <div className="cell-stack">
                        <span>{c.ten_ccdc}</span>
                        {c.nguyen_gia ? <span className="small text-secondary">{fmtGiaTri(c.nguyen_gia)}</span> : null}
                      </div>
                    </td>
                    <td data-label="Trạng thái" style={{ textAlign: "center" }}>
                      <StatusBadge label={TRANG_THAI_TS[c.trang_thai_hien_tai]?.label ?? c.trang_thai_hien_tai} tone={TRANG_THAI_TS[c.trang_thai_hien_tai]?.tone} />
                    </td>
                    <td data-label="Thao tác" style={{ textAlign: "right" }}>
                      {c.trang_thai_hien_tai === "Dang cap phat" && (
                        <div className="row-actions">
                          <button
                            className="btn btn-outline btn-sm"
                            disabled={nhom.length < 2}
                            title={nhom.length < 2 ? "Nhóm chưa có người khác để nhận" : undefined}
                            onClick={() => {
                              setChuyen(c);
                              setDen("");
                              setGhiChu("");
                              setLoiChuyen(null);
                            }}
                          >
                            Điều chuyển
                          </button>
                          <button className="btn btn-outline btn-sm danger-outline" onClick={() => moTaiSan(c.id)}>
                            Báo hỏng
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {chuyen && nguoiChon && (
        <Modal title="Điều chuyển tài sản trong nhóm" onClose={() => setChuyen(null)}>
          <p>
            <b>{chuyen.id}</b> - {chuyen.ten_ccdc}
            <br />
            <span className="muted small">Đang giữ: {nguoiChon.la_toi ? "tôi" : nguoiChon.ten_nv}</span>
          </p>
          <div className="field-group">
            <label className="field-label">Chuyển cho *</label>
            <select value={den} onChange={(e) => setDen(e.target.value)}>
              <option value="">-- Chọn người nhận --</option>
              {nhom
                .filter((n) => n.ma_nv !== chon)
                .map((n) => (
                  <option key={n.ma_nv} value={n.ma_nv}>
                    {n.ten_nv}
                    {n.la_toi ? " (tôi)" : ""}
                  </option>
                ))}
            </select>
          </div>
          <div className="field-group">
            <label className="field-label">Ghi chú</label>
            <input type="text" value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} placeholder="Lý do điều chuyển, tình trạng bàn giao..." />
          </div>
          {loiChuyen && <div className="alert alert-error">{loiChuyen}</div>}
          <div className="modal-actions">
            <button className="btn" onClick={() => setChuyen(null)}>
              Huỷ
            </button>
            <button className="btn btn-primary" disabled={busy || !den} onClick={xacNhanChuyen}>
              {busy ? "Đang lập phiếu..." : "Lập phiếu điều chuyển"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
