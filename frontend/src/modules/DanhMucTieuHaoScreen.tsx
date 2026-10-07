import { t } from "../lib/i18n";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Edit, FolderTree, Package, Plus, Search, Tag, Trash2 } from "lucide-react";
import { api } from "../api/client";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { useAuth } from "../auth/AuthContext";
import { useNav } from "../lib/navigation";
import { baoThayDoi, useKhiThayDoi } from "../lib/suKien";
import { fmtSo } from "../lib/format";
import { isHcns, thongBaoLoi } from "../lib/nhan";
import { PhanTrang, useTrangKhach } from "../components/PhanTrang";
import { TruongCongTy } from "../components/ChonCongTy";
import { congTyMacDinh, hienCongTy, maCongTy } from "../lib/congTy";

interface NhomCcdc {
  id: number;
  ten_nhom: string;
  bat_tat: number;
  cong_ty_id: number;
}
interface VtRow {
  id: string;
  ten_vt: string;
  nhom_id: number | null;
  ten_nhom: string | null;
  don_vi_tinh: string | null;
  don_gia_tham_khao: number | null;
  cong_ty_id: number;
}

function emptyForm(congTyId: number | null = null) {
  return { id: "", ten_vt: "", nhom_id: "", don_vi_tinh: "", don_gia_tham_khao: "", cong_ty_id: congTyId };
}

// Danh muc vat tu tieu hao (ton tinh dong o tab Ton kho, khong luu san). HCNS / Admin them - sua - tat.
export function DanhMucTieuHaoScreen({ tabs }: { tabs?: ReactNode }) {
  const auth = useAuth();
  const { navigate } = useNav();
  const canEdit = auth.status === "authenticated" && isHcns(auth.user);
  const user = auth.status === "authenticated" ? auth.user : null;
  // Da phap nhan: danh muc rieng tung cong ty - form chon cong ty khi dang xem nhieu cong ty.
  const ctTao = congTyMacDinh(user);
  const nhieuCt = hienCongTy(user);

  const [nhoms, setNhoms] = useState<NhomCcdc[]>([]);
  const [rows, setRows] = useState<VtRow[] | null>(null);
  const [tim, setTim] = useState("");
  const [nhomLoc, setNhomLoc] = useState("");
  const [chiThieuGia, setChiThieuGia] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [xoa, setXoa] = useState<VtRow | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const [capNhatLuc, setCapNhatLuc] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    setDangTai(true);
    try {
      const [v, n] = await Promise.all([api.get<{ rows: VtRow[] }>("/vt-tieu-hao"), api.get<{ rows: NhomCcdc[] }>("/nhom-ccdc")]);
      setRows(v.rows);
      setNhoms(n.rows.filter((x) => x.bat_tat));
      setCapNhatLuc(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace("T", " "));
    } catch (e) {
      setLoi(thongBaoLoi(e, t("Không tải được danh mục vật tư.")));
      setRows([]);
    } finally {
      setDangTai(false);
    }
  }, []);
  useEffect(() => {
    loadRows();
  }, [loadRows]);
  useKhiThayDoi(loadRows);

  const tu = tim.trim().toLowerCase();
  const hienThi = (rows ?? []).filter(
    (r) =>
      (!tu || r.id.toLowerCase().includes(tu) || r.ten_vt.toLowerCase().includes(tu)) &&
      (!nhomLoc || (nhomLoc === "none" ? r.nhom_id == null : String(r.nhom_id) === nhomLoc)) &&
      (!chiThieuGia || !r.don_gia_tham_khao),
  );
  const tVt = useTrangKhach(hienThi, [tu, nhomLoc, chiThieuGia]);
  const tk = useMemo(() => {
    const all = rows ?? [];
    return {
      tong: all.length,
      soNhom: new Set(all.map((r) => r.nhom_id).filter((x) => x != null)).size,
      chuaNhom: all.filter((r) => r.nhom_id == null).length,
      thieuGia: all.filter((r) => !r.don_gia_tham_khao).length,
      nhomLon: [...all.reduce((m, r) => (r.nhom_id != null ? m.set(r.nhom_id, { ten: r.ten_nhom ?? "", n: (m.get(r.nhom_id)?.n ?? 0) + 1 }) : m), new Map<number, { ten: string; n: number }>())]
        .sort((a, b) => b[1].n - a[1].n)[0],
    };
  }, [rows]);

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm(ctTao.macDinh));
    setError(null);
    setShowForm(true);
  }
  function openEdit(row: VtRow) {
    setEditingId(row.id);
    setForm({
      id: row.id,
      ten_vt: row.ten_vt,
      nhom_id: row.nhom_id != null ? String(row.nhom_id) : "",
      don_vi_tinh: row.don_vi_tinh ?? "",
      don_gia_tham_khao: row.don_gia_tham_khao != null ? String(row.don_gia_tham_khao) : "",
      cong_ty_id: row.cong_ty_id,
    });
    setError(null);
    setShowForm(true);
  }

  async function submitForm() {
    if (!form.ten_vt.trim() || (!editingId && !form.id.trim())) {
      setError(t("Vui lòng nhập đủ mã và tên vật tư."));
      return;
    }
    setSaving(true);
    setError(null);
    const body = {
      id: form.id.trim(),
      ten_vt: form.ten_vt.trim(),
      nhom_id: form.nhom_id === "" ? null : Number(form.nhom_id),
      don_vi_tinh: form.don_vi_tinh.trim() || null,
      don_gia_tham_khao: form.don_gia_tham_khao ? Number(form.don_gia_tham_khao) : null,
      cong_ty_id: form.cong_ty_id,
    };
    try {
      if (editingId) await api.put(`/vt-tieu-hao/${encodeURIComponent(editingId)}`, body);
      else await api.post("/vt-tieu-hao", body);
      setShowForm(false);
      setMsg(editingId ? t("Đã cập nhật {ten_vt}.", { ten_vt: body.ten_vt }) : t("Đã thêm {ten_vt}.", { ten_vt: body.ten_vt }));
      baoThayDoi();
    } catch (e) {
      setError(thongBaoLoi(e, t("Không lưu được - vui lòng thử lại.")));
    } finally {
      setSaving(false);
    }
  }

  async function voHieu(row: VtRow) {
    setXoa(null);
    try {
      await api.delete(`/vt-tieu-hao/${encodeURIComponent(row.id)}`);
      setMsg(t("Đã vô hiệu hoá {ten_vt}.", { ten_vt: row.ten_vt }));
      baoThayDoi();
    } catch (e) {
      setLoi(thongBaoLoi(e));
    }
  }

  return (
    <div className="dashboard-container">
      <PageHeader
        title={t("Danh mục vật tư tiêu hao")}
        filters={tabs}
        actions={
          canEdit && (
            <button className="btn btn-primary" onClick={openAdd}>
              <Plus size={15} /> {t("Thêm vật tư")}
            </button>
          )
        }
        capNhatLuc={capNhatLuc}
        onRefresh={loadRows}
        dangTai={dangTai}
      />

      <div className="kpi-grid kpi-grid-4">
        <KpiCard
          tone="cyan"
          icon={<Package size={20} className="text-white" />}
          watermark={<Package size={52} />}
          label={t("Vật tư đang dùng")}
          value={fmtSo(tk.tong)}
          trend={<div className="kpi-trend"><span className="trend-sub">{t("Đang hoạt động trong danh mục")}</span></div>}
          onClick={() => (setNhomLoc(""), setChiThieuGia(false))}
        />
        <KpiCard
          tone="purple"
          icon={<FolderTree size={20} className="text-white" />}
          watermark={<FolderTree size={52} />}
          label={t("Nhóm vật tư")}
          value={fmtSo(tk.soNhom)}
          trend={<div className="kpi-trend"><span className="trend-sub">{fmtSo(tk.chuaNhom)} {t("vật tư chưa phân nhóm")}</span></div>}
          onClick={() => setNhomLoc("none")}
        />
        <KpiCard
          tone={tk.thieuGia ? "yellow" : "blue-light"}
          icon={<Tag size={20} className="text-white" />}
          watermark={<Tag size={52} />}
          label={t("Chưa có giá tham khảo")}
          value={fmtSo(tk.thieuGia)}
          tangLaXau
          trend={<div className={`kpi-trend ${tk.thieuGia ? "trend-warning" : "trend-up"}`}><span className="trend-sub">{t("Cần để tính giá trị tồn / cảnh báo đơn giá")}</span></div>}
          onClick={() => setChiThieuGia(true)}
        />
        <KpiCard
          tone="blue"
          icon={<FolderTree size={20} className="text-white" />}
          watermark={<FolderTree size={52} />}
          label={t("Nhóm nhiều vật tư nhất")}
          value={fmtSo(tk.nhomLon?.[1].n ?? 0)}
          trend={<div className="kpi-trend"><span className="trend-sub">{tk.nhomLon?.[1].ten ?? t("Chưa có nhóm")}</span></div>}
          onClick={tk.nhomLon ? () => setNhomLoc(String(tk.nhomLon![0])) : undefined}
        />
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}
      {loi && <div className="alert alert-error">{loi}</div>}

      <div className="content-card task-card-full">
        <div className="filter-bar">
          <div className="topbar-search filter-search">
            <Search size={15} className="search-icon" />
            <input className="search-input" placeholder={t("Tìm mã, tên vật tư...")} value={tim} onChange={(e) => setTim(e.target.value)} />
          </div>
          <label className="header-dropdown select-dropdown">
            <select value={nhomLoc} onChange={(e) => setNhomLoc(e.target.value)} aria-label={t("Nhóm")}>
              <option value="">{t("Tất cả nhóm")}</option>
              <option value="none">{t("Chưa phân nhóm")}</option>
              {nhoms.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.ten_nhom}
                </option>
              ))}
            </select>
            <ChevronDown size={13} className="dropdown-arrow" />
          </label>
          <label className="check-label">
            <input type="checkbox" checked={chiThieuGia} onChange={(e) => setChiThieuGia(e.target.checked)} />
            {t("Chỉ vật tư chưa có giá")}
          </label>
          <span className="muted small">
            {fmtSo(hienThi.length)}/{fmtSo(tk.tong)} {t("vật tư")}
          </span>
        </div>
        <div className="task-table-wrapper">
          <table className="task-table">
            <thead>
              <tr>
                <th style={{ width: "15%" }}>{t("Mã")}</th>
                <th>{t("Tên vật tư")}</th>
                <th style={{ width: "18%" }}>{t("Nhóm")}</th>
                <th style={{ width: "10%" }}>{t("ĐVT")}</th>
                <th style={{ width: "13%", textAlign: "right" }}>{t("Giá tham khảo")}</th>
                <th style={{ width: "16%", textAlign: "right" }}>{t("Thao tác")}</th>
              </tr>
            </thead>
            <tbody>
              {rows === null && (
                <tr>
                  <td colSpan={6} className="task-empty">
                    {t("Đang tải…")}
                  </td>
                </tr>
              )}
              {rows !== null && hienThi.length === 0 && (
                <tr>
                  <td colSpan={6} className="task-empty">
                    {t("Không có vật tư khớp bộ lọc.")}
                  </td>
                </tr>
              )}
              {tVt.dongTrang.map((r) => (
                <tr key={r.id}>
                  <td data-label={t("Mã")}>{r.id}</td>
                  <td data-label={t("Tên vật tư")} className="strong">
                    {r.ten_vt}
                    {nhieuCt && <span className="muted small"> · {maCongTy(user, r.cong_ty_id)}</span>}
                  </td>
                  <td data-label={t("Nhóm")} className="text-secondary">
                    {r.ten_nhom ?? "-"}
                  </td>
                  <td data-label={t("ĐVT")}>{r.don_vi_tinh ?? "-"}</td>
                  <td data-label={t("Giá tham khảo")} style={{ textAlign: "right" }}>
                    {r.don_gia_tham_khao != null ? fmtSo(r.don_gia_tham_khao) : <span className="text-orange">{t("Chưa có")}</span>}
                  </td>
                  <td data-label={t("Thao tác")} style={{ textAlign: "right" }}>
                    <div className="row-actions">
                      <button className="btn btn-outline btn-sm" onClick={() => navigate("cap-phat", { tab: "ton-kho", q: r.id })}>
                        {t("Tồn")}
                      </button>
                      {canEdit && (
                        <>
                          <button className="btn btn-outline btn-sm btn-icon" title={t("Sửa")} aria-label={t("Sửa")} onClick={() => openEdit(r)}>
                            <Edit size={12} />
                          </button>
                          <button className="btn btn-outline btn-sm btn-icon danger-outline" title={t("Vô hiệu hoá")} aria-label={t("Vô hiệu hoá")} onClick={() => setXoa(r)}>
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PhanTrang trang={tVt.trang} tong={tVt.tong} onDoi={tVt.setTrang} donVi={t("vật tư")} />
      </div>

      {showForm && (
        <Modal title={editingId ? t("Sửa vật tư {editingId}", { editingId }) : t("Thêm vật tư")} onClose={() => setShowForm(false)}>
          <div className="form-grid">
            {!editingId && ctTao.canChon && (
              <TruongCongTy value={form.cong_ty_id} ds={ctTao.ds} onChange={(id) => setForm({ ...form, cong_ty_id: id, nhom_id: "" })} />
            )}
            <div className="field-group">
              <label className="field-label">{t("Mã vật tư *")}</label>
              <input type="text" value={form.id} disabled={!!editingId} onChange={(e) => setForm({ ...form, id: e.target.value })} />
            </div>
            <div className="field-group">
              <label className="field-label">{t("Tên vật tư *")}</label>
              <input type="text" value={form.ten_vt} onChange={(e) => setForm({ ...form, ten_vt: e.target.value })} />
            </div>
            <div className="field-group">
              <label className="field-label">{t("Nhóm")}</label>
              <select value={form.nhom_id} onChange={(e) => setForm({ ...form, nhom_id: e.target.value })}>
                <option value="">{t("-- Không thuộc nhóm --")}</option>
                {nhoms
                  .filter((n) => n.cong_ty_id === form.cong_ty_id)
                  .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.ten_nhom}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">{t("Đơn vị tính")}</label>
              <input type="text" value={form.don_vi_tinh} onChange={(e) => setForm({ ...form, don_vi_tinh: e.target.value })} />
            </div>
            <div className="field-group">
              <label className="field-label">{t("Giá tham khảo (đ)")}</label>
              <input type="number" min={0} value={form.don_gia_tham_khao} onChange={(e) => setForm({ ...form, don_gia_tham_khao: e.target.value })} />
            </div>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="modal-actions">
            <button className="btn" onClick={() => setShowForm(false)}>
              {t("Huỷ")}
            </button>
            <button className="btn btn-primary" disabled={saving} onClick={submitForm}>
              {saving ? t("Đang lưu...") : t("Lưu")}
            </button>
          </div>
        </Modal>
      )}

      {xoa && (
        <Modal title={t("Vô hiệu hoá vật tư")} onClose={() => setXoa(null)}>
          <p>
            {t("Vô hiệu hoá")} <b>{xoa.ten_vt}</b> ({xoa.id}{t(")? Vật tư ẩn khỏi danh mục và không lập phiếu mới được; lịch sử phiếu vẫn giữ.")}
          </p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setXoa(null)}>
              {t("Huỷ")}
            </button>
            <button className="btn btn-danger" onClick={() => voHieu(xoa)}>
              {t("Vô hiệu hoá")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
