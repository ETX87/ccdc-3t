import { t, tS } from "../lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { Modal } from "../components/Modal";
import { FilterTabs } from "../components/FilterTabs";
import { SearchSelect } from "../components/SearchSelect";
import { fmtNgayGio, fmtSo } from "../lib/format";
import { baoThayDoi } from "../lib/suKien";
import { thongBaoLoi } from "../lib/nhan";

type Loai = "gan-etx" | "gop" | "doi-ma";
interface EtxRow {
  ma_nhan_su: string;
  ho_ten: string;
  chuc_danh: string | null;
  gmail: string | null;
  trang_thai_lam_viec: string;
  ho_so_ma_nv: string | null;
  ho_so_ten: string | null;
}
interface KeHoach {
  thaoTac: string;
  maDich: string;
  taiCho: boolean;
  dich: { ma_nv: string; ten_nv: string } | null;
  ketQua: { ten_nv: string; ma_etx: string | null; email_dang_nhap: string | null; dang_lam_viec: number };
  chuyen: { nhan: string; so: number }[];
  kho: { nguon: { id: number; ten_kho: string; ton: number }; dich: { id: number; ten_kho: string } | null }[];
  xungDotEmail: { nguon: string; dich: string } | null;
  canhBao: string[];
}
interface LichSu {
  id: number;
  thao_tac: string;
  ma_nguon: string;
  ten_nguon: string | null;
  ma_dich: string;
  ma_etx: string | null;
  nguoi_thuc_hien: string;
  created_at: string;
}

const LOI: Record<string, string> = {
  MA_ETX_KHONG_CO: t("Mã ETX này không có trong danh bạ ETX."),
  ETX_CHUA_DONG_BO: t("Chưa có danh bạ ETX - bấm “Đồng bộ ETX” trước."),
  DA_CO_MA_ETX_NAY: t("Hồ sơ đã gắn đúng mã ETX này."),
  MA_MOI_KHONG_HOP_LE: t("Mã mới chỉ gồm chữ, số, dấu chấm, gạch (2-40 ký tự)."),
  TRUNG_MA: t("Mã mới trùng mã hiện tại."),
  DICH_NOT_FOUND: t("Không tìm thấy hồ sơ đích."),
  HAI_MA_ETX_KHAC_NHAU: t("Hai hồ sơ gắn 2 mã ETX khác nhau (2 người khác nhau trên ETX) - không gộp được."),
  DU_LIEU_DA_DOI: t("Dữ liệu vừa thay đổi - xem trước lại rồi thực hiện."),
};
const THAO_TAC: Record<string, string> = { "Gop ho so": t("Gộp hồ sơ"), "Doi ma": t("Đổi mã"), "Gan ma ETX": t("Gắn mã ETX") };

// Doi ma / gop ho so / gan ma ETX chuan cho 1 nhan vien (backend lib/gopNhanVien.ts). Luon XEM TRUOC (so tai
// san / phieu / kho se chuyen) roi moi thuc hien - ton kho khong doi, ma cu ghi vao nhat ky.
export function DoiMaNhanVienModal({ nv, onClose, onXong }: { nv: { ma_nv: string; ten_nv: string; ma_etx: string | null }; onClose: () => void; onXong: (maMoi: string) => void }) {
  const [loai, setLoai] = useState<Loai>("gan-etx");
  const [timEtx, setTimEtx] = useState("");
  const [dsEtx, setDsEtx] = useState<EtxRow[]>([]);
  const [maEtx, setMaEtx] = useState("");
  const [dsNv, setDsNv] = useState<{ ma_nv: string; ten_nv: string }[]>([]);
  const [dich, setDich] = useState("");
  const [maMoi, setMaMoi] = useState("");
  const [giuEmail, setGiuEmail] = useState<"dich" | "nguon">("dich");
  const [keHoach, setKeHoach] = useState<KeHoach | null>(null);
  const [lichSu, setLichSu] = useState<LichSu[]>([]);
  const [busy, setBusy] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ rows: LichSu[] }>(`/nhan-vien/${encodeURIComponent(nv.ma_nv)}/lich-su-ma`).then((r) => setLichSu(r.rows)).catch(() => undefined);
  }, [nv.ma_nv]);
  useEffect(() => {
    if (loai === "gop" && !dsNv.length) api.get<{ rows: { ma_nv: string; ten_nv: string }[] }>("/nhan-vien?gon=1&trang_thai=tat-ca").then((r) => setDsNv(r.rows)).catch(() => undefined);
  }, [loai, dsNv.length]);
  useEffect(() => {
    if (loai !== "gan-etx" || timEtx.trim().length < 2) return setDsEtx([]);
    const t = setTimeout(() => {
      api.get<{ rows: EtxRow[] }>(`/nhan-vien/etx?search=${encodeURIComponent(timEtx.trim())}`).then((r) => setDsEtx(r.rows)).catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [loai, timEtx]);

  const body = useMemo(() => {
    if (loai === "gan-etx") return maEtx ? { loai, ma_etx: maEtx } : null;
    if (loai === "gop") return dich ? { loai, dich } : null;
    return maMoi.trim() ? { loai, ma_moi: maMoi.trim() } : null;
  }, [loai, maEtx, dich, maMoi]);

  // Doi lua chon -> bo ke hoach cu (bat buoc xem truoc lai).
  useEffect(() => {
    setKeHoach(null);
    setLoi(null);
  }, [body, giuEmail]);

  async function goi(xemTruoc: boolean) {
    if (!body) return;
    setBusy(true);
    setLoi(null);
    try {
      const r = await api.post<{ ke_hoach?: KeHoach; ma_dich?: string }>(`/nhan-vien/${encodeURIComponent(nv.ma_nv)}/doi-ma`, { ...body, giu_email: giuEmail, xem_truoc: xemTruoc });
      if (xemTruoc) setKeHoach(r.ke_hoach ?? null);
      else {
        baoThayDoi();
        onXong(r.ma_dich ?? nv.ma_nv);
      }
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setLoi((code && LOI[code]) || thongBaoLoi(e, t("Không thực hiện được.")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t("Đổi mã / gộp hồ sơ - {ten_nv} ({ma_nv})", { ten_nv: nv.ten_nv, ma_nv: nv.ma_nv })} onClose={onClose} size="lg">
      <FilterTabs<Loai>
        tabs={[
          { key: "gan-etx", label: t("Gắn mã ETX chuẩn") },
          { key: "gop", label: t("Gộp vào hồ sơ khác") },
          { key: "doi-ma", label: t("Đổi mã nội bộ") },
        ]}
        value={loai}
        onChange={setLoai}
      />
      <p className="muted small">
        {t("Mã ETX hiện tại:")} <b>{nv.ma_etx ?? t("chưa có")}</b>{t(". Mọi tài sản, phiếu, kho QL, cấp dưới của hồ sơ này được chuyển sang hồ sơ đích - tồn kho không đổi, mã cũ ghi vào")}
        {t("nhật ký.")}
      </p>

      {loai === "gan-etx" && (
        <div className="field-group">
          <label className="field-label">{t("Tìm trên danh bạ ETX (mã NS-…, họ tên, Gmail - gồm cả người đã nghỉ)")}</label>
          <input type="text" value={timEtx} onChange={(e) => setTimEtx(e.target.value)} placeholder={t("VD: NS-059 hoặc Phùng Thị Doanh")} autoFocus />
          {dsEtx.length > 0 && (
            <div className="task-table-wrapper">
              <table className="task-table">
                <tbody>
                  {dsEtx.map((e) => (
                    <tr key={e.ma_nhan_su} onClick={() => setMaEtx(e.ma_nhan_su)} style={{ cursor: "pointer" }} className={maEtx === e.ma_nhan_su ? "row-selected" : undefined}>
                      <td className="code-text">{e.ma_nhan_su}</td>
                      <td>
                        <div className="cell-stack">
                          <span className="strong">{e.ho_ten}</span>
                          <span className="small text-secondary">{[e.chuc_danh, e.gmail].filter(Boolean).join(" · ")}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge ${e.trang_thai_lam_viec === "on" ? "success" : "neutral"}`}>{e.trang_thai_lam_viec === "on" ? t("Đang làm") : t("Đã nghỉ")}</span>
                      </td>
                      <td className="small text-secondary">{e.ho_so_ma_nv ? t("Hồ sơ CCDC: {ho_so_ten} ({ho_so_ma_nv})", { ho_so_ten: e.ho_so_ten, ho_so_ma_nv: e.ho_so_ma_nv }) : t("Chưa có hồ sơ CCDC")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {maEtx && <div className="small">{t("Đã chọn:")} <b>{maEtx}</b></div>}
        </div>
      )}
      {loai === "gop" && (
        <div className="field-group">
          <label className="field-label">{t("Hồ sơ đích (giữ lại) - hồ sơ hiện tại sẽ bị gộp vào và xoá")}</label>
          <SearchSelect
            options={dsNv.filter((n) => n.ma_nv !== nv.ma_nv).map((n) => ({ value: n.ma_nv, label: `${n.ten_nv} (${n.ma_nv})` }))}
            value={dich}
            onChange={setDich}
            placeholder={t("Tìm theo họ tên hoặc mã...")}
          />
        </div>
      )}
      {loai === "doi-ma" && (
        <div className="field-group">
          <label className="field-label">{t("Mã nội bộ mới (nếu mã đã có hồ sơ khác sẽ thành gộp vào hồ sơ đó)")}</label>
          <input type="text" value={maMoi} onChange={(e) => setMaMoi(e.target.value)} placeholder={t("VD: thungoc.mn")} />
        </div>
      )}

      {keHoach && (
        <div className="content-card">
          <div className="card-header">
            <h3 className="card-title">
              {t("Xem trước:")} {THAO_TAC[keHoach.thaoTac] ?? keHoach.thaoTac} → {keHoach.taiCho ? t("gắn tại chỗ") : keHoach.dich ? `${keHoach.dich.ten_nv} (${keHoach.dich.ma_nv})` : t("hồ sơ mới {maDich}", { maDich: keHoach.maDich })}
            </h3>
          </div>
          <div className="small">
            {t("Kết quả:")} <b>{keHoach.ketQua.ten_nv}</b> {t("· mã")} {keHoach.maDich} · ETX {keHoach.ketQua.ma_etx ?? "-"} {t("· tài khoản")} {keHoach.ketQua.email_dang_nhap ?? "-"} ·{" "}
            {keHoach.ketQua.dang_lam_viec ? t("đang làm") : t("nghỉ việc")}
          </div>
          {keHoach.chuyen.length > 0 ? (
            <ul className="small">
              {keHoach.chuyen.map((c) => (
                <li key={c.nhan}>
                  {tS(c.nhan)}: <b>{fmtSo(c.so)}</b>
                </li>
              ))}
              {keHoach.kho.map((x) => (
                <li key={x.nguon.id}>
                  Kho QL “{x.nguon.ten_kho}{t("” (tồn tiêu hao")} {fmtSo(x.nguon.ton)}): {x.dich ? t("gộp vào “{ten_kho}”", { ten_kho: x.dich.ten_kho }) : t("chuyển chủ sang hồ sơ đích")}
                </li>
              ))}
            </ul>
          ) : (
            !keHoach.taiCho && <div className="small muted">{t("Hồ sơ này không có tài sản / phiếu nào cần chuyển.")}</div>
          )}
          {keHoach.xungDotEmail && (
            <div className="field-group">
              <label className="field-label">{t("Hai hồ sơ gắn 2 tài khoản khác nhau - 1 nhân sự chỉ giữ 1 tài khoản:")}</label>
              <label className="small">
                <input type="radio" checked={giuEmail === "dich"} onChange={() => setGiuEmail("dich")} /> {t("Giữ")} {keHoach.xungDotEmail.dich} {t("(hồ sơ đích)")}
              </label>
              <label className="small">
                <input type="radio" checked={giuEmail === "nguon"} onChange={() => setGiuEmail("nguon")} /> {t("Giữ")} {keHoach.xungDotEmail.nguon} {t("(hồ sơ này)")}
              </label>
            </div>
          )}
          {keHoach.canhBao.map((c) => (
            <div key={c} className="alert alert-warning">
              {tS(c)}
            </div>
          ))}
        </div>
      )}

      {loi && <div className="alert alert-error">{loi}</div>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          {t("Huỷ")}
        </button>
        {!keHoach ? (
          <button className="btn btn-primary" disabled={!body || busy} onClick={() => goi(true)}>
            {busy ? t("Đang kiểm tra...") : t("Xem trước")}
          </button>
        ) : (
          <button className="btn btn-primary" disabled={busy} onClick={() => goi(false)}>
            {busy ? t("Đang thực hiện...") : t("Xác nhận thực hiện")}
          </button>
        )}
      </div>

      {lichSu.length > 0 && (
        <div className="small muted">
          <b>{t("Nhật ký đổi mã:")}</b>
          {lichSu.map((h) => (
            <div key={h.id}>
              {fmtNgayGio(h.created_at)} · {THAO_TAC[h.thao_tac] ?? h.thao_tac}: {h.ten_nguon} ({h.ma_nguon}) → {h.ma_dich}
              {h.ma_etx ? ` [ETX ${h.ma_etx}]` : ""} · {h.nguoi_thuc_hien}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
