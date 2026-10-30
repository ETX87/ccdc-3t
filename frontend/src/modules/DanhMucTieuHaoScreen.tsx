import { t, tS } from "../lib/i18n";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArchiveRestore, ChevronDown, Edit, FileSpreadsheet, FolderPlus, FolderTree, Package, Plus, Search, Tag, Trash2 } from "lucide-react";
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
import { ChonLoc } from "../components/ChonLoc";
import { QuanLyNhomModal } from "../components/QuanLyNhomModal";
import { useChiTiet } from "../components/ChiTiet";
import { lopDongTon, MucTonBadge, NhapTonToiThieuExcel, type MucTon } from "../components/TonToiThieu";

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
  // Ton toi thieu (migration 0021) + ton tong cong ty / danh gia (server tinh, ?kem_ton=1).
  ton_toi_thieu: number | null;
  thoi_gian_dat_hang: string | null;
  ton: number;
  muc: MucTon;
  danh_gia: string;
  de_xuat: string;
  thieu: number;
}

function emptyForm(congTyId: number | null = null) {
  return { id: "", ten_vt: "", nhom_id: "", don_vi_tinh: "", don_gia_tham_khao: "", cong_ty_id: congTyId, ton_toi_thieu: "", thoi_gian_dat_hang: "" };
}

// Danh muc vat tu tieu hao (ton tinh dong o tab Ton kho, khong luu san). HCNS / Admin them - sua - tat.
export function DanhMucTieuHaoScreen({ tabs }: { tabs?: ReactNode }) {
  const auth = useAuth();
  const { navigate } = useNav();
  const { moVatTu } = useChiTiet();
  const canEdit = auth.status === "authenticated" && isHcns(auth.user);
  const user = auth.status === "authenticated" ? auth.user : null;
  // Da phap nhan: danh muc rieng tung cong ty - form chon cong ty khi dang xem nhieu cong ty.
  const ctTao = congTyMacDinh(user);
  const nhieuCt = hienCongTy(user);

  const [nhoms, setNhoms] = useState<NhomCcdc[]>([]);
  // Moi nhom (ca nhom da tat) cho popup Quan ly nhom - nhom dung chung voi TSCD.
  const [nhomAll, setNhomAll] = useState<NhomCcdc[]>([]);
  const [showNhom, setShowNhom] = useState(false);
  const [rows, setRows] = useState<VtRow[] | null>(null);
  const [tim, setTim] = useState("");
  const [nhomLoc, setNhomLoc] = useState("");
  const [chiThieuGia, setChiThieuGia] = useState(false);
  // Loc ton toi thieu: "" tat ca | "can" het/duoi/sap | "co" da cai | "chua" chua cai.
  const [locMin, setLocMin] = useState("");
  const [showNhapMin, setShowNhapMin] = useState(false);
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
      const [v, n] = await Promise.all([api.get<{ rows: VtRow[] }>("/vt-tieu-hao?kem_ton=1"), api.get<{ rows: NhomCcdc[] }>("/nhom-ccdc")]);
      setRows(v.rows);
      setNhoms(n.rows.filter((x) => x.bat_tat));
      setNhomAll(n.rows);
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
      (!chiThieuGia || !r.don_gia_tham_khao) &&
      (!locMin || (locMin === "can" ? r.muc === "het" || r.muc === "duoi" || r.muc === "sap" : locMin === "co" ? r.muc !== "khong" : r.muc === "khong")),
  );
  const tVt = useTrangKhach(hienThi, [tu, nhomLoc, chiThieuGia, locMin]);
  const tk = useMemo(() => {
    const all = rows ?? [];
    return {
      tong: all.length,
      soNhom: new Set(all.map((r) => r.nhom_id).filter((x) => x != null)).size,
      chuaNhom: all.filter((r) => r.nhom_id == null).length,
      thieuGia: all.filter((r) => !r.don_gia_tham_khao).length,
      duoiMin: all.filter((r) => r.muc === "het" || r.muc === "duoi").length,
      sapMin: all.filter((r) => r.muc === "sap").length,
      coMin: all.filter((r) => r.muc !== "khong").length,
    };
  }, [rows]);

  // Ma du kien cho vat tu moi (server cap ma that luc luu).
  const [maTiep, setMaTiep] = useState("");
  useEffect(() => {
    if (!showForm || editingId) return;
    setMaTiep("");
    api
      .get<{ ma: string }>(`/vt-tieu-hao/ma-tiep-theo?cong_ty_id=${form.cong_ty_id ?? ""}`)
      .then((r) => setMaTiep(r.ma))
      .catch(() => setMaTiep(t("Tự sinh khi lưu")));
  }, [showForm, editingId, form.cong_ty_id]);

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
      ton_toi_thieu: row.ton_toi_thieu != null ? String(row.ton_toi_thieu) : "",
      thoi_gian_dat_hang: row.thoi_gian_dat_hang ?? "",
    });
    setError(null);
    setShowForm(true);
  }

  async function submitForm() {
    if (!form.ten_vt.trim()) {
      setError(t("Vui lòng nhập tên vật tư."));
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
      ton_toi_thieu: form.ton_toi_thieu === "" ? null : Number(form.ton_toi_thieu),
      thoi_gian_dat_hang: form.thoi_gian_dat_hang.trim() || null,
    };
    try {
      // Them moi: server tu sinh ma vat tu (TS<ma cong ty>-000001...), tra ve ma that da cap.
      const r = editingId ? null : await api.post<{ id: string }>("/vt-tieu-hao", body);
      if (editingId) await api.put(`/vt-tieu-hao/${encodeURIComponent(editingId)}`, body);
      setShowForm(false);
      setMsg(editingId ? t("Đã cập nhật {ten_vt}.", { ten_vt: body.ten_vt }) : t("Đã thêm {ten_vt} - mã {ma}.", { ten_vt: body.ten_vt, ma: r?.id ?? "" }));
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
            <>
              <button className="btn btn-outline" onClick={() => setShowNhom(true)}>
                <FolderPlus size={14} /> {t("Quản lý nhóm")}
              </button>
              <button className="btn btn-outline" onClick={() => setShowNhapMin(true)}>
                <FileSpreadsheet size={14} /> {t("Nhập tồn tối thiểu")}
              </button>
              <button className="btn btn-primary" onClick={openAdd}>
                <Plus size={15} /> {t("Thêm vật tư")}
              </button>
            </>
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
          onClick={() => (setNhomLoc(""), setChiThieuGia(false), setLocMin(""))}
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
          tone={tk.duoiMin ? "red" : tk.sapMin ? "yellow" : "blue"}
          icon={<ArchiveRestore size={20} className="text-white" />}
          watermark={<ArchiveRestore size={52} />}
          label={t("Dưới tồn tối thiểu")}
          value={fmtSo(tk.duoiMin)}
          tangLaXau
          trend={
            <div className={`kpi-trend ${tk.duoiMin ? "trend-warning" : ""}`}>
              <span className="trend-sub">{t("{s} sắp chạm · {c} mặt hàng có cài", { s: fmtSo(tk.sapMin), c: fmtSo(tk.coMin) })}</span>
            </div>
          }
          onClick={() => setLocMin("can")}
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
            <ChonLoc value={nhomLoc} onChange={(e) => setNhomLoc(e.target.value)} aria-label={t("Nhóm")}>
              <option value="">{t("Tất cả nhóm")}</option>
              <option value="none">{t("Chưa phân nhóm")}</option>
              {nhoms.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.ten_nhom}
                </option>
              ))}
            </ChonLoc>
            <ChevronDown size={13} className="dropdown-arrow" />
          </label>
          <label className="header-dropdown select-dropdown">
            <ChonLoc value={locMin} onChange={(e) => setLocMin(e.target.value)} aria-label={t("Tồn tối thiểu")}>
              <option value="">{t("Tồn tối thiểu: tất cả")}</option>
              <option value="can">{t("Dưới / sắp chạm tối thiểu")}</option>
              <option value="co">{t("Đã cài tồn tối thiểu")}</option>
              <option value="chua">{t("Chưa cài tồn tối thiểu")}</option>
            </ChonLoc>
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
                <th style={{ width: "12%" }}>{t("Mã")}</th>
                <th>{t("Tên vật tư")}</th>
                <th style={{ width: "13%" }}>{t("Nhóm")}</th>
                <th style={{ width: "7%" }}>{t("ĐVT")}</th>
                <th style={{ width: "10%", textAlign: "right" }}>{t("Giá tham khảo")}</th>
                <th style={{ width: "11%", textAlign: "right" }}>{t("Tồn / Tối thiểu")}</th>
                <th style={{ width: "14%" }}>{t("Đánh giá")}</th>
                <th style={{ width: "12%", textAlign: "right" }}>{t("Thao tác")}</th>
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
              {rows !== null && hienThi.length === 0 && (
                <tr>
                  <td colSpan={8} className="task-empty">
                    {t("Không có vật tư khớp bộ lọc.")}
                  </td>
                </tr>
              )}
              {tVt.dongTrang.map((r) => (
                <tr key={r.id} className={lopDongTon(r.muc)}>
                  <td data-label={t("Mã")}>{r.id}</td>
                  <td data-label={t("Tên vật tư")} className="strong">
                    <button type="button" className="so-link" title={t("Xem tồn từng kho, lịch sử phiếu")} onClick={() => moVatTu(r.id)}>
                      {r.ten_vt}
                    </button>
                    {nhieuCt && <span className="muted small"> · {maCongTy(user, r.cong_ty_id)}</span>}
                  </td>
                  <td data-label={t("Nhóm")} className="text-secondary">
                    {r.ten_nhom ?? "-"}
                  </td>
                  <td data-label={t("ĐVT")}>{r.don_vi_tinh ?? "-"}</td>
                  <td data-label={t("Giá tham khảo")} style={{ textAlign: "right" }}>
                    {r.don_gia_tham_khao != null ? fmtSo(r.don_gia_tham_khao) : <span className="text-orange">{t("Chưa có")}</span>}
                  </td>
                  <td data-label={t("Tồn / Tối thiểu")} style={{ textAlign: "right" }}>
                    <button type="button" className="so-link" onClick={() => navigate("cap-phat", { tab: "ton-kho", q: r.id })}>
                      {fmtSo(r.ton, 2)}
                    </button>
                    {" / "}
                    {r.ton_toi_thieu != null ? fmtSo(r.ton_toi_thieu, 2) : <span className="muted">-</span>}
                  </td>
                  <td data-label={t("Đánh giá")}>
                    {r.muc === "khong" ? (
                      <span className="muted small">{t("Chưa cài")}</span>
                    ) : (
                      <>
                        <MucTonBadge muc={r.muc} danhGia={r.danh_gia} />
                        {r.muc !== "du" && (
                          <div className="muted small" title={r.thoi_gian_dat_hang ?? undefined}>
                            {tS(r.de_xuat)}
                            {r.thieu > 0 ? ` · ${t("thiếu {x}", { x: fmtSo(r.thieu, 2) })}` : ""}
                          </div>
                        )}
                      </>
                    )}
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
              <label className="field-label">{editingId ? t("Mã vật tư") : t("Mã vật tư (tự sinh)")}</label>
              <input type="text" value={editingId ? form.id : maTiep} disabled readOnly />
              {!editingId && <div className="field-hint">{t("Hệ thống tự cấp mã khi lưu (theo công ty, tăng dần).")}</div>}
            </div>
            <div className="field-group">
              <label className="field-label">{t("Tên vật tư *")}</label>
              <input type="text" value={form.ten_vt} onChange={(e) => setForm({ ...form, ten_vt: e.target.value })} />
            </div>
            <div className="field-group">
              <label className="field-label">{t("Nhóm")}</label>
              <ChonLoc value={form.nhom_id} onChange={(e) => setForm({ ...form, nhom_id: e.target.value })}>
                <option value="">{t("-- Không thuộc nhóm --")}</option>
                {nhoms
                  .filter((n) => n.cong_ty_id === form.cong_ty_id)
                  .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.ten_nhom}
                  </option>
                ))}
              </ChonLoc>
            </div>
            <div className="field-group">
              <label className="field-label">{t("Đơn vị tính")}</label>
              <input type="text" value={form.don_vi_tinh} onChange={(e) => setForm({ ...form, don_vi_tinh: e.target.value })} />
            </div>
            <div className="field-group">
              <label className="field-label">{t("Giá tham khảo (đ)")}</label>
              <input type="number" min={0} value={form.don_gia_tham_khao} onChange={(e) => setForm({ ...form, don_gia_tham_khao: e.target.value })} />
            </div>
            <div className="field-group">
              <label className="field-label">{t("Tồn kho tối thiểu")}</label>
              <input type="number" min={0} value={form.ton_toi_thieu} placeholder={t("Bỏ trống / 0 = không quy định")} onChange={(e) => setForm({ ...form, ton_toi_thieu: e.target.value })} />
              <div className="field-hint">{t("So với tổng tồn các kho của công ty. Thấp hơn → cảnh báo + báo cáo email.")}</div>
            </div>
            <div className="field-group">
              <label className="field-label">{t("Thời gian đặt hàng / ghi chú")}</label>
              <input type="text" maxLength={200} value={form.thoi_gian_dat_hang} placeholder={t("vd: Thời gian đặt hàng 1-2 tuần")} onChange={(e) => setForm({ ...form, thoi_gian_dat_hang: e.target.value })} />
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
      {showNhapMin && (
        <NhapTonToiThieuExcel vts={rows ?? []} ctTao={ctTao} onClose={() => setShowNhapMin(false)} onXong={(m) => (setShowNhapMin(false), setMsg(m))} />
      )}
      {showNhom && (
        <QuanLyNhomModal
          title={t("Quản lý nhóm vật tư")}
          nhoms={nhomAll}
          ctTao={ctTao}
          nhieuCt={nhieuCt}
          maCt={(id) => maCongTy(user, id)}
          onClose={() => setShowNhom(false)}
          onDoi={loadRows}
        />
      )}
    </div>
  );
}
