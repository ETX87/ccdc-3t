import { t, tS } from "../lib/i18n";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Download, Eye, Mail, MailCheck, Plus, Send, Users, X } from "lucide-react";
import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import { PhanTrang, useTrangKhach } from "../components/PhanTrang";
import { fmtNgayGio, fmtSo } from "../lib/format";
import { thongBaoLoi } from "../lib/nhan";

// Bao cao email dinh ky (Admin + HCNS, migration 0021): tai khoan Gmail gui, nguoi nhan, cong ty, tu dong toi thu 5 (20h VN),
// xem truoc dung email se gui + tai Excel dinh kem, gui ngay / gui thu cho minh, nhat ky gui. Backend routes/baoCaoEmail.ts.

interface CauHinh {
  nguoi_nhan: string[];
  cong_ty_ids: number[] | null;
  tu_dong: boolean;
  dinh_kem_excel: boolean;
  nguoi_cap_nhat: string | null;
  updated_at: string | null;
}
interface NhatKy {
  id: number;
  thoi_gian: string;
  kieu: "Tu dong" | "Thu cong";
  nguoi_gui: string | null;
  nguoi_nhan: string;
  tieu_de: string | null;
  ket_qua: "Thanh cong" | "Loi" | "Bo qua";
  loi: string | null;
}
interface DuLieu {
  cau_hinh: CauHinh;
  gmail: { connected: boolean; google_email?: string; authorized_by?: string | null; authorized_at?: string };
  lich: string;
  nhat_ky: NhatKy[];
  cong_ty: { id: number; ma: string; ten: string }[];
  ky_mac_dinh: { tu: string; den: string };
}

const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
const KET_QUA: Record<NhatKy["ket_qua"], { nhan: string; tone: "success" | "danger" | "neutral" }> = {
  "Thanh cong": { nhan: t("Đã gửi"), tone: "success" },
  Loi: { nhan: t("Lỗi"), tone: "danger" },
  "Bo qua": { nhan: t("Bỏ qua"), tone: "neutral" },
};

/** Loi gui: uu tien noi dung server (Gmail tra ve) de Admin biet sai o dau. */
const loiGui = (e: unknown) => {
  const err = e as ApiError;
  return err?.detail ? `${thongBaoLoi(e)} (${err.detail})` : thongBaoLoi(e);
};

export function BaoCaoEmailScreen() {
  const auth = useAuth();
  const toi = auth.status === "authenticated" ? auth.user.email : "";
  const [data, setData] = useState<DuLieu | null>(null);
  const [ch, setCh] = useState<CauHinh | null>(null);
  const [nhap, setNhap] = useState("");
  const [goiY, setGoiY] = useState<{ email: string; ten: string | null }[]>([]);
  const [ky, setKy] = useState<{ tu: string; den: string } | null>(null);
  const [khoaXem, setKhoaXem] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dangTai, setDangTai] = useState(false);
  const [xacNhanGui, setXacNhanGui] = useState(false);
  const [ngatGmail, setNgatGmail] = useState(false);

  const load = useCallback(async () => {
    setDangTai(true);
    try {
      const d = await api.get<DuLieu>("/bao-cao-email/cau-hinh");
      setData(d);
      setCh(d.cau_hinh);
      setKy((k) => k ?? d.ky_mac_dinh);
    } catch (e) {
      setLoi(thongBaoLoi(e, t("Không tải được cấu hình báo cáo.")));
    } finally {
      setDangTai(false);
    }
  }, []);
  useEffect(() => {
    load();
    api
      .get<{ rows: { email: string; ten: string | null; trang_thai_duyet: string; bi_khoa: number }[] }>("/admin/users?tab=tat-ca")
      .then((r) => setGoiY(r.rows.filter((u) => u.trang_thai_duyet === "Da duyet" && !u.bi_khoa)))
      .catch(() => setGoiY([]));
  }, [load]);

  const doi = useMemo(() => !!data && !!ch && JSON.stringify(ch) !== JSON.stringify(data.cau_hinh), [ch, data]);
  const nhatKy = useTrangKhach(data?.nhat_ky ?? [], []);
  const lanCuoi = data?.nhat_ky.find((x) => x.ket_qua === "Thanh cong");
  const urlKy = ky ? `tu=${ky.tu}&den=${ky.den}` : "";

  function themEmail() {
    if (!ch) return;
    const ds = nhap
      .split(/[\s,;]+/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
    const sai = ds.filter((x) => !EMAIL_RE.test(x));
    if (sai.length) return setLoi(t("Email không hợp lệ: {ds}", { ds: sai.join(", ") }));
    setLoi(null);
    setCh({ ...ch, nguoi_nhan: [...new Set([...ch.nguoi_nhan, ...ds])] });
    setNhap("");
  }

  async function luu() {
    if (!ch) return;
    setBusy(true);
    setLoi(null);
    try {
      await api.put("/bao-cao-email/cau-hinh", ch);
      setMsg(t("Đã lưu cấu hình báo cáo email."));
      await load();
      setKhoaXem((k) => k + 1);
    } catch (e) {
      setLoi(thongBaoLoi(e));
    } finally {
      setBusy(false);
    }
  }

  async function gui(chiChoToi: boolean) {
    setXacNhanGui(false);
    setBusy(true);
    setLoi(null);
    setMsg(null);
    try {
      const r = await api.post<{ tieu_de: string; nguoi_nhan: string[] }>("/bao-cao-email/gui", { ...ky, nguoi_nhan: chiChoToi ? [toi] : undefined });
      setMsg(t("Đã gửi \"{tieu_de}\" tới {n} người nhận.", { tieu_de: r.tieu_de, n: r.nguoi_nhan.length }));
    } catch (e) {
      setLoi(loiGui(e));
    } finally {
      setBusy(false);
      load();
    }
  }

  async function boKetNoi() {
    setNgatGmail(false);
    try {
      await api.delete("/settings/gmail");
      await load();
    } catch (e) {
      setLoi(thongBaoLoi(e));
    }
  }

  const gm = data?.gmail;
  const chonCt = (id: number, bat: boolean) => {
    if (!ch || !data) return;
    const hienTai = ch.cong_ty_ids ?? data.cong_ty.map((c) => c.id);
    const moi = bat ? [...new Set([...hienTai, id])] : hienTai.filter((x) => x !== id);
    setCh({ ...ch, cong_ty_ids: moi.length === data.cong_ty.length ? null : moi });
  };

  return (
    <div className="dashboard-container">
      <PageHeader
        title={t("Báo cáo email định kỳ")}
        actions={
          <>
            <a className="btn btn-outline" href={`/api/bao-cao-email/excel?${urlKy}`}>
              <Download size={14} /> {t("Tải Excel")}
            </a>
            <button className="btn btn-outline" disabled={busy || !gm?.connected} onClick={() => gui(true)} title={t("Gửi thử báo cáo cho riêng bạn ({email})", { email: toi })}>
              <MailCheck size={14} /> {t("Gửi thử cho tôi")}
            </button>
            <button className="btn btn-primary" disabled={busy || !gm?.connected || !data?.cau_hinh.nguoi_nhan.length || doi} onClick={() => setXacNhanGui(true)}>
              <Send size={14} /> {t("Gửi ngay")}
            </button>
          </>
        }
        capNhatLuc={null}
        onRefresh={load}
        dangTai={dangTai}
      />

      <div className="kpi-grid kpi-grid-4">
        <KpiCard
          tone={gm?.connected ? "cyan" : "yellow"}
          icon={<Mail size={20} className="text-white" />}
          watermark={<Mail size={52} />}
          label={t("Tài khoản gửi")}
          value={gm?.connected ? t("Đã kết nối") : t("Chưa kết nối")}
          trend={<div className="kpi-trend"><span className="trend-sub">{gm?.google_email ?? t("Kết nối Gmail để gửi báo cáo")}</span></div>}
        />
        <KpiCard
          tone="blue"
          icon={<Users size={20} className="text-white" />}
          watermark={<Users size={52} />}
          label={t("Người nhận")}
          value={fmtSo(data?.cau_hinh.nguoi_nhan.length ?? 0)}
          trend={<div className="kpi-trend"><span className="trend-sub">{data?.cau_hinh.cong_ty_ids ? t("{n} công ty", { n: data.cau_hinh.cong_ty_ids.length }) : t("Tất cả công ty")}</span></div>}
        />
        <KpiCard
          tone={data?.cau_hinh.tu_dong ? "purple" : "blue-light"}
          icon={<CalendarClock size={20} className="text-white" />}
          watermark={<CalendarClock size={52} />}
          label={t("Gửi tự động")}
          value={data?.cau_hinh.tu_dong ? t("Đang bật") : t("Đang tắt")}
          trend={<div className="kpi-trend"><span className="trend-sub">{tS(data?.lich ?? "")}</span></div>}
        />
        <KpiCard
          tone={data?.nhat_ky[0]?.ket_qua === "Loi" ? "red" : "blue-light"}
          icon={<Send size={20} className="text-white" />}
          watermark={<Send size={52} />}
          label={t("Lần gửi gần nhất")}
          value={lanCuoi ? fmtNgayGio(lanCuoi.thoi_gian) : t("Chưa gửi")}
          trend={
            <div className={`kpi-trend ${data?.nhat_ky[0]?.ket_qua === "Loi" ? "trend-warning" : ""}`}>
              <span className="trend-sub">{data?.nhat_ky[0]?.ket_qua === "Loi" ? t("Lần gần nhất bị lỗi - xem nhật ký") : lanCuoi ? KET_QUA[lanCuoi.ket_qua].nhan : "-"}</span>
            </div>
          }
        />
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}
      {loi && <div className="alert alert-error">{loi}</div>}

      <div className="split-grid">
        <div className="content-card">
          <div className="card-header" style={{ marginBottom: 8 }}>
            <div className="card-title-wrap">
              <Mail size={16} className="card-title-icon text-teal" />
              <span className="card-title">{t("Tài khoản Gmail gửi báo cáo")}</span>
            </div>
          </div>
          {gm && (
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
              {gm.connected ? (
                <>
                  <b>{gm.google_email}</b> {t("· kết nối bởi")} {gm.authorized_by ?? "—"} {t("lúc")} {fmtNgayGio(gm.authorized_at ?? null)}
                </>
              ) : (
                t("Chưa kết nối. Bấm \"Kết nối Gmail\" và chọn hộp thư công ty dùng để gửi báo cáo (chỉ xin quyền gửi thư, không đọc hộp thư).")
              )}
            </div>
          )}
          <div className="row-actions" style={{ justifyContent: "flex-start", marginBottom: 16 }}>
            <a className="btn btn-outline btn-sm" href="/api/settings/gmail/authorize">
              {gm?.connected ? t("Kết nối lại / đổi tài khoản") : t("Kết nối Gmail")}
            </a>
            {gm?.connected && (
              <button className="btn btn-outline btn-sm danger-outline" onClick={() => setNgatGmail(true)}>
                {t("Ngắt kết nối")}
              </button>
            )}
          </div>

          {ch && data && (
            <>
              <div className="field-group">
                <label className="field-label">{t("Người nhận ({n})", { n: ch.nguoi_nhan.length })}</label>
                <div className="chip-list" style={{ marginBottom: 6 }}>
                  {ch.nguoi_nhan.length === 0 && <span className="muted small">{t("Chưa có người nhận.")}</span>}
                  {ch.nguoi_nhan.map((e) => (
                    <span key={e} className="chip">
                      {e}
                      <button type="button" className="chip-remove" title={t("Bỏ người nhận")} onClick={() => setCh({ ...ch, nguoi_nhan: ch.nguoi_nhan.filter((x) => x !== e) })}>
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
                <form
                  className="inline-form"
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    themEmail();
                  }}
                >
                  <input type="text" list="bc-email-goi-y" value={nhap} placeholder={t("email@congty.com (nhiều email cách nhau dấu phẩy)")} onChange={(e) => setNhap(e.target.value)} />
                  <datalist id="bc-email-goi-y">
                    {goiY.map((u) => (
                      <option key={u.email} value={u.email}>
                        {u.ten ?? ""}
                      </option>
                    ))}
                  </datalist>
                  <button type="submit" className="btn btn-outline btn-sm" disabled={!nhap.trim()}>
                    <Plus size={13} /> {t("Thêm")}
                  </button>
                </form>
              </div>

              {data.cong_ty.length > 1 && (
                <div className="field-group">
                  <label className="field-label">{t("Công ty trong báo cáo")}</label>
                  {data.cong_ty.map((c) => (
                    <label key={c.id} className="check-label" style={{ marginRight: 14 }}>
                      <input type="checkbox" checked={!ch.cong_ty_ids || ch.cong_ty_ids.includes(c.id)} onChange={(e) => chonCt(c.id, e.target.checked)} />
                      {c.ma} - {c.ten}
                    </label>
                  ))}
                </div>
              )}

              <div className="field-group">
                <label className="check-label">
                  <input type="checkbox" checked={ch.tu_dong} onChange={(e) => setCh({ ...ch, tu_dong: e.target.checked })} />
                  {t("Tự động gửi: {lich}", { lich: tS(data.lich) })}
                </label>
                <label className="check-label">
                  <input type="checkbox" checked={ch.dinh_kem_excel} onChange={(e) => setCh({ ...ch, dinh_kem_excel: e.target.checked })} />
                  {t("Đính kèm file Excel (bảng phẳng để nhập sang hệ thống khác)")}
                </label>
              </div>
              {data.cau_hinh.updated_at && (
                <div className="field-hint" style={{ marginBottom: 8 }}>
                  {t("Cập nhật lần cuối {luc} bởi {nguoi}", { luc: fmtNgayGio(data.cau_hinh.updated_at), nguoi: data.cau_hinh.nguoi_cap_nhat ?? "—" })}
                </div>
              )}
              <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
                <button className="btn btn-primary" disabled={busy || !doi} onClick={luu}>
                  {busy ? t("Đang lưu...") : t("Lưu cấu hình")}
                </button>
                {doi && (
                  <button className="btn" onClick={() => setCh(data.cau_hinh)}>
                    {t("Huỷ thay đổi")}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="content-card">
          <div className="card-header" style={{ marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
            <div className="card-title-wrap">
              <Eye size={16} className="card-title-icon text-teal" />
              <span className="card-title">{t("Xem trước email")}</span>
            </div>
            {ky && (
              <div className="row-actions">
                <label className="muted small">{t("Từ")}</label>
                <input type="date" value={ky.tu} max={ky.den} onChange={(e) => e.target.value && setKy({ ...ky, tu: e.target.value })} />
                <label className="muted small">{t("Đến")}</label>
                <input type="date" value={ky.den} min={ky.tu} onChange={(e) => e.target.value && setKy({ ...ky, den: e.target.value })} />
              </div>
            )}
          </div>
          <div className="field-hint" style={{ marginBottom: 8 }}>
            {t("Kỳ mặc định = 7 ngày gần nhất (email tự động tối thứ 5 dùng kỳ này). Chọn kỳ khác để xem / gửi thủ công.")}
          </div>
          {ky && (
            <iframe
              key={`${urlKy}:${khoaXem}`}
              title={t("Xem trước email")}
              src={`/api/bao-cao-email/xem-truoc?${urlKy}`}
              style={{ width: "100%", height: 720, border: "1px solid #F1F5F9", borderRadius: 12, background: "#F7FBFE" }}
            />
          )}
        </div>
      </div>

      <div className="content-card task-card-full">
        <div className="card-header" style={{ marginBottom: 6 }}>
          <div className="card-title-wrap">
            <Send size={16} className="card-title-icon text-teal" />
            <span className="card-title">{t("Nhật ký gửi")}</span>
          </div>
        </div>
        <div className="task-table-wrapper">
          <table className="task-table">
            <thead>
              <tr>
                <th style={{ width: "14%" }}>{t("Thời gian")}</th>
                <th style={{ width: "12%" }}>{t("Kiểu")}</th>
                <th>{t("Tiêu đề")}</th>
                <th style={{ width: "24%" }}>{t("Người nhận")}</th>
                <th style={{ width: "16%" }}>{t("Kết quả")}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.nhat_ky.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={5} className="task-empty">
                    {t("Chưa gửi báo cáo nào.")}
                  </td>
                </tr>
              )}
              {nhatKy.dongTrang.map((x) => (
                <tr key={x.id} className={x.ket_qua === "Loi" ? "row-canh-bao" : ""}>
                  <td data-label={t("Thời gian")}>{fmtNgayGio(x.thoi_gian)}</td>
                  <td data-label={t("Kiểu")}>
                    {x.kieu === "Tu dong" ? t("Tự động") : t("Thủ công")}
                    {x.nguoi_gui && <div className="muted small">{x.nguoi_gui}</div>}
                  </td>
                  <td data-label={t("Tiêu đề")}>{x.tieu_de ?? "-"}</td>
                  <td data-label={t("Người nhận")} className="muted small">
                    {x.nguoi_nhan || "-"}
                  </td>
                  <td data-label={t("Kết quả")}>
                    <StatusBadge label={KET_QUA[x.ket_qua].nhan} tone={KET_QUA[x.ket_qua].tone} />
                    {x.loi && <div className="muted small">{tS(x.loi)}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PhanTrang trang={nhatKy.trang} tong={nhatKy.tong} onDoi={nhatKy.setTrang} donVi={t("lần gửi")} />
      </div>

      {xacNhanGui && data && (
        <Modal title={t("Gửi báo cáo ngay")} onClose={() => setXacNhanGui(false)}>
          <p>{t("Gửi báo cáo kỳ {tu} – {den} tới {n} người nhận: {ds}?", { tu: fmtNgayGio(ky?.tu ?? null, false), den: fmtNgayGio(ky?.den ?? null, false), n: data.cau_hinh.nguoi_nhan.length, ds: data.cau_hinh.nguoi_nhan.join(", ") })}</p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setXacNhanGui(false)}>
              {t("Huỷ")}
            </button>
            <button className="btn btn-primary" onClick={() => gui(false)}>
              <Send size={14} /> {t("Gửi")}
            </button>
          </div>
        </Modal>
      )}
      {ngatGmail && (
        <Modal title={t("Ngắt kết nối Gmail")} onClose={() => setNgatGmail(false)}>
          <p>{t("Ngắt kết nối tài khoản {email}? Báo cáo tự động sẽ không gửi được tới khi kết nối lại.", { email: gm?.google_email ?? "" })}</p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setNgatGmail(false)}>
              {t("Huỷ")}
            </button>
            <button className="btn btn-danger" onClick={boKetNoi}>
              {t("Ngắt kết nối")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
