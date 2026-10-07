import { t, tS } from "../lib/i18n";
import { useState } from "react";
import { AlertTriangle, ArrowLeftRight, Box, Check, ClipboardList, GitBranch, Tag, Trash2, X } from "lucide-react";
import { api } from "../api/client";
import { useDuLieuChung, type ViecRow } from "../lib/duLieuChung";
import { baoThayDoi } from "../lib/suKien";
import { fmtNgayGio } from "../lib/format";
import { thongBaoLoi } from "../lib/nhan";
import { Modal } from "./Modal";
import { useMoViec } from "./ChiTiet";
import { PhanTrang, useTrangKhach } from "./PhanTrang";

// Bang "viec can xu ly" dung chung (Tong quan: 5 dong, khong cot thao tac; Viec can lam: day du + thao
// tac nhanh). Du lieu tu /api/dashboard/viec-can-lam (useDuLieuChung) - khong co dong mau.

const ICON: Record<ViecRow["hanh_dong"], { icon: typeof Box; cls: string; dot: string }> = {
  ke_toan_duyet_ck: { icon: Box, cls: "text-green-icon", dot: "bg-green-circle" },
  ke_toan_duyet_xl: { icon: Trash2, cls: "text-orange-icon", dot: "bg-orange-circle" },
  ke_toan_duyet_gn: { icon: ArrowLeftRight, cls: "text-green-icon", dot: "bg-green-circle" },
  nhan_kho: { icon: ArrowLeftRight, cls: "text-indigo-icon", dot: "bg-indigo-circle" },
  xac_nhan_gn: { icon: GitBranch, cls: "text-indigo-icon", dot: "bg-indigo-circle" },
  xac_nhan_cp: { icon: Tag, cls: "text-blue-icon", dot: "bg-blue-circle" },
  hoan_tat_xl: { icon: Trash2, cls: "text-orange-icon", dot: "bg-orange-circle" },
  xu_ly_hong: { icon: AlertTriangle, cls: "text-red-icon", dot: "bg-red-circle" },
  mo_kiem_ke: { icon: ClipboardList, cls: "text-blue-icon", dot: "bg-blue-circle" },
  xem_ck: { icon: X, cls: "text-red-icon", dot: "bg-red-circle" },
  xem_xl: { icon: X, cls: "text-red-icon", dot: "bg-red-circle" },
};

function iconCho(r: ViecRow) {
  // Nhap TSCD / bao hong dung icon rieng cho de nhan (cung hanh dong ke_toan_duyet_xl).
  if (r.hanh_dong === "ke_toan_duyet_xl" && r.loai === "Nhập tài sản") return { icon: Box, cls: "text-green-icon", dot: "bg-green-circle" };
  if (r.hanh_dong === "ke_toan_duyet_xl" && r.loai === "Báo hỏng") return { icon: AlertTriangle, cls: "text-red-icon", dot: "bg-red-circle" };
  return ICON[r.hanh_dong];
}

/** Thao tac nhanh 1 cham (khong can nhap gi); con lai mo popup chi tiet de lam. */
const NHANH: Partial<Record<ViecRow["hanh_dong"], { nhan: string; path: (id: string) => string; tuChoi?: (id: string) => string; lyDoTuChoi?: string }>> = {
  ke_toan_duyet_ck: {
    nhan: t("Duyệt"),
    path: (id) => `/phieu-chuyen-kho/${id}/ke-toan-duyet`,
    tuChoi: (id) => `/phieu-chuyen-kho/${id}/ke-toan-tu-choi`,
    lyDoTuChoi: t("Lý do từ chối"),
  },
  ke_toan_duyet_xl: {
    nhan: t("Duyệt"),
    path: (id) => `/phieu-xu-ly-ts/${id}/ke-toan-duyet`,
    tuChoi: (id) => `/phieu-xu-ly-ts/${id}/ke-toan-tu-choi`,
    lyDoTuChoi: t("Lý do từ chối"),
  },
  ke_toan_duyet_gn: {
    nhan: t("Duyệt"),
    path: (id) => `/phieu-giao-nhan/${id}/ke-toan-duyet`,
    tuChoi: (id) => `/phieu-giao-nhan/${id}/ke-toan-tu-choi`,
    lyDoTuChoi: t("Lý do từ chối"),
  },
  nhan_kho: {
    nhan: t("Nhận"),
    path: (id) => `/phieu-chuyen-kho/${id}/nhan`,
    tuChoi: (id) => `/phieu-chuyen-kho/${id}/tu-choi-nhan`,
    lyDoTuChoi: t("Lý do từ chối nhận"),
  },
  xac_nhan_gn: { nhan: t("Xác nhận"), path: (id) => `/phieu-giao-nhan/${id}/xac-nhan` },
  xac_nhan_cp: { nhan: t("Xác nhận"), path: (id) => `/phieu-chuyen-kho/${id}/xac-nhan` },
};

export function TrangThaiViec({ r }: { r: ViecRow }) {
  if (r.qua_han)
    return (
      <span className="status-badge badge-warning-dot overdue" title={t("Quá hạn 48 giờ")}>
        <span className="dot-red" />
        {tS(r.trang_thai)}
      </span>
    );
  if (r.trang_thai.startsWith("Chờ kế toán"))
    return (
      <span className="status-badge badge-warning-dot">
        <span className="dot-orange" />
        {tS(r.trang_thai)}
      </span>
    );
  if (r.trang_thai === "Bị từ chối") return <span className="status-badge danger">{tS(r.trang_thai)}</span>;
  return <span className="status-badge badge-cyan-solid">{tS(r.trang_thai)}</span>;
}

export function ViecTable({ rows, coThaoTac = false, trong }: { rows: ViecRow[]; coThaoTac?: boolean; trong: string }) {
  const tViec = useTrangKhach(rows);
  const moViec = useMoViec();
  const { reload } = useDuLieuChung();
  const [busy, setBusy] = useState<string | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [tuChoi, setTuChoi] = useState<{ r: ViecRow; lyDo: string } | null>(null);

  async function gui(key: string, path: string, ghiChu?: string) {
    setBusy(key);
    setLoi(null);
    try {
      await api.post(path, { ghi_chu: ghiChu });
      baoThayDoi();
      await reload();
      return true;
    } catch (e) {
      setLoi(thongBaoLoi(e));
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {loi && <div className="alert alert-error">{loi}</div>}
      <div className="task-table-wrapper">
        <table className="task-table">
          <thead>
            <tr>
              <th style={{ width: coThaoTac ? "16%" : "17%" }}>{t("Loại phiếu")}</th>
              <th style={{ width: coThaoTac ? "13%" : "16%" }}>{t("Mã phiếu")}</th>
              <th style={{ width: "24%" }}>{t("Nội dung")}</th>
              <th style={{ width: coThaoTac ? "17%" : "20%" }}>{t("Đơn vị / Người tạo")}</th>
              <th style={{ width: "13%" }}>{t("Thời gian")}</th>
              <th style={{ width: coThaoTac ? "14%" : "10%", textAlign: coThaoTac ? "center" : "right" }}>{t("Trạng thái")}</th>
              {coThaoTac && <th style={{ width: "13%", textAlign: "right" }}>{t("Thao tác")}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={coThaoTac ? 7 : 6} className="task-empty">
                  {trong}
                </td>
              </tr>
            )}
            {tViec.dongTrang.map((r) => {
              const ic = iconCho(r);
              const Icon = ic.icon;
              const nhanh = NHANH[r.hanh_dong];
              const id = encodeURIComponent(r.id);
              return (
                <tr key={r.key} className={r.qua_han ? "row-overdue" : undefined}>
                  <td data-label={t("Loại phiếu")}>
                    <div className="table-type-cell">
                      <span className={`type-icon-dot ${ic.dot}`}>
                        <Icon size={10} className={ic.cls} />
                      </span>
                      <span>{tS(r.loai)}</span>
                    </div>
                  </td>
                  <td data-label={t("Mã phiếu")}>
                    <span className="code-link" onClick={() => moViec(r)} role="button" tabIndex={0}>
                      {r.ma_phieu ?? (r.loai_phieu === "tai_san" ? t("{x} tài sản", { x: r.so_luong ?? "" }) : r.id.slice(0, 8))}
                    </span>
                  </td>
                  <td data-label={t("Nội dung")}>{tS(r.noi_dung)}</td>
                  <td data-label={t("Đơn vị / Người tạo")} className="text-secondary">
                    {tS(r.don_vi_nguoi_tao)}
                  </td>
                  <td data-label={t("Thời gian")} className="text-secondary">
                    {fmtNgayGio(r.thoi_gian)}
                  </td>
                  <td data-label={t("Trạng thái")} style={{ textAlign: coThaoTac ? "center" : "right" }}>
                    <TrangThaiViec r={r} />
                  </td>
                  {coThaoTac && (
                    <td data-label={t("Thao tác")} style={{ textAlign: "right" }}>
                      <div className="row-actions">
                        {nhanh ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={busy !== null}
                              onClick={() => gui(r.key, nhanh.path(id))}
                            >
                              <Check size={13} /> {busy === r.key ? "…" : nhanh.nhan}
                            </button>
                            {nhanh.tuChoi && (
                              <button
                                type="button"
                                className="btn btn-outline btn-sm btn-icon danger-outline"
                                title={t("Từ chối")}
                                aria-label={t("Từ chối")}
                                disabled={busy !== null}
                                onClick={() => setTuChoi({ r, lyDo: "" })}
                              >
                                <X size={13} />
                              </button>
                            )}
                          </>
                        ) : (
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => moViec(r)}>
                            {r.hanh_dong === "hoan_tat_xl" ? t("Hoàn tất") : r.hanh_dong === "xu_ly_hong" ? t("Xử lý") : "Xem"}
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <PhanTrang trang={tViec.trang} tong={tViec.tong} onDoi={tViec.setTrang} donVi={t("việc")} />

      {tuChoi && (
        <Modal title={`${NHANH[tuChoi.r.hanh_dong]?.lyDoTuChoi ?? t("Lý do")} · ${tuChoi.r.ma_phieu ?? ""}`} onClose={() => setTuChoi(null)}>
          <p className="muted small" style={{ marginBottom: 10 }}>
            {tS(tuChoi.r.loai)}: {tS(tuChoi.r.noi_dung)}
          </p>
          <div className="field-group">
            <label className="field-label">{NHANH[tuChoi.r.hanh_dong]?.lyDoTuChoi} *</label>
            <input type="text" autoFocus value={tuChoi.lyDo} onChange={(e) => setTuChoi({ ...tuChoi, lyDo: e.target.value })} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setTuChoi(null)}>
              {t("Hủy")}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={!tuChoi.lyDo.trim() || busy !== null}
              onClick={async () => {
                const n = NHANH[tuChoi.r.hanh_dong]!;
                if (await gui(tuChoi.r.key, n.tuChoi!(encodeURIComponent(tuChoi.r.id)), tuChoi.lyDo.trim())) setTuChoi(null);
              }}
            >
              {t("Từ chối")}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
