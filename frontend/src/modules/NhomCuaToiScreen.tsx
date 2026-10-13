import { t } from "../lib/i18n";
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
import { PhanTrang, useTrangKhach } from "../components/PhanTrang";
import { ChonLoc } from "../components/ChonLoc";

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
  // Kho cua chinh minh: kho QL, hoac kho QL da doi thanh kho mien (van giu nguoi phu trach).
  const khoQl = user?.kho_phu_trach.find((k) => k.loai === "Quan ly") ?? user?.kho_phu_trach.find((k) => !!user.ma_nv && k.nhan_vien_id === user.ma_nv) ?? null;

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
      setLoi(thongBaoLoi(e, t("Không tải được nhóm.")));
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

  const tuKhoa = tim.trim().toLowerCase();
  const dsHien = nhom.filter((n) => !tuKhoa || `${n.ma_nv} ${n.ten_nv} ${n.bo_phan ?? ""}`.toLowerCase().includes(tuKhoa));
  const tNhom = useTrangKhach(dsHien, [tuKhoa]);
  const tTsNv = useTrangKhach(ts, [chon]);

  if (!user) return null;

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
      setMsg(t("Đã lập phiếu điều chuyển {id} cho {x} - chờ người nhận xác nhận.", { id: chuyen.id, x: nhom.find((n) => n.ma_nv === den)?.ten_nv ?? den }));
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
        title={t("Nhóm của tôi")}
        filters={khoQl ? <span className="muted small">{t("Thủ kho:")} {khoQl.ten_kho}</span> : undefined}
        actions={
          khoQl && (
            <>
              <button className="btn btn-outline" onClick={() => navigate("cap-phat", { tab: "ton-kho", kho_id: String(khoQl.id) })}>
                <Archive size={14} /> {t("Tồn kho nhóm")}
              </button>
              <button className="btn btn-primary" onClick={() => navigate("cap-phat", { tab: "phieu" })}>
                <ArrowRightLeft size={14} /> {t("Cấp phát tiêu hao")}
              </button>
            </>
          )
        }
        capNhatLuc={capNhatLuc}
        onRefresh={load}
        dangTai={dangTai}
      />
      {!user.ma_nv && <div className="alert alert-error">{t("Tài khoản chưa liên kết hồ sơ nhân viên - nhờ HCNS liên kết ở màn Nhân viên.")}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}
      {loi && <div className="alert alert-error">{loi}</div>}

      <div className="kpi-grid kpi-grid-4">
        <KpiCard
          tone="cyan"
          icon={<Users size={20} className="text-white" />}
          watermark={<Users size={52} />}
          label={t("Cấp dưới trực tiếp")}
          value={fmtSo(ds?.length ?? 0)}
          trend={<div className="kpi-trend"><span className="trend-sub">{fmtSo(new Set((ds ?? []).map((d) => d.bo_phan).filter(Boolean)).size)} {t("bộ phận")}</span></div>}
        />
        <KpiCard
          tone="blue-light"
          icon={<Package size={20} className="text-white" />}
          watermark={<Package size={52} />}
          label={t("Tài sản nhóm đang giữ")}
          value={fmtSo(tongTs)}
          trend={<div className="kpi-trend"><span className="trend-sub">{fmtSo(soTsToi)} {t("của tôi ·")} {fmtSo(tongTs - soTsToi)} {t("của cấp dưới")}</span></div>}
        />
        <KpiCard
          tone="purple"
          icon={<Archive size={20} className="text-white" />}
          watermark={<Archive size={52} />}
          label={t("Tồn tiêu hao kho nhóm")}
          value={khoQl ? fmtGiaTri(conTon.reduce((s, r) => s + r.ton * (r.don_gia_tham_khao ?? 0), 0)) : "-"}
          trend={<div className="kpi-trend"><span className="trend-sub">{khoQl ? t("{x} mặt hàng còn tồn", { x: fmtSo(conTon.length) }) : t("Chưa có kho quản lý")}</span></div>}
          onClick={khoQl ? () => navigate("cap-phat", { tab: "ton-kho", kho_id: String(khoQl.id) }) : undefined}
        />
        <KpiCard
          tone={chuaTk.length ? "yellow" : "blue"}
          icon={<UserX size={20} className="text-white" />}
          watermark={<UserX size={52} />}
          label={t("Cấp dưới chưa có tài khoản")}
          value={fmtSo(chuaTk.length)}
          trend={<div className="kpi-trend"><span className="trend-sub">{t("Chưa tự xác nhận nhận hàng được")}</span></div>}
        />
      </div>

      <div className="split-grid">
        <div className="content-card">
          <div className="card-header">
            <div className="card-title-wrap">
              <Users size={17} className="card-title-icon text-teal" />
              <h2 className="card-title">{t("Thành viên nhóm")}</h2>
            </div>
            <div className="topbar-search filter-search">
              <Search size={15} className="search-icon" />
              <input className="search-input" placeholder={t("Tìm tên, mã NV...")} value={tim} onChange={(e) => setTim(e.target.value)} />
            </div>
          </div>
          <div className="task-table-wrapper table-scroll-y">
            <table className="task-table">
              <thead>
                <tr>
                  <th>{t("Nhân viên")}</th>
                  <th style={{ width: 70, textAlign: "right" }}>{t("TS giữ")}</th>
                </tr>
              </thead>
              <tbody>
                {ds === null && (
                  <tr>
                    <td colSpan={2} className="task-empty">
                      {t("Đang tải…")}
                    </td>
                  </tr>
                )}
                {ds !== null && dsHien.length === 0 && (
                  <tr>
                    <td colSpan={2} className="task-empty">
                      {nhom.length ? t("Không tìm thấy thành viên.") : t("Bạn chưa có cấp dưới trực tiếp nào.")}
                    </td>
                  </tr>
                )}
                {tNhom.dongTrang.map((n) => (
                  <tr key={n.ma_nv} className={`row-clickable${chon === n.ma_nv ? " row-selected" : ""}`} onClick={() => setChon(n.ma_nv)}>
                    <td data-label={t("Nhân viên")}>
                      <div className="cell-stack">
                        <span className="strong">
                          {n.ten_nv}
                          {n.la_toi && t(" (tôi)")}
                        </span>
                        <span className="small text-secondary">
                          {n.ma_nv}
                          {n.bo_phan && ` · ${n.bo_phan}`}
                          {!n.email_dang_nhap && t(" · chưa có tài khoản")}
                        </span>
                      </div>
                    </td>
                    <td data-label={t("TS giữ")} style={{ textAlign: "right" }} className="strong">
                      {fmtSo(n.so_ts_dang_giu)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PhanTrang trang={tNhom.trang} tong={tNhom.tong} onDoi={tNhom.setTrang} donVi={t("nhân viên")} />
        </div>

        <div className="content-card">
          <div className="card-header">
            <div className="card-title-wrap">
              <Package size={17} className="card-title-icon text-teal" />
              <h2 className="card-title">{nguoiChon ? t("Tài sản của {x}", { x: nguoiChon.la_toi ? t("tôi") : nguoiChon.ten_nv }) : t("Tài sản đang giữ")}</h2>
            </div>
          </div>
          <div className="task-table-wrapper table-scroll-y">
            <table className="task-table">
              <thead>
                <tr>
                  <th style={{ width: "26%" }}>{t("Mã tài sản")}</th>
                  <th>{t("Tên tài sản")}</th>
                  <th style={{ width: "18%", textAlign: "center" }}>{t("Trạng thái")}</th>
                  <th style={{ width: "24%", textAlign: "right" }}>{t("Thao tác")}</th>
                </tr>
              </thead>
              <tbody>
                {!chon && (
                  <tr>
                    <td colSpan={4} className="task-empty">
                      {t("Chọn 1 thành viên để xem tài sản đang giữ.")}
                    </td>
                  </tr>
                )}
                {chon && ts === null && (
                  <tr>
                    <td colSpan={4} className="task-empty">
                      {t("Đang tải…")}
                    </td>
                  </tr>
                )}
                {chon && ts?.length === 0 && (
                  <tr>
                    <td colSpan={4} className="task-empty">
                      {t("Không giữ tài sản cố định nào.")}
                    </td>
                  </tr>
                )}
                {tTsNv.dongTrang.map((c) => (
                  <tr key={c.id}>
                    <td data-label={t("Mã tài sản")}>
                      <span className="code-link" onClick={() => moTaiSan(c.id)}>
                        {c.id}
                      </span>
                    </td>
                    <td data-label={t("Tên tài sản")}>
                      <div className="cell-stack">
                        <span>{c.ten_ccdc}</span>
                        {c.nguyen_gia ? <span className="small text-secondary">{fmtGiaTri(c.nguyen_gia)}</span> : null}
                      </div>
                    </td>
                    <td data-label={t("Trạng thái")} style={{ textAlign: "center" }}>
                      <StatusBadge label={TRANG_THAI_TS[c.trang_thai_hien_tai]?.label ?? c.trang_thai_hien_tai} tone={TRANG_THAI_TS[c.trang_thai_hien_tai]?.tone} />
                    </td>
                    <td data-label={t("Thao tác")} style={{ textAlign: "right" }}>
                      {c.trang_thai_hien_tai === "Dang cap phat" && (
                        <div className="row-actions">
                          <button
                            className="btn btn-outline btn-sm"
                            disabled={nhom.length < 2}
                            title={nhom.length < 2 ? t("Nhóm chưa có người khác để nhận") : undefined}
                            onClick={() => {
                              setChuyen(c);
                              setDen("");
                              setGhiChu("");
                              setLoiChuyen(null);
                            }}
                          >
                            {t("Điều chuyển")}
                          </button>
                          <button className="btn btn-outline btn-sm danger-outline" onClick={() => moTaiSan(c.id)}>
                            {t("Báo hỏng")}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PhanTrang trang={tTsNv.trang} tong={tTsNv.tong} onDoi={tTsNv.setTrang} donVi={t("tài sản")} />
        </div>
      </div>

      {chuyen && nguoiChon && (
        <Modal title={t("Điều chuyển tài sản trong nhóm")} onClose={() => setChuyen(null)}>
          <p>
            <b>{chuyen.id}</b> - {chuyen.ten_ccdc}
            <br />
            <span className="muted small">{t("Đang giữ:")} {nguoiChon.la_toi ? t("tôi") : nguoiChon.ten_nv}</span>
          </p>
          <div className="field-group">
            <label className="field-label">{t("Chuyển cho *")}</label>
            <ChonLoc value={den} onChange={(e) => setDen(e.target.value)}>
              <option value="">{t("-- Chọn người nhận --")}</option>
              {nhom
                .filter((n) => n.ma_nv !== chon)
                .map((n) => (
                  <option key={n.ma_nv} value={n.ma_nv}>
                    {n.ten_nv}
                    {n.la_toi ? t(" (tôi)") : ""}
                  </option>
                ))}
            </ChonLoc>
          </div>
          <div className="field-group">
            <label className="field-label">{t("Ghi chú")}</label>
            <input type="text" value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} placeholder={t("Lý do điều chuyển, tình trạng bàn giao...")} />
          </div>
          {loiChuyen && <div className="alert alert-error">{loiChuyen}</div>}
          <div className="modal-actions">
            <button className="btn" onClick={() => setChuyen(null)}>
              {t("Huỷ")}
            </button>
            <button className="btn btn-primary" disabled={busy || !den} onClick={xacNhanChuyen}>
              {busy ? t("Đang lập phiếu...") : t("Lập phiếu điều chuyển")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
