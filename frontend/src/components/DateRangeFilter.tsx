import { t } from "../lib/i18n";
import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { fmtNgay, homNayVN } from "../lib/format";

export interface KhoangNgay {
  tu: string;
  den: string;
}

function dauThang(d: string) {
  return `${d.slice(0, 7)}-01`;
}
function cuoiThang(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Cac moc chon nhanh (tinh theo ngay hom nay gio VN). */
export function khoangMacDinh(ma: "nam-nay" | "thang-nay" | "quy-nay" | "thang-truoc" | "12-thang"): KhoangNgay {
  const h = homNayVN();
  const y = Number(h.slice(0, 4));
  const m = Number(h.slice(5, 7));
  switch (ma) {
    case "thang-nay":
      return { tu: dauThang(h), den: h };
    case "quy-nay": {
      const q = Math.floor((m - 1) / 3) * 3 + 1;
      return { tu: `${y}-${String(q).padStart(2, "0")}-01`, den: h };
    }
    case "thang-truoc": {
      const d = new Date(Date.UTC(y, m - 2, 1));
      return { tu: d.toISOString().slice(0, 10), den: cuoiThang(d.getUTCFullYear(), d.getUTCMonth() + 1) };
    }
    case "12-thang": {
      const d = new Date(Date.UTC(y, m - 12, 1));
      return { tu: d.toISOString().slice(0, 10), den: h };
    }
    default:
      return { tu: `${y}-01-01`, den: h };
  }
}

const MOC: { ma: Parameters<typeof khoangMacDinh>[0]; nhan: string }[] = [
  { ma: "thang-nay", nhan: t("Tháng này") },
  { ma: "thang-truoc", nhan: t("Tháng trước") },
  { ma: "quy-nay", nhan: t("Quý này") },
  { ma: "nam-nay", nhan: t("Năm nay") },
  { ma: "12-thang", nhan: t("12 tháng gần nhất") },
];

// Bo loc ngay tren tieu de man hinh (kieu .header-dropdown cua mau): bam mo bang chon moc + tuy chon.
export function DateRangeFilter({ value, onChange }: { value: KhoangNgay; onChange: (v: KhoangNgay) => void }) {
  const [mo, setMo] = useState(false);
  const [nhap, setNhap] = useState(value);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setNhap(value), [value]);
  useEffect(() => {
    if (!mo) return;
    const dong = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMo(false);
    document.addEventListener("mousedown", dong);
    return () => document.removeEventListener("mousedown", dong);
  }, [mo]);

  return (
    <div className="header-dropdown-wrap" ref={ref}>
      <button type="button" className="header-dropdown date-picker-dropdown" onClick={() => setMo(!mo)} aria-expanded={mo}>
        <Calendar size={14} className="dropdown-icon" />
        <span className="dropdown-text">
          {fmtNgay(value.tu)} - {fmtNgay(value.den)}
        </span>
        <ChevronDown size={13} className="dropdown-arrow" />
      </button>
      {mo && (
        <div className="popover-panel">
          <div className="popover-presets">
            {MOC.map((m) => (
              <button
                key={m.ma}
                type="button"
                className="task-tab-btn"
                onClick={() => {
                  onChange(khoangMacDinh(m.ma));
                  setMo(false);
                }}
              >
                {m.nhan}
              </button>
            ))}
          </div>
          <div className="form-grid">
            <div className="field-group">
              <label className="field-label">{t("Từ ngày")}</label>
              <input type="date" value={nhap.tu} max={nhap.den} onChange={(e) => setNhap({ ...nhap, tu: e.target.value })} />
            </div>
            <div className="field-group">
              <label className="field-label">{t("Đến ngày")}</label>
              <input type="date" value={nhap.den} min={nhap.tu} onChange={(e) => setNhap({ ...nhap, den: e.target.value })} />
            </div>
          </div>
          <div className="modal-actions" style={{ marginTop: 0 }}>
            <button type="button" className="btn btn-sm" onClick={() => setMo(false)}>
              {t("Hủy")}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!nhap.tu || !nhap.den || nhap.tu > nhap.den}
              onClick={() => {
                onChange(nhap);
                setMo(false);
              }}
            >
              {t("Áp dụng")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
