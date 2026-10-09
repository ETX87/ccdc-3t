import { t } from "../lib/i18n";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Warehouse } from "lucide-react";
import { api } from "../api/client";
import { PhanTrang, useTrangKhach } from "./PhanTrang";
import { TheKhoModal } from "./TheKho";
import { exportRowsToExcel } from "../lib/exportExcel";
import { fmtSo, homNayVN } from "../lib/format";
import { useKhiThayDoi } from "../lib/suKien";
import { thongBaoLoi } from "../lib/nhan";

// Ma tran ton tieu hao: dong = vat tu, cot = kho (nguoi xem chon cot, luu tren may - localStorage). Bam 1 o -> the kho.
// Mac dinh cot: kho HCNS + kho mien (kho van chinh); them kho QL (vd Nam Dinh, Hai Duong) bang nut "Chọn kho".

interface Kho {
  id: number;
  ten_kho: string;
  loai: string;
  cong_ty_id: number;
}
interface Vt {
  id: string;
  ten_vt: string;
  don_vi_tinh: string | null;
  ten_nhom: string | null;
}
const KEY = "ccdc_cot_kho_ton";

function docCot(): number[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return Array.isArray(v) ? v.map(Number) : null;
  } catch {
    return null;
  }
}

export function TonTheoKho({ tim, onDangTai }: { tim: string; onDangTai?: (b: boolean) => void }) {
  const [data, setData] = useState<{ kho: Kho[]; vt: Vt[]; ton: { kho_id: number; vt_id: string; ton: number }[] } | null>(null);
  const [cot, setCot] = useState<number[] | null>(docCot);
  const [chonCot, setChonCot] = useState(false);
  const [theKho, setTheKho] = useState<{ kho: Kho; vt: Vt } | null>(null);
  const [loi, setLoi] = useState<string | null>(null);

  const load = useCallback(async () => {
    onDangTai?.(true);
    try {
      setData(await api.get("/bao-cao/ton-theo-kho"));
      setLoi(null);
    } catch (e) {
      setLoi(thongBaoLoi(e, t("Không tải được tồn kho.")));
    } finally {
      onDangTai?.(false);
    }
  }, [onDangTai]);
  useEffect(() => {
    load();
  }, [load]);
  useKhiThayDoi(load);

  const khoCot = useMemo(() => {
    const ds = data?.kho ?? [];
    const chon = cot?.filter((id) => ds.some((k) => k.id === id));
    if (chon?.length) return chon.map((id) => ds.find((k) => k.id === id)!);
    return ds.filter((k) => k.loai === "HCNS" || k.loai === "Mien");
  }, [data, cot]);
  const tonMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data?.ton ?? []) m.set(`${r.kho_id}|${r.vt_id}`, Number(r.ton));
    return m;
  }, [data]);
  const tu = tim.trim().toLowerCase();
  const dong = useMemo(
    () =>
      (data?.vt ?? [])
        .filter((v) => khoCot.some((k) => tonMap.has(`${k.id}|${v.id}`)))
        .filter((v) => !tu || v.id.toLowerCase().includes(tu) || v.ten_vt.toLowerCase().includes(tu)),
    [data, khoCot, tonMap, tu],
  );
  const trang = useTrangKhach(dong, [tu, khoCot.map((k) => k.id).join(",")]);

  function luuCot(ids: number[]) {
    setCot(ids);
    try {
      localStorage.setItem(KEY, JSON.stringify(ids));
    } catch {
      /* bo qua */
    }
  }

  async function xuatExcel() {
    const hdr: Record<string, string> = { id: t("Mã vật tư"), ten_vt: t("Tên vật tư"), don_vi_tinh: t("ĐVT") };
    khoCot.forEach((k) => (hdr[`k${k.id}`] = k.ten_kho));
    hdr.tong = t("Tổng");
    await exportRowsToExcel(
      dong.map((v) => {
        const r: Record<string, unknown> = { id: v.id, ten_vt: v.ten_vt, don_vi_tinh: v.don_vi_tinh ?? "" };
        let tong = 0;
        khoCot.forEach((k) => {
          const x = tonMap.get(`${k.id}|${v.id}`) ?? 0;
          r[`k${k.id}`] = x;
          tong += x;
        });
        r.tong = tong;
        return r;
      }),
      `Ton_theo_kho_${homNayVN()}.xlsx`,
      "Ton theo kho",
      hdr,
    );
  }

  return (
    <>
      {loi && <div className="alert alert-error">{loi}</div>}
      <div className="filter-bar" style={{ marginTop: 0 }}>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setChonCot(!chonCot)}>
          <Warehouse size={13} /> {t("Chọn kho hiển thị ({x})", { x: khoCot.length })}
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={xuatExcel} disabled={!dong.length}>
          <Download size={13} /> {t("Xuất Excel")}
        </button>
        <span className="muted small">{t("Bấm vào 1 ô để xem thẻ kho (nhập / xuất từng phiếu).")}</span>
      </div>
      {chonCot && data && (
        <div className="pick-list" style={{ marginBottom: 10 }}>
          {data.kho.map((k) => (
            <label key={k.id} className="check-label">
              <input
                type="checkbox"
                checked={khoCot.some((x) => x.id === k.id)}
                onChange={(e) => luuCot(e.target.checked ? [...khoCot.map((x) => x.id), k.id] : khoCot.map((x) => x.id).filter((id) => id !== k.id))}
              />
              {k.ten_kho}
            </label>
          ))}
        </div>
      )}
      <div className="task-table-wrapper">
        <table className="task-table">
          <thead>
            <tr>
              <th>{t("Vật tư")}</th>
              <th>{t("ĐVT")}</th>
              {khoCot.map((k) => (
                <th key={k.id} style={{ textAlign: "right" }}>
                  {k.ten_kho}
                </th>
              ))}
              <th style={{ textAlign: "right" }}>{t("Tổng")}</th>
            </tr>
          </thead>
          <tbody>
            {!data && (
              <tr>
                <td colSpan={khoCot.length + 3} className="task-empty">
                  {t("Đang tải…")}
                </td>
              </tr>
            )}
            {data && dong.length === 0 && (
              <tr>
                <td colSpan={khoCot.length + 3} className="task-empty">
                  {t("Không có vật tư khớp bộ lọc.")}
                </td>
              </tr>
            )}
            {trang.dongTrang.map((v) => {
              let tong = 0;
              return (
                <tr key={v.id}>
                  <td data-label={t("Vật tư")}>
                    <div className="strong">{v.ten_vt}</div>
                    <div className="muted small">{v.id}</div>
                  </td>
                  <td data-label={t("ĐVT")}>{v.don_vi_tinh ?? "-"}</td>
                  {khoCot.map((k) => {
                    const x = tonMap.get(`${k.id}|${v.id}`);
                    tong += x ?? 0;
                    return (
                      <td
                        key={k.id}
                        data-label={k.ten_kho}
                        style={{ textAlign: "right", cursor: "pointer" }}
                        className={x != null && x < 0 ? "text-red strong" : x ? "strong" : "muted"}
                        title={t("Xem thẻ kho")}
                        onClick={() => setTheKho({ kho: k, vt: v })}
                      >
                        {x == null ? "-" : fmtSo(x, 2)}
                      </td>
                    );
                  })}
                  <td data-label={t("Tổng")} style={{ textAlign: "right" }} className="strong">
                    {fmtSo(tong, 2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <PhanTrang trang={trang.trang} tong={trang.tong} onDoi={trang.setTrang} donVi={t("vật tư")} />
      {theKho && <TheKhoModal khoId={theKho.kho.id} tenKho={theKho.kho.ten_kho} vt={theKho.vt} onClose={() => setTheKho(null)} />}
    </>
  );
}
