import { useCallback, useEffect, useState } from "react";
import { Boxes, Building2, Package, Plus, Users } from "lucide-react";
import { api } from "../api/client";
import { useRefreshUser } from "../auth/AuthContext";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { StatusBadge } from "../components/StatusBadge";
import { fmtSo } from "../lib/format";
import { t } from "../lib/i18n";
import { thongBaoLoi } from "../lib/nhan";

// Cau hinh -> Cong ty (da phap nhan, Admin): moi cong ty quan ly ton kho doc lap. Tao cong ty moi tu sinh
// Kho mua hang + Kho tong HCNS rieng (routes/congTy.ts). Cong ty "mac dinh" nhan nhan su ETX moi.
interface CongTyRow {
  id: number;
  ma: string;
  ten: string;
  mst: string | null;
  dia_chi: string | null;
  mac_dinh: number;
  bat_tat: number;
  so_kho: number;
  so_nv: number;
  so_ts: number;
}
interface Form {
  id: number | null;
  ma: string;
  ten: string;
  mst: string;
  dia_chi: string;
  mac_dinh: boolean;
  bat_tat: boolean;
}

export function CongTyScreen() {
  const refreshUser = useRefreshUser();
  const [rows, setRows] = useState<CongTyRow[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [capNhatLuc, setCapNhatLuc] = useState<string | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const [dangLuu, setDangLuu] = useState(false);

  const load = useCallback(async () => {
    setDangTai(true);
    try {
      setRows((await api.get<{ rows: CongTyRow[] }>("/cong-ty")).rows);
      setCapNhatLuc(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace("T", " "));
    } catch (e) {
      setLoi(thongBaoLoi(e));
      setRows([]);
    } finally {
      setDangTai(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function luu() {
    if (!form) return;
    setDangLuu(true);
    setLoi(null);
    setMsg(null);
    try {
      const body = { ma: form.ma.trim(), ten: form.ten.trim(), mst: form.mst.trim() || null, dia_chi: form.dia_chi.trim() || null, mac_dinh: form.mac_dinh, bat_tat: form.bat_tat };
      if (form.id) await api.put(`/cong-ty/${form.id}`, body);
      else await api.post("/cong-ty", body);
      setMsg(form.id ? t("Đã cập nhật công ty {x}.", { x: body.ma }) : t("Đã thêm công ty {x} (kèm Kho mua hàng + Kho tổng HCNS riêng).", { x: body.ma }));
      setForm(null);
      await load();
      await refreshUser();
    } catch (e) {
      setLoi(thongBaoLoi(e));
    } finally {
      setDangLuu(false);
    }
  }

  const ds = rows ?? [];
  const hoatDong = ds.filter((r) => r.bat_tat);
  return (
    <div className="dashboard-container">
      <PageHeader
        title={t("Công ty (pháp nhân)")}
        actions={
          <button className="btn btn-primary" onClick={() => setForm({ id: null, ma: "", ten: "", mst: "", dia_chi: "", mac_dinh: false, bat_tat: true })}>
            <Plus size={15} /> {t("Thêm công ty")}
          </button>
        }
        capNhatLuc={capNhatLuc}
        onRefresh={load}
        dangTai={dangTai}
      />
      {loi && <div className="alert alert-error">{loi}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}

      <div className="kpi-grid kpi-grid-4">
        <KpiCard tone="cyan" icon={<Building2 size={20} className="text-white" />} watermark={<Building2 size={52} />} label={t("Công ty đang hoạt động")} value={fmtSo(hoatDong.length)} />
        <KpiCard tone="blue-light" icon={<Boxes size={20} className="text-white" />} watermark={<Boxes size={52} />} label={t("Kho")} value={fmtSo(ds.reduce((s, r) => s + r.so_kho, 0))} />
        <KpiCard tone="purple" icon={<Package size={20} className="text-white" />} watermark={<Package size={52} />} label={t("Tài sản cố định")} value={fmtSo(ds.reduce((s, r) => s + r.so_ts, 0))} />
        <KpiCard tone="blue" icon={<Users size={20} className="text-white" />} watermark={<Users size={52} />} label={t("Nhân viên đang làm việc")} value={fmtSo(ds.reduce((s, r) => s + r.so_nv, 0))} />
      </div>

      <div className="content-card task-card-full">
        <div className="alert alert-info">
          {t("Mỗi công ty quản lý tồn kho độc lập: kho, danh mục vật tư / nhóm tài sản, tài sản và nhân viên riêng. Chuyển hàng / tài sản giữa 2 công ty phải qua Kế toán công ty nguồn duyệt. Công ty mặc định nhận nhân sự mới đồng bộ từ ETX.")}
        </div>
        <div className="task-table-wrapper">
          <table className="task-table">
            <thead>
              <tr>
                <th style={{ width: "12%" }}>{t("Mã")}</th>
                <th>{t("Tên công ty")}</th>
                <th style={{ width: "14%" }}>{t("Mã số thuế")}</th>
                <th style={{ width: "8%", textAlign: "right" }}>{t("Kho")}</th>
                <th style={{ width: "10%", textAlign: "right" }}>{t("Tài sản")}</th>
                <th style={{ width: "10%", textAlign: "right" }}>{t("Nhân viên")}</th>
                <th style={{ width: "14%", textAlign: "center" }}>{t("Trạng thái")}</th>
                <th style={{ width: "10%", textAlign: "right" }}>{t("Thao tác")}</th>
              </tr>
            </thead>
            <tbody>
              {rows === null && (
                <tr>
                  <td colSpan={8} className="task-empty">
                    {t("Đang tải…")}
                  </td>
                </tr>
              )}
              {ds.map((r) => (
                <tr key={r.id}>
                  <td data-label={t("Mã")} className="strong">
                    {r.ma}
                  </td>
                  <td data-label={t("Tên công ty")}>
                    <div className="cell-stack">
                      <span>{r.ten}</span>
                      {r.dia_chi && <span className="small text-secondary">{r.dia_chi}</span>}
                    </div>
                  </td>
                  <td data-label={t("Mã số thuế")}>{r.mst ?? "-"}</td>
                  <td data-label={t("Kho")} style={{ textAlign: "right" }}>
                    {fmtSo(r.so_kho)}
                  </td>
                  <td data-label={t("Tài sản")} style={{ textAlign: "right" }}>
                    {fmtSo(r.so_ts)}
                  </td>
                  <td data-label={t("Nhân viên")} style={{ textAlign: "right" }}>
                    {fmtSo(r.so_nv)}
                  </td>
                  <td data-label={t("Trạng thái")} style={{ textAlign: "center" }}>
                    <div className="cell-stack" style={{ alignItems: "center" }}>
                      <StatusBadge label={r.bat_tat ? t("Hoạt động") : t("Ngừng")} tone={r.bat_tat ? "success" : "neutral"} />
                      {!!r.mac_dinh && <StatusBadge label={t("Mặc định")} tone="warning" />}
                    </div>
                  </td>
                  <td data-label={t("Thao tác")} style={{ textAlign: "right" }}>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => setForm({ id: r.id, ma: r.ma, ten: r.ten, mst: r.mst ?? "", dia_chi: r.dia_chi ?? "", mac_dinh: !!r.mac_dinh, bat_tat: !!r.bat_tat })}
                    >
                      {t("Sửa")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <Modal title={form.id ? t("Sửa công ty {x}", { x: form.ma }) : t("Thêm công ty")} onClose={() => setForm(null)}>
          <div className="field-group">
            <label className="field-label">{t("Mã công ty *")}</label>
            <input type="text" value={form.ma} disabled={!!form.id} onChange={(e) => setForm({ ...form, ma: e.target.value.toUpperCase() })} placeholder={t("VD: NSKX")} autoFocus={!form.id} />
            {!form.id && <div className="field-hint">{t("Mã ngắn, không đổi được sau khi tạo - dùng trong tên kho và ô chọn công ty.")}</div>}
          </div>
          <div className="field-group">
            <label className="field-label">{t("Tên công ty *")}</label>
            <input type="text" value={form.ten} onChange={(e) => setForm({ ...form, ten: e.target.value })} />
          </div>
          <div className="field-group">
            <label className="field-label">{t("Mã số thuế")}</label>
            <input type="text" value={form.mst} onChange={(e) => setForm({ ...form, mst: e.target.value })} />
          </div>
          <div className="field-group">
            <label className="field-label">{t("Địa chỉ")}</label>
            <input type="text" value={form.dia_chi} onChange={(e) => setForm({ ...form, dia_chi: e.target.value })} />
          </div>
          {form.id && (
            <>
              <label className="check-label">
                <input type="checkbox" checked={form.mac_dinh} onChange={(e) => setForm({ ...form, mac_dinh: e.target.checked })} />
                {t("Công ty mặc định (nhận nhân sự mới từ ETX)")}
              </label>
              <label className="check-label">
                <input type="checkbox" checked={form.bat_tat} onChange={(e) => setForm({ ...form, bat_tat: e.target.checked })} />
                {t("Đang hoạt động")}
              </label>
            </>
          )}
          <div className="modal-actions">
            <button className="btn" onClick={() => setForm(null)}>
              {t("Hủy")}
            </button>
            <button className="btn btn-primary" disabled={dangLuu || !form.ma.trim() || !form.ten.trim()} onClick={luu}>
              {dangLuu ? t("Đang lưu...") : t("Lưu")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
