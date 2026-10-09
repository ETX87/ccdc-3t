import { t } from "../lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "../api/client";
import { Modal } from "./Modal";
import { SearchSelect } from "./SearchSelect";
import { StatusBadge } from "./StatusBadge";
import { useChiTiet } from "./ChiTiet";
import { useDuLieuChung } from "../lib/duLieuChung";
import { baoThayDoi } from "../lib/suKien";
import { fmtNgayGio, fmtSo } from "../lib/format";
import { LOAI_PHIEU_CK, TRANG_THAI_CK, thongBaoLoi } from "../lib/nhan";

// The kho 1 vat tu tai 1 kho (GET /bao-cao/the-kho): tung phieu nhap / xuat / dieu chinh theo thoi gian + ton luy ke.
// Phieu chuyen den dang tren duong hien kem nhung chua cong ton (giong cach tinh ton).

interface DongTheKho {
  id: string;
  ma_phieu: string | null;
  loai: string;
  trang_thai: string;
  ngay: string;
  doi_tac: string | null;
  nhap: number;
  xuat: number;
  ton_luy_ke: number | null;
}

export function TheKhoModal({ khoId, tenKho, vt, onClose }: { khoId: number; tenKho: string; vt: { id: string; ten_vt: string; don_vi_tinh: string | null }; onClose: () => void }) {
  const { moPhieu } = useChiTiet();
  const [data, setData] = useState<{ rows: DongTheKho[]; ton: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api
      .get<{ rows: DongTheKho[]; ton: number }>(`/bao-cao/the-kho?kho_id=${khoId}&vt_id=${encodeURIComponent(vt.id)}`)
      .then(setData)
      .catch((e) => setErr(thongBaoLoi(e)));
  }, [khoId, vt.id]);
  // Moi nhat len dau (de xem), ton luy ke tinh tu cu -> moi o server.
  const rows = useMemo(() => [...(data?.rows ?? [])].reverse(), [data]);
  const tongNhap = rows.reduce((s, r) => s + (r.ton_luy_ke != null ? Number(r.nhap) : 0), 0);
  const tongXuat = rows.reduce((s, r) => s + Number(r.xuat), 0);
  return (
    <Modal size="lg" title={t("Thẻ kho: {vt} · {kho}", { vt: vt.ten_vt, kho: tenKho })} onClose={onClose}>
      {err && <div className="alert alert-error">{err}</div>}
      {!data && !err && <div className="empty-state">{t("Đang tải…")}</div>}
      {data && (
        <>
          <div className="info-grid">
            <div className="info-item">
              <div className="info-label">{t("Tổng nhập")}</div>
              <div className="info-value">{fmtSo(tongNhap, 2)}</div>
            </div>
            <div className="info-item">
              <div className="info-label">{t("Tổng xuất")}</div>
              <div className="info-value">{fmtSo(tongXuat, 2)}</div>
            </div>
            <div className="info-item">
              <div className="info-label">{t("Tồn hiện tại")}</div>
              <div className={`info-value strong${data.ton < 0 ? " text-red" : ""}`}>
                {fmtSo(data.ton, 2)} {vt.don_vi_tinh ?? ""}
              </div>
            </div>
          </div>
          <div className="table-scroll" style={{ marginTop: 12 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("Ngày")}</th>
                  <th>{t("Mã phiếu")}</th>
                  <th>{t("Loại")}</th>
                  <th>{t("Từ / đến")}</th>
                  <th className="num">{t("Nhập")}</th>
                  <th className="num">{t("Xuất")}</th>
                  <th className="num">{t("Tồn")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="task-empty">
                      {t("Chưa có phát sinh.")}
                    </td>
                  </tr>
                )}
                {rows.map((r, i) => (
                  <tr key={`${r.id}-${i}`}>
                    <td className="text-secondary">{fmtNgayGio(r.ngay)}</td>
                    <td>
                      <span className="code-link" role="button" tabIndex={0} onClick={() => moPhieu("chuyen_kho", r.id)}>
                        {r.ma_phieu ?? r.id.slice(0, 8)}
                      </span>
                    </td>
                    <td>
                      {LOAI_PHIEU_CK[r.loai] ?? r.loai}
                      {r.ton_luy_ke == null && (
                        <div>
                          <StatusBadge label={TRANG_THAI_CK[r.trang_thai]?.label ?? r.trang_thai} tone="warning" />
                        </div>
                      )}
                    </td>
                    <td className="text-secondary">{r.doi_tac ?? "-"}</td>
                    <td className="num text-teal">{Number(r.nhap) ? `+${fmtSo(Number(r.nhap), 2)}` : ""}</td>
                    <td className="num text-red">{Number(r.xuat) ? `−${fmtSo(Number(r.xuat), 2)}` : ""}</td>
                    <td className="num strong">{r.ton_luy_ke == null ? "-" : fmtSo(r.ton_luy_ke, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">{t("Dòng \"Đang chuyển\" là hàng trên đường tới kho - chưa cộng vào tồn cho tới khi kho xác nhận nhận.")}</p>
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// Dieu chinh ton tieu hao 1 kho: nhap TON THUC TE tung vat tu, server tinh chenh lech -> phieu DC cho KT duyet.

interface VtTon {
  id: string;
  ten_vt: string;
  don_vi_tinh: string | null;
  ton: number;
}

export function DieuChinhTonModal({
  khoId,
  congTyId,
  tenKho,
  ds: dsTon,
  chonSan,
  onClose,
}: {
  khoId: number;
  congTyId: number | null;
  tenKho: string;
  ds: VtTon[];
  chonSan?: string[];
  onClose: () => void;
}) {
  // Moi vat tu cua cong ty kho (ke ca dang ton 0 - dem thay thuc te co hang), ton so sach lay tu bang ton.
  const [dsVt, setDsVt] = useState<VtTon[]>([]);
  useEffect(() => {
    api
      .get<{ rows: VtTon[] }>(`/vt-tieu-hao${congTyId ? `?cong_ty_id=${congTyId}` : ""}`)
      .then((r) => setDsVt(r.rows.map((v) => ({ id: v.id, ten_vt: v.ten_vt, don_vi_tinh: v.don_vi_tinh, ton: 0 }))))
      .catch(() => setDsVt([]));
  }, [congTyId]);
  const ds = useMemo(() => {
    const m = new Map(dsTon.map((v) => [v.id, v]));
    return [...dsTon, ...dsVt.filter((v) => !m.has(v.id))];
  }, [dsTon, dsVt]);
  const { reload } = useDuLieuChung();
  const { moPhieu } = useChiTiet();
  const [dongs, setDongs] = useState<{ vt: VtTon; thuc_te: string }[]>(() =>
    ds.filter((v) => chonSan?.includes(v.id)).map((vt) => ({ vt, thuc_te: "" })),
  );
  const [lyDo, setLyDo] = useState("");
  const [them, setThem] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const options = useMemo(
    () => ds.filter((v) => !dongs.some((d) => d.vt.id === v.id)).map((v) => ({ value: v.id, label: `${v.ten_vt} (${v.id}) — ${t("tồn {x}", { x: fmtSo(v.ton, 2) })}` })),
    [ds, dongs],
  );

  async function luu() {
    if (!lyDo.trim()) return setErr(t("Vui lòng nhập {x}.", { x: t("Lý do điều chỉnh").toLowerCase() }));
    if (!dongs.length || dongs.some((d) => d.thuc_te === "" || !(Number(d.thuc_te) >= 0))) return setErr(t("Nhập tồn thực tế (≥ 0) cho từng dòng."));
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post<{ id: string }>("/phieu-chuyen-kho/dieu-chinh", {
        kho_id: khoId,
        ly_do: lyDo.trim(),
        items: dongs.map((d) => ({ vt_id: d.vt.id, ton_thuc_te: Number(d.thuc_te) })),
      });
      baoThayDoi();
      await reload();
      onClose();
      if (r?.id) moPhieu("chuyen_kho", r.id);
    } catch (e) {
      setErr(thongBaoLoi(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal size="lg" title={t("Điều chỉnh tồn · {kho}", { kho: tenKho })} onClose={onClose}>
      <div className="alert alert-info">{t("Nhập số lượng ĐẾM THỰC TẾ. Hệ thống tính chênh lệch với sổ sách, lập phiếu điều chỉnh chờ Kế toán duyệt - duyệt xong tồn mới thay đổi.")}</div>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("Tên vật tư")}</th>
              <th className="num">{t("Tồn sổ sách")}</th>
              <th className="num" style={{ width: "20%" }}>
                {t("Tồn thực tế")}
              </th>
              <th className="num">{t("Chênh lệch")}</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {dongs.map((d, i) => {
              const lech = d.thuc_te === "" ? null : Number(d.thuc_te) - d.vt.ton;
              return (
                <tr key={d.vt.id}>
                  <td>
                    <div className="strong">{d.vt.ten_vt}</div>
                    <div className="muted small">{d.vt.id}</div>
                  </td>
                  <td className={`num${d.vt.ton < 0 ? " text-red" : ""}`}>{fmtSo(d.vt.ton, 2)}</td>
                  <td className="num">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={d.thuc_te}
                      aria-label={t("Tồn thực tế")}
                      onChange={(e) => setDongs(dongs.map((x, j) => (j === i ? { ...x, thuc_te: e.target.value } : x)))}
                    />
                  </td>
                  <td className={`num strong${lech == null ? "" : lech > 0 ? " text-teal" : lech < 0 ? " text-red" : ""}`}>
                    {lech == null ? "-" : lech > 0 ? `+${fmtSo(lech, 2)}` : fmtSo(lech, 2)}
                  </td>
                  <td>
                    <button type="button" className="btn btn-outline btn-sm danger-outline" title={t("Bỏ dòng")} onClick={() => setDongs(dongs.filter((_, j) => j !== i))}>
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="form-grid" style={{ marginTop: 8 }}>
        <div className="field-group">
          <label className="field-label">{t("Thêm vật tư")}</label>
          <SearchSelect
            options={options}
            value={them}
            onChange={(id) => {
              const vt = ds.find((v) => v.id === id);
              if (vt) setDongs([...dongs, { vt, thuc_te: "" }]);
              setThem("");
            }}
            placeholder={t("Tìm vật tư...")}
          />
        </div>
        <div className="field-group">
          <label className="field-label">{t("Lý do điều chỉnh *")}</label>
          <input type="text" value={lyDo} onChange={(e) => setLyDo(e.target.value)} placeholder={t("vd: Kiểm đếm thực tế ngày …")} />
        </div>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          {t("Hủy")}
        </button>
        <button type="button" className="btn btn-primary" onClick={luu} disabled={busy || !dongs.length}>
          {busy ? t("Đang gửi…") : t("Lập phiếu điều chỉnh")}
        </button>
      </div>
    </Modal>
  );
}
