import { t } from "../lib/i18n";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Filter, Warehouse } from "lucide-react";
import { api } from "../api/client";
import { Modal } from "./Modal";
import { PhanTrang, useTrangKhach } from "./PhanTrang";
import { TheKhoModal } from "./TheKho";
import { KhoTag, SoTon } from "./NoiBat";
import { boDau } from "./ChonLoc";
import { exportRowsToExcel } from "../lib/exportExcel";
import { fmtSo, homNayVN } from "../lib/format";
import { useKhiThayDoi } from "../lib/suKien";
import { LOAI_KHO, thongBaoLoi } from "../lib/nhan";
import type { LoaiKho } from "../types";

// Ma tran ton tieu hao: dong = vat tu, cot = kho (nguoi xem chon cot, luu tren may - localStorage). Bam 1 o -> the kho.
// Mac dinh cot: kho HCNS + kho mien + kho trung chuyen. Vat tu con ton o BAT KY kho nao deu hien (khong chi cac cot dang
// chon) - cot "Kho khac" cong ton cac kho khong hien thi, bam vao -> danh sach tung kho (TonVtCacKhoModal).
// Nut "Chi kho co hang": chon cot = cac kho dang co ton cua nhung vat tu dang loc (vd go "bang keo" -> dung kho con).

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
interface DuLieuTon {
  kho: Kho[];
  vt: Vt[];
  ton: { kho_id: number; vt_id: string; ton: number }[];
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
  const [data, setData] = useState<DuLieuTon | null>(null);
  const [cot, setCot] = useState<number[] | null>(docCot);
  const [chonCot, setChonCot] = useState(false);
  const [theKho, setTheKho] = useState<{ kho: Kho; vt: Vt } | null>(null);
  const [cacKho, setCacKho] = useState<Vt | null>(null);
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
    return ds.filter((k) => k.loai === "HCNS" || k.loai === "Mien" || k.loai === "Trung chuyen");
  }, [data, cot]);
  const tonMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data?.ton ?? []) m.set(`${r.kho_id}|${r.vt_id}`, Number(r.ton));
    return m;
  }, [data]);
  // Tong ton + so kho co ton cua tung vat tu tren MOI kho trong pham vi (khong chi cot dang hien).
  const tongVt = useMemo(() => {
    const m = new Map<string, { tong: number; soKho: number }>();
    for (const r of data?.ton ?? []) {
      const x = m.get(r.vt_id) ?? { tong: 0, soKho: 0 };
      x.tong += Number(r.ton);
      x.soKho += 1;
      m.set(r.vt_id, x);
    }
    return m;
  }, [data]);
  const q = boDau(tim.trim());
  const dong = useMemo(
    () =>
      (data?.vt ?? []).filter((v) => tongVt.has(v.id)).filter((v) => !q || boDau(v.id).includes(q) || boDau(v.ten_vt).includes(q) || boDau(v.ten_nhom ?? "").includes(q)),
    [data, tongVt, q],
  );
  const trang = useTrangKhach(dong, [q, khoCot.map((k) => k.id).join(",")]);
  const idCot = useMemo(() => new Set(khoCot.map((k) => k.id)), [khoCot]);
  const khoKhac = (vtId: string) => {
    let tong = 0;
    let so = 0;
    for (const k of data?.kho ?? []) {
      if (idCot.has(k.id)) continue;
      const x = tonMap.get(`${k.id}|${vtId}`);
      if (x) {
        tong += x;
        so += 1;
      }
    }
    return { tong, so };
  };

  function luuCot(ids: number[]) {
    setCot(ids);
    try {
      localStorage.setItem(KEY, JSON.stringify(ids));
    } catch {
      /* bo qua */
    }
  }
  /** Cot = cac kho dang co ton (khac 0) cua nhung vat tu khop bo loc. */
  function chiKhoCoHang() {
    const vtIds = new Set(dong.map((v) => v.id));
    const ids = (data?.kho ?? []).filter((k) => (data?.ton ?? []).some((r) => r.kho_id === k.id && vtIds.has(r.vt_id))).map((k) => k.id);
    if (ids.length) luuCot(ids);
  }

  async function xuatExcel() {
    const hdr: Record<string, string> = { id: t("Mã vật tư"), ten_vt: t("Tên vật tư"), don_vi_tinh: t("ĐVT") };
    khoCot.forEach((k) => (hdr[`k${k.id}`] = k.ten_kho));
    hdr.khac = t("Kho khác");
    hdr.tong = t("Tổng");
    await exportRowsToExcel(
      dong.map((v) => {
        const r: Record<string, unknown> = { id: v.id, ten_vt: v.ten_vt, don_vi_tinh: v.don_vi_tinh ?? "" };
        khoCot.forEach((k) => (r[`k${k.id}`] = tonMap.get(`${k.id}|${v.id}`) ?? 0));
        r.khac = khoKhac(v.id).tong;
        r.tong = tongVt.get(v.id)?.tong ?? 0;
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
        <button type="button" className="btn btn-outline btn-sm" onClick={chiKhoCoHang} disabled={!dong.length} title={t("Hiện đúng các kho đang có tồn của những vật tư đang lọc")}>
          <Filter size={13} /> {t("Chỉ kho có hàng")}
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={xuatExcel} disabled={!dong.length}>
          <Download size={13} /> {t("Xuất Excel")}
        </button>
        <span className="muted small">{t("Bấm vào 1 ô để xem thẻ kho; cột \"Kho khác\" = tồn ở các kho đang không hiển thị.")}</span>
      </div>
      {chonCot && data && (
        <div className="pick-list" style={{ marginBottom: 10 }}>
          {data.kho.map((k) => (
            <label key={k.id} className="check-label">
              <input
                type="checkbox"
                checked={idCot.has(k.id)}
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
              <th style={{ textAlign: "right" }}>{t("Kho khác")}</th>
              <th style={{ textAlign: "right" }}>{t("Tổng")}</th>
            </tr>
          </thead>
          <tbody>
            {!data && (
              <tr>
                <td colSpan={khoCot.length + 4} className="task-empty">
                  {t("Đang tải…")}
                </td>
              </tr>
            )}
            {data && dong.length === 0 && (
              <tr>
                <td colSpan={khoCot.length + 4} className="task-empty">
                  {t("Không có vật tư khớp bộ lọc.")}
                </td>
              </tr>
            )}
            {trang.dongTrang.map((v) => {
              const khac = khoKhac(v.id);
              const tong = tongVt.get(v.id);
              return (
                <tr key={v.id}>
                  <td data-label={t("Vật tư")}>
                    <div className="strong">{v.ten_vt}</div>
                    <div className="muted small">{v.id}</div>
                  </td>
                  <td data-label={t("ĐVT")}>{v.don_vi_tinh ?? "-"}</td>
                  {khoCot.map((k) => {
                    const x = tonMap.get(`${k.id}|${v.id}`);
                    return (
                      <td key={k.id} data-label={k.ten_kho} style={{ textAlign: "right" }} className="o-link" title={t("Xem thẻ kho")} onClick={() => setTheKho({ kho: k, vt: v })}>
                        <span className={`so-link${x != null && x < 0 ? " so-am" : x ? "" : " so-nhat"}`}>{x == null ? "-" : fmtSo(x, 2)}</span>
                      </td>
                    );
                  })}
                  <td data-label={t("Kho khác")} style={{ textAlign: "right" }}>
                    {khac.so ? (
                      <button type="button" className="so-link" title={t("Xem tồn từng kho")} onClick={() => setCacKho(v)}>
                        {fmtSo(khac.tong, 2)}
                        <span className="nb-dvt">{t("({x} kho)", { x: khac.so })}</span>
                      </button>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                  <td data-label={t("Tổng")} style={{ textAlign: "right" }}>
                    <button type="button" className="so-link" title={t("Xem tồn từng kho")} onClick={() => setCacKho(v)}>
                      {fmtSo(tong?.tong ?? 0, 2)}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <PhanTrang trang={trang.trang} tong={trang.tong} onDoi={trang.setTrang} donVi={t("vật tư")} />
      {theKho && <TheKhoModal khoId={theKho.kho.id} tenKho={theKho.kho.ten_kho} vt={theKho.vt} onClose={() => setTheKho(null)} />}
      {cacKho && <TonVtCacKhoModal vt={cacKho} duLieu={data} onClose={() => setCacKho(null)} />}
    </>
  );
}

/**
 * Ton 1 vat tu o TUNG KHO (kho con ton / am), sap theo so luong - tra loi "kho nao dang con hang". Bam 1 kho -> the kho.
 * `duLieu` co san (ma tran) thi dung luon, khong thi tu tai /bao-cao/ton-theo-kho.
 */
export function TonVtCacKhoModal({ vt, duLieu, onClose }: { vt: Vt | { id: string; ten_vt: string; don_vi_tinh: string | null }; duLieu?: DuLieuTon | null; onClose: () => void }) {
  const [data, setData] = useState<DuLieuTon | null>(duLieu ?? null);
  const [loi, setLoi] = useState<string | null>(null);
  const [theKho, setTheKho] = useState<Kho | null>(null);
  useEffect(() => {
    if (duLieu) return;
    api
      .get<DuLieuTon>("/bao-cao/ton-theo-kho")
      .then(setData)
      .catch((e) => setLoi(thongBaoLoi(e)));
  }, [duLieu]);
  const ds = useMemo(() => {
    if (!data) return [];
    const ton = new Map(data.ton.filter((r) => r.vt_id === vt.id).map((r) => [r.kho_id, Number(r.ton)]));
    return data.kho
      .filter((k) => ton.has(k.id))
      .map((k) => ({ kho: k, ton: ton.get(k.id)! }))
      .sort((a, b) => b.ton - a.ton);
  }, [data, vt.id]);
  const tong = ds.reduce((s, x) => s + x.ton, 0);
  const soAm = ds.filter((x) => x.ton < 0).length;

  return (
    <Modal title={t("Tồn từng kho · {x}", { x: vt.ten_vt })} onClose={onClose}>
      {loi && <div className="alert alert-error">{loi}</div>}
      {!data && !loi && <div className="empty-state">{t("Đang tải…")}</div>}
      {data && (
        <>
          <div className="info-grid">
            <div className="info-item">
              <div className="info-label">{t("Tổng tồn")}</div>
              <div className="info-value">
                <SoTon so={tong} dvt={vt.don_vi_tinh} />
              </div>
            </div>
            <div className="info-item">
              <div className="info-label">{t("Số kho còn hàng")}</div>
              <div className="info-value strong">{fmtSo(ds.filter((x) => x.ton > 0).length)}</div>
            </div>
            {soAm > 0 && (
              <div className="info-item">
                <div className="info-label">{t("Kho tồn âm")}</div>
                <div className="info-value strong text-red">{fmtSo(soAm)}</div>
              </div>
            )}
          </div>
          <div className="table-scroll" style={{ marginTop: 12 }}>
            <table className="task-table">
              <thead>
                <tr>
                  <th>{t("Kho")}</th>
                  <th>{t("Loại kho")}</th>
                  <th style={{ textAlign: "right" }}>{t("Tồn")}</th>
                </tr>
              </thead>
              <tbody>
                {ds.length === 0 && (
                  <tr>
                    <td colSpan={3} className="task-empty">
                      {t("Không kho nào còn tồn vật tư này.")}
                    </td>
                  </tr>
                )}
                {ds.map(({ kho, ton }) => (
                  <tr key={kho.id} className={`row-clickable${ton < 0 ? " row-canh-bao" : ""}`} title={t("Xem thẻ kho")} onClick={() => setTheKho(kho)}>
                    <td data-label={t("Kho")}>
                      <KhoTag ten={kho.ten_kho} loai={kho.loai} />
                    </td>
                    <td data-label={t("Loại kho")} className="text-secondary">
                      {LOAI_KHO[kho.loai as LoaiKho] ?? kho.loai}
                    </td>
                    <td data-label={t("Tồn")} style={{ textAlign: "right" }}>
                      <SoTon so={ton} dvt={vt.don_vi_tinh} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {theKho && <TheKhoModal khoId={theKho.id} tenKho={theKho.ten_kho} vt={vt} onClose={() => setTheKho(null)} />}
    </Modal>
  );
}
