import { t } from "../lib/i18n";
import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Filter, X } from "lucide-react";
import { boDau } from "./ChonLoc";
import { PhanTrang, useTrangKhach } from "./PhanTrang";
import { exportRowsToExcel } from "../lib/exportExcel";

// Bang kieu Excel dung chung (2026-11-12, quy uoc chu he thong): moi tieu de cot co BO LOC theo kieu du lieu (chu: tim
// tu khoa bo dau; chon: tick nhieu gia tri; ngay: tu - den; so: tu - den) + bam tieu de de SAP XEP tang / giam. Cot dang
// loc to mau + nut xoa nhanh; dem dong sau loc / tong; xuat Excel dung cac dong dang loc. Loc / sap xep o TRINH DUYET -
// chi dung cho bang da tai du lieu ve (bang phan trang server phai gui loc len server).

export type KieuCot = "chu" | "chon" | "ngay" | "so";
export interface CotBang<T> {
  key: string;
  nhan: string;
  kieu: KieuCot;
  /** Gia tri goc de loc / sap xep / xuat Excel. */
  giaTri: (r: T) => string | number | null | undefined;
  /** Hien thi trong o (mac dinh = giaTri). */
  hien?: (r: T) => ReactNode;
  canPhai?: boolean;
  /** Khong loc / sap xep cot nay (vd cot nut thao tac). */
  khongLoc?: boolean;
  /** Bo khoi file Excel. */
  khongXuat?: boolean;
}

type Loc = { chu?: string; chon?: string[]; tu?: string; den?: string };

const giaTriChu = (v: unknown) => (v == null ? "" : String(v));

function khop(v: unknown, kieu: KieuCot, l: Loc): boolean {
  if (kieu === "chu") return !l.chu || boDau(giaTriChu(v)).includes(boDau(l.chu.trim()));
  if (kieu === "chon") return !l.chon || l.chon.includes(giaTriChu(v));
  if (kieu === "ngay") {
    const d = giaTriChu(v).slice(0, 10);
    return (!l.tu || (d !== "" && d >= l.tu)) && (!l.den || (d !== "" && d <= l.den));
  }
  const n = Number(v);
  return (l.tu === undefined || l.tu === "" || n >= Number(l.tu)) && (l.den === undefined || l.den === "" || n <= Number(l.den));
}

const dangLoc = (l: Loc | undefined) => !!l && (!!l.chu?.trim() || !!l.chon || !!l.tu || !!l.den);

export function BangLoc<T>({
  cot,
  rows,
  rowKey,
  onRowClick,
  rowClass,
  tenFile,
  rong,
  congCu,
}: {
  cot: CotBang<T>[];
  rows: T[];
  rowKey: (r: T, i: number) => string;
  onRowClick?: (r: T) => void;
  rowClass?: (r: T) => string;
  /** Ten file Excel (khong co -> an nut xuat). */
  tenFile?: string;
  rong?: string;
  /** Nut / bo loc them o thanh cong cu (ben trai). */
  congCu?: ReactNode;
}) {
  const [loc, setLoc] = useState<Record<string, Loc>>({});
  const [sx, setSx] = useState<{ key: string; tang: boolean } | null>(null);
  const [mo, setMo] = useState<{ key: string; x: number; y: number } | null>(null);

  const daLoc = useMemo(() => {
    const ds = rows.filter((r) => cot.every((c) => !loc[c.key] || khop(c.giaTri(r), c.kieu, loc[c.key])));
    if (!sx) return ds;
    const c = cot.find((x) => x.key === sx.key);
    if (!c) return ds;
    const k = (r: T) => c.giaTri(r);
    return [...ds].sort((a, b) => {
      const va = k(a);
      const vb = k(b);
      const r =
        c.kieu === "so" ? Number(va ?? -Infinity) - Number(vb ?? -Infinity) : giaTriChu(va).localeCompare(giaTriChu(vb), "vi", { numeric: true });
      return sx.tang ? r : -r;
    });
  }, [rows, cot, loc, sx]);
  const khoaLoc = JSON.stringify([loc, sx]);
  const trang = useTrangKhach(daLoc, khoaLoc);
  const soCotLoc = cot.filter((c) => dangLoc(loc[c.key])).length;

  function datLoc(key: string, l: Loc | undefined) {
    setLoc((cu) => {
      const m = { ...cu };
      if (l && dangLoc(l)) m[key] = l;
      else delete m[key];
      return m;
    });
  }

  async function xuat() {
    const ds = cot.filter((c) => !c.khongXuat);
    await exportRowsToExcel(
      daLoc.map((r) => Object.fromEntries(ds.map((c) => [c.key, c.giaTri(r) ?? ""]))),
      tenFile!,
      "Data",
      Object.fromEntries(ds.map((c) => [c.key, c.nhan])),
    );
  }

  const cotMo = mo ? cot.find((c) => c.key === mo.key) : null;
  return (
    <>
      <div className="bang-loc-cong-cu">
        {congCu}
        <span className="muted small">
          {daLoc.length === rows.length ? t("{n} dòng", { n: rows.length }) : t("{a} / {b} dòng (đang lọc)", { a: daLoc.length, b: rows.length })}
        </span>
        {soCotLoc > 0 && (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setLoc({})}>
            <X size={12} /> {t("Xoá lọc ({n} cột)", { n: soCotLoc })}
          </button>
        )}
        {tenFile && (
          <button type="button" className="btn btn-outline btn-sm" style={{ marginLeft: "auto" }} onClick={xuat} disabled={!daLoc.length}>
            <Download size={13} /> {t("Xuất Excel")}
          </button>
        )}
      </div>
      <div className="task-table-wrapper">
        <table className="task-table bang-loc">
          <thead>
            <tr>
              {cot.map((c) => {
                const l = loc[c.key];
                const coLoc = dangLoc(l);
                const dangSx = sx?.key === c.key;
                return (
                  <th key={c.key} style={c.canPhai ? { textAlign: "right" } : undefined} className={coLoc ? "bang-loc-th-loc" : ""}>
                    {c.khongLoc ? (
                      c.nhan
                    ) : (
                      <span className="bang-loc-th">
                        <button
                          type="button"
                          className="bang-loc-sx"
                          title={t("Bấm để sắp xếp")}
                          onClick={() => setSx((cu) => (cu?.key !== c.key ? { key: c.key, tang: true } : cu.tang ? { key: c.key, tang: false } : null))}
                        >
                          {c.nhan}
                          {dangSx ? sx!.tang ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : <ArrowUpDown size={11} className="bang-loc-mo" />}
                        </button>
                        <button
                          type="button"
                          className={`bang-loc-nut ${coLoc ? "on" : ""}`}
                          title={t("Lọc cột này")}
                          aria-label={t("Lọc cột {cot}", { cot: c.nhan })}
                          onClick={(e) => {
                            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setMo({ key: c.key, x: Math.min(r.left, window.innerWidth - 270), y: r.bottom + 4 });
                          }}
                        >
                          <Filter size={11} />
                        </button>
                        {coLoc && (
                          <button type="button" className="bang-loc-nut on" title={t("Xoá lọc cột này")} onClick={() => datLoc(c.key, undefined)}>
                            <X size={11} />
                          </button>
                        )}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {daLoc.length === 0 && (
              <tr>
                <td colSpan={cot.length} className="task-empty">
                  {rows.length ? t("Không có dòng khớp bộ lọc.") : (rong ?? t("Chưa có dữ liệu."))}
                </td>
              </tr>
            )}
            {trang.dongTrang.map((r, i) => (
              <tr key={rowKey(r, i)} className={`${onRowClick ? "row-clickable" : ""} ${rowClass?.(r) ?? ""}`} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                {cot.map((c) => (
                  <td key={c.key} data-label={c.nhan} style={c.canPhai ? { textAlign: "right" } : undefined}>
                    {c.hien ? c.hien(r) : giaTriChu(c.giaTri(r)) || "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PhanTrang trang={trang.trang} tong={trang.tong} onDoi={trang.setTrang} donVi={t("dòng")} />
      {mo && cotMo && (
        <>
          <div className="dropdown-backdrop" style={{ zIndex: 1990 }} onClick={() => setMo(null)} />
          <div className="bang-loc-pop" style={{ left: mo.x, top: mo.y }}>
            <BoLoc cot={cotMo} rows={rows} loc={loc[cotMo.key]} onDoi={(l) => datLoc(cotMo.key, l)} onDong={() => setMo(null)} />
          </div>
        </>
      )}
    </>
  );
}

function BoLoc<T>({ cot, rows, loc, onDoi, onDong }: { cot: CotBang<T>; rows: T[]; loc?: Loc; onDoi: (l: Loc | undefined) => void; onDong: () => void }) {
  const [tim, setTim] = useState("");
  const giaTriDs = useMemo(() => {
    if (cot.kieu !== "chon") return [];
    const m = new Map<string, number>();
    for (const r of rows) {
      const v = giaTriChu(cot.giaTri(r));
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "vi"));
  }, [rows, cot]);

  if (cot.kieu === "chu") {
    return (
      <>
        <div className="bang-loc-pop-tieu-de">{cot.nhan}</div>
        <input type="text" autoFocus placeholder={t("Chứa từ khoá… (không cần dấu)")} value={loc?.chu ?? ""} onChange={(e) => onDoi({ chu: e.target.value })} onKeyDown={(e) => e.key === "Enter" && onDong()} />
      </>
    );
  }
  if (cot.kieu === "ngay" || cot.kieu === "so") {
    const kieuO = cot.kieu === "ngay" ? "date" : "number";
    return (
      <>
        <div className="bang-loc-pop-tieu-de">{cot.nhan}</div>
        <label className="field-label">{cot.kieu === "ngay" ? t("Từ ngày") : t("Từ")}</label>
        <input type={kieuO} value={loc?.tu ?? ""} onChange={(e) => onDoi({ ...loc, tu: e.target.value })} />
        <label className="field-label">{cot.kieu === "ngay" ? t("Đến ngày") : t("Đến")}</label>
        <input type={kieuO} value={loc?.den ?? ""} onChange={(e) => onDoi({ ...loc, den: e.target.value })} />
        {cot.kieu === "ngay" && (
          <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 6 }} onClick={() => onDoi({ tu: loc?.tu ?? loc?.den, den: loc?.tu ?? loc?.den })}>
            {t("Chỉ 1 ngày (= Từ ngày)")}
          </button>
        )}
      </>
    );
  }
  const chon = loc?.chon ?? giaTriDs.map(([v]) => v);
  const hienDs = giaTriDs.filter(([v]) => !tim || boDau(v).includes(boDau(tim)));
  const doi = (ds: string[]) => onDoi(ds.length === giaTriDs.length ? undefined : { chon: ds });
  return (
    <>
      <div className="bang-loc-pop-tieu-de">{cot.nhan}</div>
      <input type="text" autoFocus placeholder={t("Tìm giá trị…")} value={tim} onChange={(e) => setTim(e.target.value)} />
      <div className="row-actions" style={{ justifyContent: "flex-start", margin: "6px 0" }}>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => doi(giaTriDs.map(([v]) => v))}>
          {t("Chọn tất cả")}
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => onDoi({ chon: [] })}>
          {t("Bỏ chọn")}
        </button>
      </div>
      <div className="bang-loc-ds">
        {hienDs.map(([v, n]) => (
          <label key={v} className="check-label">
            <input type="checkbox" checked={chon.includes(v)} onChange={(e) => doi(e.target.checked ? [...chon, v] : chon.filter((x) => x !== v))} />
            <span>{v || t("(trống)")}</span>
            <span className="muted small" style={{ marginLeft: "auto" }}>
              {n}
            </span>
          </label>
        ))}
      </div>
    </>
  );
}
