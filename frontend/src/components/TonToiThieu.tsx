import { t, tS } from "../lib/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Edit, FileSpreadsheet, Plus, Trash2, Upload } from "lucide-react";
import { api } from "../api/client";
import { Modal } from "./Modal";
import { StatusBadge } from "./StatusBadge";
import { ChonLoc } from "./ChonLoc";
import { TruongCongTy } from "./ChonCongTy";
import { PhanTrang, useTrangKhach } from "./PhanTrang";
import { fmtSo } from "../lib/format";
import { thongBaoLoi } from "../lib/nhan";
import { baoThayDoi } from "../lib/suKien";

// Ton kho toi thieu (migration 0021): danh gia (badge), nhap hang loat tu Excel cho vat tu tieu hao, cai dat theo dong
// hang TSCD. Ton so voi TONG ton cong ty - server tinh (lib/tonToiThieu.ts), client chi hien.

export type MucTon = "het" | "duoi" | "sap" | "du" | "khong";
const TONE: Record<MucTon, "danger" | "warning" | "success" | "neutral"> = { het: "danger", duoi: "danger", sap: "warning", du: "success", khong: "neutral" };

/** Badge danh gia ton (nhan do server gui - "Duoi muc toi thieu"...). */
export function MucTonBadge({ muc, danhGia }: { muc: MucTon; danhGia: string }) {
  return <StatusBadge label={tS(danhGia)} tone={TONE[muc]} />;
}

/** Dong can xu ly (het / duoi / sap) -> class to mau dong bang. */
export const lopDongTon = (muc: MucTon | undefined) => (muc === "het" || muc === "duoi" ? "row-canh-bao" : muc === "sap" ? "row-chu-y" : "");

const chuan = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/gi, "d")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();

interface VtGon {
  id: string;
  ten_vt: string;
  don_vi_tinh: string | null;
  cong_ty_id: number;
}
interface DongFile {
  dong: number;
  ten: string;
  dvt: string;
  ton_toi_thieu: unknown;
  ghi_chu: string;
}
interface KetQuaDong {
  dong: number;
  ten: string;
  dvt: string | null;
  ton_toi_thieu: number | null;
  ghi_chu: string | null;
  ket_qua: "khop" | "nhieu" | "khong_thay" | "loi_so";
  vt_id: string | null;
  ten_vt: string | null;
  don_vi_tinh: string | null;
  cu: { ton_toi_thieu: number | null; thoi_gian_dat_hang: string | null } | null;
  goi_y: { id: string; ten_vt: string; don_vi_tinh: string | null }[];
}

/**
 * Nhap ton toi thieu tu Excel (mau "TON KHO TOI THIEU.xlsx": cot ten CCDC / DVT / Ton kho toi thieu / Ghi chu). Tu do dong
 * tieu de (dong co chu "toi thieu"), chon sheet + cong ty, server khop ten -> xem truoc; dong chua khop chon tay vat tu.
 */
export function NhapTonToiThieuExcel({
  vts,
  ctTao,
  onClose,
  onXong,
}: {
  vts: VtGon[];
  ctTao: { canChon: boolean; macDinh: number | null; ds: { id: number; ma: string; ten: string }[] };
  onClose: () => void;
  onXong: (msg: string) => void;
}) {
  const chon = useRef<HTMLInputElement>(null);
  const [tenFile, setTenFile] = useState("");
  const [sheets, setSheets] = useState<{ ten: string; dong: DongFile[] }[]>([]);
  const [sheet, setSheet] = useState(0);
  const [congTy, setCongTy] = useState<number | null>(ctTao.macDinh);
  const [chonTay, setChonTay] = useState<Record<number, string>>({});
  const [xem, setXem] = useState<{ dong: KetQuaDong[]; so_khop: number; trung: number[] } | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangXuLy, setDangXuLy] = useState(false);

  async function docFile(f: File | undefined) {
    if (!f) return;
    setLoi(null);
    setXem(null);
    setChonTay({});
    setTenFile(f.name);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer());
      const ds = wb.SheetNames.map((ten) => {
        const ws = wb.Sheets[ten];
        const bang = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: true });
        // Mang bat dau tu dong dau cua vung du lieu (!ref), khong phai dong 1 -> cong lai de so dong khop Excel.
        const dongDau = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]).s.r : 0;
        const iTd = bang.findIndex((r) => r.some((o) => chuan(o).includes("toi thieu")));
        if (iTd < 0) return { ten, dong: [] };
        const td = bang[iTd].map(chuan);
        const cot = (dk: (s: string) => boolean) => td.findIndex(dk);
        const cMin = cot((s) => s.includes("toi thieu"));
        const cTen = cot((s) => s.includes("ccdc") || s.startsWith("ten") || s.includes("vat tu") || s.includes("mat hang"));
        const cDvt = cot((s) => s === "dvt" || s.includes("don vi"));
        const cGhiChu = cot((s) => s.includes("ghi chu") || s.includes("thoi gian"));
        if (cTen < 0) return { ten, dong: [] };
        const dong = bang
          .slice(iTd + 1)
          .map((r, i) => ({
            dong: dongDau + iTd + i + 2,
            ten: String(r[cTen] ?? "").trim(),
            dvt: cDvt >= 0 ? String(r[cDvt] ?? "").trim() : "",
            ton_toi_thieu: typeof r[cMin] === "string" ? (r[cMin] as string).trim() : r[cMin],
            ghi_chu: cGhiChu >= 0 ? String(r[cGhiChu] ?? "").trim() : "",
          }))
          .filter((d) => d.ten);
        return { ten, dong };
      }).filter((s) => s.dong.length);
      if (!ds.length) return setLoi(t("Không thấy bảng có cột \"Tồn kho tối thiểu\" và cột tên mặt hàng trong file."));
      setSheets(ds);
      // Sheet trung ten / ma cong ty -> chon san cong ty do.
      const ct = ctTao.ds.find((c) => chuan(c.ma) === chuan(ds[0].ten) || chuan(c.ten) === chuan(ds[0].ten));
      if (ct) setCongTy(ct.id);
      setSheet(0);
      await gui(ds[0].dong, ct?.id ?? congTy, {}, false);
    } catch (e) {
      setLoi(thongBaoLoi(e, t("Không đọc được file Excel.")));
    }
  }

  async function gui(dong: DongFile[], ctId: number | null, tay: Record<number, string>, thucHien: boolean) {
    if (!ctId) return setLoi(t("Vui lòng chọn công ty."));
    setDangXuLy(true);
    setLoi(null);
    try {
      const r = await api.post<{ dong: KetQuaDong[]; so_khop: number; trung: number[] }>("/vt-tieu-hao/ton-toi-thieu/import", {
        cong_ty_id: ctId,
        thuc_hien: thucHien,
        dong: dong.map((d) => ({ ...d, vt_id: tay[d.dong] || undefined })),
      });
      if (thucHien) {
        baoThayDoi();
        onXong(t("Đã cập nhật tồn tối thiểu {n} mặt hàng từ file {file}.", { n: r.so_khop, file: tenFile }));
        return;
      }
      setXem(r);
    } catch (e) {
      setLoi(thongBaoLoi(e));
    } finally {
      setDangXuLy(false);
    }
  }

  const dongSheet = sheets[sheet]?.dong ?? [];
  const doiSheet = (i: number) => {
    setSheet(i);
    setChonTay({});
    gui(sheets[i].dong, congTy, {}, false);
  };
  const doiCongTy = (id: number) => {
    setCongTy(id);
    setChonTay({});
    if (dongSheet.length) gui(dongSheet, id, {}, false);
  };
  const chonVt = (dong: number, vtId: string) => {
    const tay = { ...chonTay, [dong]: vtId };
    if (!vtId) delete tay[dong];
    setChonTay(tay);
    gui(dongSheet, congTy, tay, false);
  };
  const vtCt = vts.filter((v) => v.cong_ty_id === congTy);
  const chuaKhop = xem?.dong.filter((d) => d.ket_qua !== "khop").length ?? 0;

  return (
    <Modal size="lg" title={t("Nhập tồn tối thiểu từ Excel")} onClose={onClose}>
      <div className="field-hint" style={{ marginBottom: 10 }}>
        {t("File có cột tên mặt hàng (vd \"Theo CCDC\"), ĐVT, \"Tồn kho tối thiểu\" và Ghi chú (thời gian đặt hàng). Hệ thống khớp theo tên trong danh mục công ty; dòng chưa khớp chọn tay hoặc bỏ qua. Tồn tối thiểu 0 = không quy định.")}
      </div>
      <div className="row-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap", marginBottom: 12, gap: 10 }}>
        <button type="button" className="btn btn-outline" disabled={dangXuLy} onClick={() => chon.current?.click()}>
          <Upload size={14} /> {t("Chọn file Excel")}
        </button>
        {tenFile && (
          <span className="muted small" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <FileSpreadsheet size={14} /> {tenFile}
          </span>
        )}
        <input ref={chon} type="file" accept=".xlsx,.xls" hidden onChange={(e) => (docFile(e.target.files?.[0]), (e.target.value = ""))} />
      </div>
      {sheets.length > 0 && (
        <div className="form-grid" style={{ marginBottom: 10 }}>
          {sheets.length > 1 && (
            <div className="field-group">
              <label className="field-label">{t("Sheet")}</label>
              <ChonLoc value={String(sheet)} onChange={(e) => doiSheet(Number(e.target.value))}>
                {sheets.map((s, i) => (
                  <option key={s.ten} value={i}>
                    {s.ten} ({s.dong.length})
                  </option>
                ))}
              </ChonLoc>
            </div>
          )}
          {ctTao.canChon && <TruongCongTy value={congTy} ds={ctTao.ds} onChange={doiCongTy} />}
        </div>
      )}
      {loi && <div className="alert alert-error">{loi}</div>}
      {dangXuLy && <div className="muted small">{t("Đang kiểm tra...")}</div>}
      {xem && (
        <>
          <div className={`alert ${chuaKhop ? "alert-warning" : "alert-success"}`}>
            {t("{n}/{tong} dòng đã khớp vật tư. Dòng chưa khớp sẽ bị bỏ qua nếu không chọn tay.", { n: xem.so_khop, tong: xem.dong.length })}
            {xem.trung.length > 0 && ` ${t("Dòng {ds} trùng vật tư với dòng trên - dòng sau ghi đè.", { ds: xem.trung.join(", ") })}`}
          </div>
          <div className="task-table-wrapper" style={{ maxHeight: 400, overflow: "auto" }}>
            <table className="task-table">
              <thead>
                <tr>
                  <th>{t("Dòng")}</th>
                  <th>{t("Tên trong file")}</th>
                  <th style={{ textAlign: "right" }}>{t("Tối thiểu")}</th>
                  <th>{t("Vật tư trong danh mục")}</th>
                  <th>{t("Ghi chú")}</th>
                </tr>
              </thead>
              <tbody>
                {xem.dong.map((d) => (
                  <tr key={d.dong} className={d.ket_qua === "khop" ? "" : "row-chu-y"}>
                    <td data-label={t("Dòng")}>{d.dong}</td>
                    <td data-label={t("Tên trong file")}>
                      {d.ten}
                      {d.dvt && <span className="muted small"> · {d.dvt}</span>}
                    </td>
                    <td data-label={t("Tối thiểu")} style={{ textAlign: "right" }}>
                      {d.ket_qua === "loi_so" ? <span className="text-red">{t("Sai số")}</span> : d.ton_toi_thieu != null ? fmtSo(d.ton_toi_thieu) : <span className="muted">{t("Không quy định")}</span>}
                      {d.cu?.ton_toi_thieu != null && d.cu.ton_toi_thieu !== d.ton_toi_thieu && <div className="muted small">{t("cũ: {x}", { x: fmtSo(d.cu.ton_toi_thieu) })}</div>}
                    </td>
                    <td data-label={t("Vật tư trong danh mục")}>
                      {d.ket_qua === "khop" && !chonTay[d.dong] ? (
                        <>
                          <b>{d.ten_vt}</b> <span className="muted small">· {d.vt_id}</span>
                        </>
                      ) : (
                        <ChonLoc value={chonTay[d.dong] ?? ""} onChange={(e) => chonVt(d.dong, e.target.value)}>
                          <option value="">{d.ket_qua === "nhieu" ? t("-- Nhiều vật tư trùng tên: chọn 1 --") : t("-- Không thấy: chọn tay / bỏ qua --")}</option>
                          {[...d.goi_y, ...vtCt.filter((v) => !d.goi_y.some((g) => g.id === v.id))].map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.ten_vt}
                              {v.don_vi_tinh ? ` (${v.don_vi_tinh})` : ""} · {v.id}
                            </option>
                          ))}
                        </ChonLoc>
                      )}
                    </td>
                    <td data-label={t("Ghi chú")} className="muted small">
                      {d.ghi_chu ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          {t("Huỷ")}
        </button>
        <button className="btn btn-primary" disabled={dangXuLy || !xem?.so_khop} onClick={() => gui(dongSheet, congTy, chonTay, true)}>
          {t("Cập nhật {n} mặt hàng", { n: xem?.so_khop ?? 0 })}
        </button>
      </div>
    </Modal>
  );
}

// ---------------- TSCD: ton toi thieu theo dong hang (ten tai san) ----------------
interface DongTs {
  id: number;
  cong_ty_id: number;
  ten_ts: string;
  ton_toi_thieu: number;
  thoi_gian_dat_hang: string | null;
  ton: number;
  tong_ts: number;
  muc: MucTon;
  danh_gia: string;
  de_xuat: string;
  thieu: number;
  nguoi_cap_nhat: string | null;
}
interface GoiYTs {
  cong_ty_id: number;
  ten_ts: string;
  tong: number;
  ton: number;
}

export function TonToiThieuTsModal({
  canEdit,
  ctTao,
  maCt,
  onClose,
  onXemTs,
}: {
  canEdit: boolean;
  ctTao: { canChon: boolean; macDinh: number | null; ds: { id: number; ma: string; ten: string }[] };
  maCt: (id: number) => string;
  onClose: () => void;
  /** Mo danh sach tai san cua dong hang (loc theo ten). */
  onXemTs: (ten: string) => void;
}) {
  const [data, setData] = useState<{ rows: DongTs[]; goi_y: GoiYTs[] } | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [form, setForm] = useState<{ cong_ty_id: number | null; ten_ts: string; ton_toi_thieu: string; thoi_gian_dat_hang: string } | null>(null);
  const [xoa, setXoa] = useState<DongTs | null>(null);
  const [busy, setBusy] = useState(false);
  const [tim, setTim] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api.get<{ rows: DongTs[]; goi_y: GoiYTs[] }>("/ccdc/ton-toi-thieu"));
    } catch (e) {
      setLoi(thongBaoLoi(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const hienThi = useMemo(() => {
    const k = chuan(tim);
    return (data?.rows ?? []).filter((r) => !k || chuan(r.ten_ts).includes(k));
  }, [data, tim]);
  const trang = useTrangKhach(hienThi, [tim]);
  const dem = (f: (r: DongTs) => boolean) => (data?.rows ?? []).filter(f).length;

  async function luu() {
    if (!form) return;
    const sl = Number(form.ton_toi_thieu);
    if (!form.ten_ts.trim() || !Number.isInteger(sl) || sl < 0) return setLoi(t("Chọn tên tài sản và nhập tồn tối thiểu là số nguyên không âm."));
    setBusy(true);
    setLoi(null);
    try {
      await api.put("/ccdc/ton-toi-thieu", { ...form, ton_toi_thieu: sl });
      setForm(null);
      baoThayDoi();
      await load();
    } catch (e) {
      setLoi(thongBaoLoi(e));
    } finally {
      setBusy(false);
    }
  }
  async function xoaDong(r: DongTs) {
    setXoa(null);
    try {
      await api.delete(`/ccdc/ton-toi-thieu/${r.id}`);
      baoThayDoi();
      await load();
    } catch (e) {
      setLoi(thongBaoLoi(e));
    }
  }

  const goiY = (data?.goi_y ?? []).filter((g) => g.cong_ty_id === form?.cong_ty_id);
  return (
    <Modal size="lg" title={t("Tồn tối thiểu tài sản cố định")} onClose={onClose}>
      <div className="field-hint" style={{ marginBottom: 10 }}>
        {t("Cài theo dòng hàng (các tài sản cùng tên). Tồn = số tài sản đang \"Trong kho\", không hỏng, ở các kho của công ty. Dưới mức → cảnh báo + báo cáo email.")}
      </div>
      <div className="filter-bar">
        <input className="search-input" style={{ maxWidth: 280 }} placeholder={t("Tìm tên tài sản...")} value={tim} onChange={(e) => setTim(e.target.value)} />
        <span className="muted small">
          {t("{n} dòng hàng · {d} dưới mức · {s} sắp chạm", { n: fmtSo(data?.rows.length ?? 0), d: fmtSo(dem((r) => r.muc === "het" || r.muc === "duoi")), s: fmtSo(dem((r) => r.muc === "sap")) })}
        </span>
        {canEdit && (
          <button className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }} onClick={() => setForm({ cong_ty_id: ctTao.macDinh, ten_ts: "", ton_toi_thieu: "", thoi_gian_dat_hang: "" })}>
            <Plus size={13} /> {t("Thêm dòng hàng")}
          </button>
        )}
      </div>
      {loi && <div className="alert alert-error">{loi}</div>}
      <div className="task-table-wrapper" style={{ maxHeight: 420, overflow: "auto" }}>
        <table className="task-table">
          <thead>
            <tr>
              <th>{t("Tên tài sản")}</th>
              <th style={{ textAlign: "right" }}>{t("Trong kho / Tối thiểu")}</th>
              <th>{t("Đánh giá")}</th>
              <th>{t("Đề xuất xử lý")}</th>
              {canEdit && <th style={{ textAlign: "right" }}>{t("Thao tác")}</th>}
            </tr>
          </thead>
          <tbody>
            {data === null && (
              <tr>
                <td colSpan={5} className="task-empty">
                  {t("Đang tải…")}
                </td>
              </tr>
            )}
            {data && hienThi.length === 0 && (
              <tr>
                <td colSpan={5} className="task-empty">
                  {t("Chưa cài tồn tối thiểu cho dòng hàng nào.")}
                </td>
              </tr>
            )}
            {trang.dongTrang.map((r) => (
              <tr key={r.id} className={lopDongTon(r.muc)}>
                <td data-label={t("Tên tài sản")}>
                  <button type="button" className="so-link" onClick={() => onXemTs(r.ten_ts)}>
                    {r.ten_ts}
                  </button>
                  <div className="muted small">
                    {ctTao.ds.length > 1 ? `${maCt(r.cong_ty_id)} · ` : ""}
                    {t("{n} tài sản đang quản lý", { n: fmtSo(r.tong_ts) })}
                  </div>
                </td>
                <td data-label={t("Trong kho / Tối thiểu")} style={{ textAlign: "right" }}>
                  <b>{fmtSo(r.ton)}</b> / {fmtSo(r.ton_toi_thieu)}
                </td>
                <td data-label={t("Đánh giá")}>
                  <MucTonBadge muc={r.muc} danhGia={r.danh_gia} />
                </td>
                <td data-label={t("Đề xuất xử lý")}>
                  {tS(r.de_xuat)}
                  {r.thieu > 0 && <b> ({t("thiếu {x}", { x: fmtSo(r.thieu) })})</b>}
                  {r.thoi_gian_dat_hang && <div className="muted small">{r.thoi_gian_dat_hang}</div>}
                </td>
                {canEdit && (
                  <td data-label={t("Thao tác")} style={{ textAlign: "right" }}>
                    <div className="row-actions">
                      <button
                        className="btn btn-outline btn-sm btn-icon"
                        title={t("Sửa")}
                        aria-label={t("Sửa")}
                        onClick={() => setForm({ cong_ty_id: r.cong_ty_id, ten_ts: r.ten_ts, ton_toi_thieu: String(r.ton_toi_thieu), thoi_gian_dat_hang: r.thoi_gian_dat_hang ?? "" })}
                      >
                        <Edit size={12} />
                      </button>
                      <button className="btn btn-outline btn-sm btn-icon danger-outline" title={t("Xoá")} aria-label={t("Xoá")} onClick={() => setXoa(r)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PhanTrang trang={trang.trang} tong={trang.tong} onDoi={trang.setTrang} donVi={t("dòng hàng")} />

      {form && (
        <Modal title={t("Tồn tối thiểu dòng hàng")} onClose={() => setForm(null)}>
          <div className="form-grid">
            {ctTao.canChon && <TruongCongTy value={form.cong_ty_id} ds={ctTao.ds} onChange={(id) => setForm({ ...form, cong_ty_id: id, ten_ts: "" })} />}
            <div className="field-group">
              <label className="field-label">{t("Tên tài sản *")}</label>
              <ChonLoc value={form.ten_ts} onChange={(e) => setForm({ ...form, ten_ts: e.target.value })}>
                <option value="">{t("-- Chọn tên tài sản --")}</option>
                {form.ten_ts && !goiY.some((g) => g.ten_ts === form.ten_ts) && <option value={form.ten_ts}>{form.ten_ts}</option>}
                {goiY.map((g) => (
                  <option key={g.ten_ts} value={g.ten_ts}>
                    {t("{ten} (trong kho {ton}/{tong})", { ten: g.ten_ts, ton: fmtSo(g.ton), tong: fmtSo(g.tong) })}
                  </option>
                ))}
              </ChonLoc>
            </div>
            <div className="field-group">
              <label className="field-label">{t("Tồn tối thiểu *")}</label>
              <input type="number" min={0} step={1} value={form.ton_toi_thieu} onChange={(e) => setForm({ ...form, ton_toi_thieu: e.target.value })} />
            </div>
            <div className="field-group">
              <label className="field-label">{t("Thời gian đặt hàng / ghi chú")}</label>
              <input type="text" maxLength={200} placeholder={t("vd: Thời gian đặt hàng 1-2 tuần")} value={form.thoi_gian_dat_hang} onChange={(e) => setForm({ ...form, thoi_gian_dat_hang: e.target.value })} />
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => setForm(null)}>
              {t("Huỷ")}
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={luu}>
              {busy ? t("Đang lưu...") : t("Lưu")}
            </button>
          </div>
        </Modal>
      )}
      {xoa && (
        <Modal title={t("Bỏ tồn tối thiểu")} onClose={() => setXoa(null)}>
          <p>{t("Bỏ theo dõi tồn tối thiểu của dòng hàng {ten}? Tài sản không bị ảnh hưởng.", { ten: xoa.ten_ts })}</p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setXoa(null)}>
              {t("Huỷ")}
            </button>
            <button className="btn btn-danger" onClick={() => xoaDong(xoa)}>
              {t("Bỏ theo dõi")}
            </button>
          </div>
        </Modal>
      )}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          {t("Đóng")}
        </button>
      </div>
    </Modal>
  );
}
