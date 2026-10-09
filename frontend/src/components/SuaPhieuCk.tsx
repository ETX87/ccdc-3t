import { t } from "../lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "../api/client";
import { SearchSelect } from "./SearchSelect";
import { useDuLieuChung } from "../lib/duLieuChung";
import { baoThayDoi } from "../lib/suKien";
import { fmtSo } from "../lib/format";
import { thongBaoLoi } from "../lib/nhan";

// Sua phieu tieu hao CHUA KT duyet (Nhap mua / chuyen cong ty): ghi chu, nha cung cap, dong hang (so luong, don gia),
// them / bot dong. Phieu bi KT tu choi -> luu xong tu gui duyet lai. Server kiem quyen + trang thai + ton (PUT /:id).

type Row = Record<string, unknown>;
interface Dong {
  vt_id: string;
  ten_vt: string;
  don_vi_tinh: string;
  so_luong: string;
  don_gia: string;
}
interface VtRow {
  id: string;
  ten_vt: string;
  don_vi_tinh: string | null;
  don_gia_tham_khao: number | null;
}

const s = (v: unknown) => (v == null ? "" : String(v));

export function SuaPhieuCk({ row, items, onHuy, onXong }: { row: Row; items: Row[]; onHuy: () => void; onXong: () => void }) {
  const { reload } = useDuLieuChung();
  const nhapMua = row.loai === "Nhap mua";
  const [ghiChu, setGhiChu] = useState(s(row.ghi_chu));
  const [ncc, setNcc] = useState(s(row.nha_cung_cap));
  const [dongs, setDongs] = useState<Dong[]>(() =>
    items.map((it) => ({
      vt_id: s(it.vt_id),
      ten_vt: s(it.ten_vt),
      don_vi_tinh: s(it.don_vi_tinh),
      so_luong: s(it.so_luong),
      don_gia: it.don_gia == null ? "" : s(it.don_gia),
    })),
  );
  const [vts, setVts] = useState<VtRow[]>([]);
  const [ton, setTon] = useState<Record<string, number>>({});
  const [them, setThem] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ rows: VtRow[] }>(`/vt-tieu-hao?cong_ty_id=${s(row.tu_cong_ty_id)}`)
      .then((r) => setVts(r.rows))
      .catch(() => setVts([]));
    if (!nhapMua)
      api
        .get<{ rows: { id: string; ton: number }[] }>(`/bao-cao/ton-kho?kho_id=${s(row.tu_kho_id)}`)
        .then((r) => setTon(Object.fromEntries(r.rows.map((x) => [x.id, x.ton]))))
        .catch(() => setTon({}));
  }, [row.tu_cong_ty_id, row.tu_kho_id, nhapMua]);

  const vtOptions = useMemo(
    () =>
      vts
        .filter((v) => !dongs.some((d) => d.vt_id === v.id) && (nhapMua || (ton[v.id] ?? 0) > 0))
        .map((v) => ({ value: v.id, label: `${v.ten_vt} (${v.id})${nhapMua ? "" : t(" — tồn {x}", { x: ton[v.id] ?? 0 })}` })),
    [vts, dongs, ton, nhapMua],
  );

  function sua(i: number, patch: Partial<Dong>) {
    setDongs(dongs.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  }
  function themDong(id: string) {
    const v = vts.find((x) => x.id === id);
    if (!v) return;
    setDongs([
      ...dongs,
      { vt_id: v.id, ten_vt: v.ten_vt, don_vi_tinh: v.don_vi_tinh ?? "", so_luong: "", don_gia: nhapMua && v.don_gia_tham_khao != null ? String(v.don_gia_tham_khao) : "" },
    ]);
    setThem("");
  }

  async function luu() {
    if (!dongs.length || dongs.some((d) => !(Number(d.so_luong) > 0))) {
      setErr(t("Nhập vật tư và số lượng > 0 cho từng dòng."));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.put(`/phieu-chuyen-kho/${encodeURIComponent(s(row.id))}`, {
        ghi_chu: ghiChu.trim() || null,
        nha_cung_cap: ncc.trim() || null,
        items: dongs.map((d) => ({ vt_id: d.vt_id, so_luong: Number(d.so_luong), don_gia: d.don_gia === "" ? null : Number(d.don_gia) })),
      });
      baoThayDoi();
      await reload();
      onXong();
    } catch (e) {
      setErr(thongBaoLoi(e));
    } finally {
      setBusy(false);
    }
  }

  const tong = dongs.reduce((x, d) => x + (Number(d.so_luong) || 0) * (Number(d.don_gia) || 0), 0);
  return (
    <div>
      <div className="alert alert-info">
        {row.trang_thai === "Ke toan tu choi"
          ? t("Phiếu bị Kế toán từ chối - sửa xong bấm Lưu để gửi duyệt lại. Nhật ký phiếu ghi lại mọi thay đổi.")
          : t("Phiếu chưa được Kế toán duyệt nên còn sửa được. Nhật ký phiếu ghi lại mọi thay đổi.")}
      </div>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="form-grid">
        {nhapMua && (
          <div className="field-group">
            <label className="field-label">{t("Nhà cung cấp")}</label>
            <input type="text" value={ncc} onChange={(e) => setNcc(e.target.value)} />
          </div>
        )}
        <div className="field-group" style={{ gridColumn: nhapMua ? undefined : "1 / -1" }}>
          <label className="field-label">{t("Ghi chú")}</label>
          <input type="text" value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} />
        </div>
      </div>
      <div className="table-scroll" style={{ marginTop: 10 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("Tên vật tư")}</th>
              <th className="num" style={{ width: "18%" }}>
                {t("Số lượng")}
              </th>
              <th className="num" style={{ width: "20%" }}>
                {t("Đơn giá")}
              </th>
              <th className="num" style={{ width: "16%" }}>
                {t("Thành tiền")}
              </th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {dongs.map((d, i) => (
              <tr key={d.vt_id}>
                <td>
                  <div className="strong">{d.ten_vt}</div>
                  <div className="muted small">
                    {d.vt_id}
                    {!nhapMua && ton[d.vt_id] != null ? ` · ${t("tồn {x}", { x: fmtSo(ton[d.vt_id], 2) })}` : ""}
                  </div>
                </td>
                <td className="num">
                  <input type="number" min={0} step="any" value={d.so_luong} onChange={(e) => sua(i, { so_luong: e.target.value })} aria-label={t("Số lượng")} />
                </td>
                <td className="num">
                  <input type="number" min={0} step="any" value={d.don_gia} onChange={(e) => sua(i, { don_gia: e.target.value })} aria-label={t("Đơn giá")} />
                </td>
                <td className="num">{d.don_gia !== "" ? fmtSo((Number(d.so_luong) || 0) * (Number(d.don_gia) || 0)) : "-"}</td>
                <td>
                  <button type="button" className="btn btn-outline btn-sm danger-outline" title={t("Bỏ dòng")} onClick={() => setDongs(dongs.filter((_, j) => j !== i))}>
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="field-group" style={{ marginTop: 8 }}>
        <label className="field-label">{t("Thêm vật tư")}</label>
        <SearchSelect options={vtOptions} value={them} onChange={themDong} placeholder={t("Tìm vật tư...")} />
      </div>
      {tong > 0 && <div className="small muted">{t("Tổng tiền: {x}", { x: fmtSo(tong) })}</div>}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onHuy} disabled={busy}>
          {t("Hủy")}
        </button>
        <button type="button" className="btn btn-primary" onClick={luu} disabled={busy}>
          {busy ? t("Đang lưu...") : row.trang_thai === "Ke toan tu choi" ? t("Lưu và gửi duyệt lại") : t("Lưu thay đổi")}
        </button>
      </div>
    </div>
  );
}
