import { t } from "../lib/i18n";
import { useState } from "react";
import { api } from "../api/client";
import { Modal } from "./Modal";
import { StatusBadge } from "./StatusBadge";
import { ChonLoc } from "./ChonLoc";
import { PhanTrang, useTrangKhach } from "./PhanTrang";
import { congTyMacDinh } from "../lib/congTy";
import { baoThayDoi } from "../lib/suKien";
import { thongBaoLoi } from "../lib/nhan";

// Quan ly nhom (bang nhom_ccdc - DUNG CHUNG cho TSCD va vat tu tieu hao, rieng tung cong ty): them, doi ten, tat / bat lai.
// Dung o Danh muc tai san va Danh muc vat tu tieu hao. Quyen ghi: Admin/HCNS (route /nhom-ccdc).

export interface NhomCcdc {
  id: number;
  ten_nhom: string;
  bat_tat: number;
  cong_ty_id: number;
}

export function QuanLyNhomModal({
  title,
  nhoms,
  ctTao,
  nhieuCt,
  maCt,
  onClose,
  onDoi,
}: {
  title?: string;
  nhoms: NhomCcdc[];
  ctTao: ReturnType<typeof congTyMacDinh>;
  nhieuCt: boolean;
  maCt: (id: number) => string;
  onClose: () => void;
  onDoi: () => Promise<void>;
}) {
  const tNhom = useTrangKhach(nhoms);
  const [moi, setMoi] = useState("");
  const [congTyMoi, setCongTyMoi] = useState<number | null>(ctTao.macDinh);
  const [sua, setSua] = useState<{ id: number; ten: string } | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function chay(fn: () => Promise<unknown>) {
    setBusy(true);
    setLoi(null);
    try {
      await fn();
      await onDoi();
      baoThayDoi();
    } catch (e) {
      setLoi(thongBaoLoi(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={title ?? t("Quản lý nhóm tài sản")} onClose={onClose}>
      <div className="field-hint" style={{ marginBottom: 8 }}>
        {t("Danh sách nhóm dùng chung cho tài sản cố định và vật tư tiêu hao của từng công ty.")}
      </div>
      {loi && <div className="alert alert-error">{loi}</div>}
      <form
        className="qr-manual"
        style={{ marginTop: 0, marginBottom: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (moi.trim()) chay(() => api.post("/nhom-ccdc", { ten_nhom: moi.trim(), cong_ty_id: congTyMoi })).then(() => setMoi(""));
        }}
      >
        {ctTao.canChon && (
          <ChonLoc value={congTyMoi ?? ""} onChange={(e) => setCongTyMoi(Number(e.target.value))} aria-label={t("Công ty")} style={{ maxWidth: 120 }}>
            {ctTao.ds.map((c) => (
              <option key={c.id} value={c.id}>
                {c.ma}
              </option>
            ))}
          </ChonLoc>
        )}
        <input type="text" placeholder={t("Tên nhóm mới…")} value={moi} onChange={(e) => setMoi(e.target.value)} />
        <button type="submit" className="btn btn-primary" disabled={busy || !moi.trim()}>
          {t("Thêm nhóm")}
        </button>
      </form>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("Tên nhóm")}</th>
              <th>{t("Trạng thái")}</th>
              <th className="num">{t("Thao tác")}</th>
            </tr>
          </thead>
          <tbody>
            {tNhom.dongTrang.map((n) => (
              <tr key={n.id}>
                <td>
                  {sua?.id === n.id ? (
                    <input type="text" value={sua.ten} autoFocus onChange={(e) => setSua({ ...sua, ten: e.target.value })} />
                  ) : (
                    <span className="strong">
                      {n.ten_nhom}
                      {nhieuCt && <span className="muted"> · {maCt(n.cong_ty_id)}</span>}
                    </span>
                  )}
                </td>
                <td>{n.bat_tat ? <StatusBadge label={t("Đang dùng")} tone="success" /> : <StatusBadge label={t("Đã tắt")} />}</td>
                <td className="num">
                  <div className="row-actions">
                    {sua?.id === n.id ? (
                      <>
                        <button className="btn btn-sm" onClick={() => setSua(null)}>
                          {t("Hủy")}
                        </button>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={busy || !sua.ten.trim()}
                          onClick={() => chay(() => api.put(`/nhom-ccdc/${n.id}`, { ten_nhom: sua.ten.trim() })).then(() => setSua(null))}
                        >
                          {t("Lưu")}
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-outline btn-sm" onClick={() => setSua({ id: n.id, ten: n.ten_nhom })}>
                          {t("Đổi tên")}
                        </button>
                        {n.bat_tat ? (
                          <button className="btn btn-outline btn-sm danger-outline" disabled={busy} onClick={() => chay(() => api.delete(`/nhom-ccdc/${n.id}`))}>
                            {t("Tắt")}
                          </button>
                        ) : (
                          <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => chay(() => api.put(`/nhom-ccdc/${n.id}`, { ten_nhom: n.ten_nhom, bat_tat: true }))}>
                            {t("Bật lại")}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PhanTrang trang={tNhom.trang} tong={tNhom.tong} onDoi={tNhom.setTrang} donVi={t("nhóm")} />
    </Modal>
  );
}
