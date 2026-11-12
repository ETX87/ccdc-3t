import { t } from "../lib/i18n";
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { fmtNgayGio } from "../lib/format";
import { soGioTu } from "./NoiBat";

// Luong quy trinh NGANG dang duong (quy uoc chu he thong 2026-11-07, ap dung moi UI chi tiet): cac moc noi bang 1 duong;
// moc da qua to mau + gio ngan (+ khoang cach voi moc truoc), moc dang xu ly to noi (mau khac), moc chua toi xam, moc bo
// qua gach. Re chuot xem nhan day du / gio / nguoi. Kem nut "Xem chi tiet / Thu gon" xo phan chi tiet (nhat ky...).

export type TrangThaiMoc = "xong" | "dang" | "cho" | "bo-qua" | "loi";
export interface Moc {
  nhan: string;
  tt: TrangThaiMoc;
  luc?: string | null;
  nguoi?: string | null;
  ghiChu?: string | null;
}

function khoang(truoc?: string | null, sau?: string | null): string | null {
  if (!truoc || !sau) return null;
  const a = Date.parse(`${truoc.replace(" ", "T")}+07:00`);
  const b = Date.parse(`${sau.replace(" ", "T")}+07:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  const gio = (b - a) / 3600e3;
  if (gio < 1) return `+${Math.max(1, Math.round(gio * 60))}′`;
  if (gio < 48) return `+${Math.round(gio)}h`;
  return `+${Math.round(gio / 24)}d`;
}

export function LuongNgang({ moc, chiTiet, moSan = false }: { moc: Moc[]; chiTiet?: ReactNode; moSan?: boolean }) {
  const [mo, setMo] = useState(moSan);
  const daQua = [...moc].reverse().find((m) => m.tt === "xong")?.luc;
  return (
    <div className="luong-ngang-khung">
      <div className="luong-ngang">
        {moc.map((m, i) => {
          const truoc = moc.slice(0, i).reverse().find((x) => x.luc)?.luc;
          const cho = m.tt === "dang" ? soGioTu(daQua) : null;
          return (
            <div key={i} className={`luong-moc luong-${m.tt}`} title={[m.nhan, m.luc ? fmtNgayGio(m.luc) : null, m.nguoi, m.ghiChu].filter(Boolean).join("\n")}>
              <div className="luong-cham" />
              <div className="luong-nhan">{m.nhan}</div>
              <div className="luong-gio">
                {m.luc ? fmtNgayGio(m.luc) : m.tt === "dang" ? (cho != null ? t("đang chờ {x}h", { x: Math.round(cho) }) : t("đang chờ")) : m.tt === "bo-qua" ? t("bỏ qua") : ""}
                {m.luc && khoang(truoc, m.luc) && <span className="luong-khoang"> {khoang(truoc, m.luc)}</span>}
              </div>
            </div>
          );
        })}
      </div>
      {chiTiet && (
        <>
          <button type="button" className="btn btn-outline btn-sm luong-nut" onClick={() => setMo(!mo)} aria-expanded={mo}>
            {mo ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {mo ? t("Thu gọn") : t("Xem chi tiết")}
          </button>
          {mo && <div className="luong-chi-tiet">{chiTiet}</div>}
        </>
      )}
    </div>
  );
}
