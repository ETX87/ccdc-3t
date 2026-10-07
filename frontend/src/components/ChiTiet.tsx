import { t, tS } from "../lib/i18n";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Modal } from "./Modal";
import { DinhKem } from "./DinhKem";
import { StatusBadge } from "./StatusBadge";
import { useDuLieuChung, type ViecRow } from "../lib/duLieuChung";
import { useNav } from "../lib/navigation";
import { baoThayDoi } from "../lib/suKien";
import { inTemQr } from "../lib/inTem";
import { fmtGiaTri, fmtNgay, fmtNgayGio, fmtSo } from "../lib/format";
import {
  isHcns,
  isKeToan,
  LOAI_GIAO_NHAN,
  LOAI_PHIEU_CK,
  LOAI_XU_LY,
  thongBaoLoi,
  TINH_TRANG_KIEM_KE,
  TINH_TRANG_TS,
  TRANG_THAI_CK,
  TRANG_THAI_TS,
  TRANG_THAI_XU_LY,
  type Tone,
} from "../lib/nhan";
import type { AppUser } from "../types";

// Popup chi tiet dung chung toan app: mo tu ma phieu / ma tai san o bat ky dau (tim kiem, chuong, bang
// viec, canh bao, quet QR). Nut thao tac chi hien khi nguoi dung dung vai tro; server van kiem lai.

export type LoaiPhieu = "chuyen_kho" | "giao_nhan" | "xu_ly";

type Dang = { kind: "phieu"; loai: LoaiPhieu; id: string } | { kind: "tai_san"; id: string } | null;

interface ChiTietApi {
  moPhieu: (loai: LoaiPhieu, id: string) => void;
  moTaiSan: (id: string) => void;
}

const Ctx = createContext<ChiTietApi | null>(null);

export function useChiTiet() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useChiTiet phai dung trong ChiTietProvider");
  return ctx;
}

export function ChiTietProvider({ children }: { children: ReactNode }) {
  const [dang, setDang] = useState<Dang>(null);
  const moPhieu = useCallback((loai: LoaiPhieu, id: string) => setDang({ kind: "phieu", loai, id }), []);
  const moTaiSan = useCallback((id: string) => setDang({ kind: "tai_san", id }), []);
  const dong = useCallback(() => setDang(null), []);
  return (
    <Ctx.Provider value={{ moPhieu, moTaiSan }}>
      {children}
      {dang?.kind === "phieu" && <PhieuModal loai={dang.loai} id={dang.id} onClose={dong} />}
      {dang?.kind === "tai_san" && <TaiSanModal id={dang.id} onClose={dong} />}
    </Ctx.Provider>
  );
}

// ---------------------------------------------------------------------------------------------
type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

function ThongTin({ items }: { items: [string, ReactNode][] }) {
  return (
    <div className="info-grid">
      {items
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => (
          <div key={k} className="info-item">
            <div className="info-label">{k}</div>
            <div className="info-value">{v}</div>
          </div>
        ))}
    </div>
  );
}

function NhatKy({ log, nhan }: { log: Row[]; nhan: Record<string, { label: string }> }) {
  if (!log.length) return null;
  return (
    <>
      <div className="section-title" style={{ marginTop: 14 }}>
        {t("Nhật ký xử lý")}
      </div>
      <div className="timeline">
        {log.map((l, i) => (
          <div key={i} className="timeline-row">
            <span className="timeline-dot" />
            <div>
              <div className="strong">{nhan[s(l.trang_thai)]?.label ?? s(l.trang_thai)}</div>
              <div className="muted small">
                {fmtNgayGio(s(l.ngay_xu_ly))} · {s(l.nguoi_xu_ly)}
                {l.ghi_chu ? ` · ${tS(s(l.ghi_chu))}` : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

interface HanhDong {
  key: string;
  nhan: string;
  kieu: "primary" | "danger" | "outline";
  /** Bat buoc nhap ly do/ghi chu truoc khi gui. */
  canLyDo?: string;
  canGiaTri?: boolean;
  path: string;
}

function tinhHanhDong(loai: LoaiPhieu, row: Row, user: AppUser): HanhDong[] {
  const khoCuaToi = new Set(user.kho_phu_trach.map((k) => k.id));
  const id = encodeURIComponent(s(row.id));
  const ds: HanhDong[] = [];
  if (loai === "chuyen_kho") {
    const base = `/phieu-chuyen-kho/${id}`;
    if (row.trang_thai === "Cho ke toan duyet" && isKeToan(user)) {
      ds.push({ key: "duyet", nhan: t("Duyệt"), kieu: "primary", path: `${base}/ke-toan-duyet` });
      ds.push({ key: "tu-choi", nhan: t("Từ chối"), kieu: "danger", canLyDo: t("Lý do từ chối"), path: `${base}/ke-toan-tu-choi` });
    }
    if (row.trang_thai === "Dang chuyen") {
      if (khoCuaToi.has(n(row.den_kho_id))) {
        ds.push({ key: "nhan", nhan: t("Xác nhận đã nhận"), kieu: "primary", path: `${base}/nhan` });
        ds.push({ key: "tu-choi-nhan", nhan: t("Từ chối nhận"), kieu: "danger", canLyDo: t("Lý do từ chối nhận"), path: `${base}/tu-choi-nhan` });
      } else if (khoCuaToi.has(n(row.tu_kho_id))) {
        ds.push({ key: "nhan-ho", nhan: t("Xác nhận hộ kho nhận"), kieu: "outline", canLyDo: t("Ghi chú lý do xác nhận hộ"), path: `${base}/nhan` });
      }
    }
    if (row.loai === "Cap phat NV" && row.trang_thai === "Da giao" && !n(row.da_xac_nhan) && user.ma_nv && row.den_nhan_vien_id === user.ma_nv) {
      ds.push({ key: "xac-nhan", nhan: t("Xác nhận đã nhận"), kieu: "primary", path: `${base}/xac-nhan` });
    }
  } else if (loai === "giao_nhan") {
    if (!n(row.da_xac_nhan)) {
      const nhanNV =
        (row.loai_phieu === "Cap phat" && row.nhan_vien_id === user.ma_nv) || (row.loai_phieu === "Dieu chuyen" && row.nhan_vien_nhan_moi_id === user.ma_nv);
      const nhanKho = (row.loai_phieu === "Thu hoi" || row.loai_phieu === "Chuyen kho") && khoCuaToi.has(n(row.den_kho_id));
      if ((nhanNV && user.ma_nv) || nhanKho)
        ds.push({ key: "xac-nhan", nhan: t("Xác nhận đã nhận"), kieu: "primary", path: `/phieu-giao-nhan/${id}/xac-nhan` });
    }
  } else {
    const base = `/phieu-xu-ly-ts/${id}`;
    if (row.trang_thai === "Cho ke toan duyet" && isKeToan(user)) {
      ds.push({ key: "duyet", nhan: t("Duyệt"), kieu: "primary", path: `${base}/ke-toan-duyet` });
      ds.push({ key: "tu-choi", nhan: t("Từ chối"), kieu: "danger", canLyDo: t("Lý do từ chối"), path: `${base}/ke-toan-tu-choi` });
    }
    if (row.trang_thai === "Da duyet" && isHcns(user) && (row.loai === "Thanh ly" || row.loai === "Tieu huy")) {
      ds.push({
        key: "hoan-tat",
        nhan: row.loai === "Thanh ly" ? t("Hoàn tất thanh lý") : t("Hoàn tất tiêu hủy"),
        kieu: "primary",
        canGiaTri: row.loai === "Thanh ly",
        path: `${base}/hoan-tat`,
      });
    }
  }
  return ds;
}

function ThanhHanhDong({ ds, onDone }: { ds: HanhDong[]; onDone: () => void }) {
  const { reload } = useDuLieuChung();
  const [chon, setChon] = useState<HanhDong | null>(null);
  const [ghiChu, setGhiChu] = useState("");
  const [giaTri, setGiaTri] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!ds.length) return null;

  async function gui(h: HanhDong) {
    if (h.canLyDo && !ghiChu.trim()) {
      setErr(t("Vui lòng nhập {x}.", { x: h.canLyDo.toLowerCase() }));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = { ghi_chu: ghiChu.trim() || undefined };
      if (h.canGiaTri && giaTri !== "") body.gia_tri_thu_hoi = Number(giaTri);
      await api.post(h.path, body);
      baoThayDoi();
      await reload();
      onDone();
    } catch (e) {
      setErr(thongBaoLoi(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="action-panel">
      {err && <div className="alert alert-error">{err}</div>}
      {chon && (chon.canLyDo || chon.canGiaTri) && (
        <div className="form-grid">
          {chon.canGiaTri && (
            <div className="field-group">
              <label className="field-label">{t("Giá trị thu hồi (đ)")}</label>
              <input type="number" min={0} value={giaTri} onChange={(e) => setGiaTri(e.target.value)} placeholder="0" />
            </div>
          )}
          <div className="field-group" style={{ gridColumn: chon.canGiaTri ? undefined : "1 / -1" }}>
            <label className="field-label">{chon.canLyDo ?? t("Ghi chú")}</label>
            <input type="text" value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} autoFocus />
          </div>
        </div>
      )}
      <div className="modal-actions" style={{ marginTop: 4 }}>
        {chon ? (
          <>
            <button type="button" className="btn" onClick={() => setChon(null)} disabled={busy}>
              {t("Quay lại")}
            </button>
            <button type="button" className={`btn ${chon.kieu === "danger" ? "btn-danger" : "btn-primary"}`} onClick={() => gui(chon)} disabled={busy}>
              {busy ? t("Đang gửi…") : t("Xác nhận: {nhan}", { nhan: chon.nhan })}
            </button>
          </>
        ) : (
          ds.map((h) => (
            <button
              key={h.key}
              type="button"
              className={`btn ${h.kieu === "primary" ? "btn-primary" : h.kieu === "danger" ? "btn-danger" : "btn-outline"}`}
              disabled={busy}
              onClick={() => (h.canLyDo || h.canGiaTri ? (setChon(h), setGhiChu(""), setErr(null)) : gui(h))}
            >
              {h.nhan}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function PhieuModal({ loai, id, onClose }: { loai: LoaiPhieu; id: string; onClose: () => void }) {
  const auth = useAuth();
  const { moTaiSan } = useChiTiet();
  const [data, setData] = useState<{ row: Row; items: Row[]; log?: Row[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const url = { chuyen_kho: "/phieu-chuyen-kho/", giao_nhan: "/phieu-giao-nhan/", xu_ly: "/phieu-xu-ly-ts/" }[loai] + encodeURIComponent(id);

  const load = useCallback(() => {
    api
      .get<{ row: Row; items: Row[]; log?: Row[] }>(url)
      .then(setData)
      .catch((e) => setErr(thongBaoLoi(e, t("Không tải được phiếu."))));
  }, [url]);
  useEffect(load, [load]);

  const user = auth.status === "authenticated" ? auth.user : null;
  const row = data?.row;
  let tieuDe = t("Phiếu");
  let trangThai: { label: string; tone: Tone } | null = null;
  let info: [string, ReactNode][] = [];
  if (row) {
    const ma = s(row.ma_phieu) || s(row.id);
    if (loai === "chuyen_kho") {
      tieuDe = `${LOAI_PHIEU_CK[s(row.loai)] ?? s(row.loai)} · ${ma}`;
      trangThai = TRANG_THAI_CK[s(row.trang_thai)] ?? { label: s(row.trang_thai), tone: "neutral" };
      info = [
        [t("Từ kho"), s(row.tu_kho_ten)],
        [t("Đến"), s(row.den_kho_ten) || s(row.den_nhan_vien_ten) || s(row.nguoi_nhan_ten_tu_do)],
        [t("Nhà cung cấp"), s(row.nha_cung_cap)],
        [t("Người lập"), s(row.nguoi_lap)],
        [t("Ngày lập"), fmtNgayGio(s(row.created_at))],
        [t("NV xác nhận"), row.loai === "Cap phat NV" ? (n(row.da_xac_nhan) ? t("Đã xác nhận {x}", { x: fmtNgayGio(s(row.xac_nhan_luc)) }) : t("Chưa xác nhận")) : ""],
        [t("Ghi chú"), s(row.ghi_chu)],
      ];
    } else if (loai === "giao_nhan") {
      tieuDe = t("{x} TSCĐ · {ma}", { x: LOAI_GIAO_NHAN[s(row.loai_phieu)] ?? s(row.loai_phieu), ma });
      trangThai = n(row.da_xac_nhan) ? { label: t("Đã xác nhận"), tone: "success" } : { label: t("Chờ xác nhận"), tone: "warning" };
      info = [
        [t("Từ"), s(row.tu_kho_ten) || s(row.nhan_vien_ten)],
        [t("Đến"), s(row.den_kho_ten) || s(row.nhan_vien_nhan_moi_ten) || (row.loai_phieu === "Cap phat" ? s(row.nhan_vien_ten) : "")],
        [t("Người lập"), s(row.nguoi_lap)],
        [t("Ngày lập"), fmtNgayGio(s(row.ngay_lap))],
        [t("Xác nhận lúc"), n(row.da_xac_nhan) ? fmtNgayGio(s(row.xac_nhan_luc)) : ""],
        [t("Ghi chú"), s(row.ghi_chu)],
      ];
    } else {
      tieuDe = `${LOAI_XU_LY[s(row.loai)] ?? s(row.loai)} · ${ma}`;
      trangThai = TRANG_THAI_XU_LY[s(row.trang_thai)] ?? { label: s(row.trang_thai), tone: "neutral" };
      info = [
        [t("Lý do"), s(row.ly_do)],
        [t("Người đề xuất"), s(row.nguoi_de_xuat)],
        [t("Ngày đề xuất"), fmtNgayGio(s(row.ngay_de_xuat))],
        [t("Giá trị thu hồi"), row.gia_tri_thu_hoi != null ? fmtGiaTri(n(row.gia_tri_thu_hoi)) : ""],
        [t("Ghi chú"), s(row.ghi_chu)],
      ];
    }
  }

  const items = data?.items ?? [];
  return (
    <Modal
      size="lg"
      onClose={onClose}
      title={
        <span className="title-with-badge">
          {tieuDe} {trangThai && <StatusBadge label={trangThai.label} tone={trangThai.tone} />}
        </span>
      }
    >
      {err && <div className="alert alert-error">{err}</div>}
      {!data && !err && <div className="empty-state">{t("Đang tải…")}</div>}
      {row && (
        <>
          <ThongTin items={info} />
          <div className="section-title" style={{ marginTop: 14 }}>
            {loai === "chuyen_kho" ? t("Vật tư") : t("Tài sản")} ({items.length})
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                {loai === "chuyen_kho" ? (
                  <tr>
                    <th>{t("Mã")}</th>
                    <th>{t("Tên vật tư")}</th>
                    <th className="num">{t("Số lượng")}</th>
                    <th className="num">{t("Đơn giá")}</th>
                    <th className="num">{t("Thành tiền")}</th>
                  </tr>
                ) : (
                  <tr>
                    <th>{t("Mã tài sản")}</th>
                    <th>{t("Tên tài sản")}</th>
                    <th>{loai === "xu_ly" ? t("Trạng thái hiện tại") : t("Tình trạng ghi nhận")}</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {items.map((it, i) =>
                  loai === "chuyen_kho" ? (
                    <tr key={i}>
                      <td>{s(it.vt_id)}</td>
                      <td>{s(it.ten_vt)}</td>
                      <td className="num">
                        {fmtSo(n(it.so_luong), 2)} {s(it.don_vi_tinh)}
                      </td>
                      <td className="num">{it.don_gia != null ? fmtSo(n(it.don_gia)) : "-"}</td>
                      <td className="num">{it.thanh_tien != null ? fmtSo(n(it.thanh_tien)) : "-"}</td>
                    </tr>
                  ) : (
                    <tr key={i}>
                      <td>
                        <span className="code-link" onClick={() => moTaiSan(s(it.ccdc_id))}>
                          {s(it.ccdc_id)}
                        </span>
                      </td>
                      <td>{s(it.ten_ccdc)}</td>
                      <td>
                        {loai === "xu_ly"
                          ? (TRANG_THAI_TS[s(it.trang_thai_hien_tai)]?.label ?? s(it.trang_thai_hien_tai))
                          : s(it.tinh_trang_ghi_nhan) || "-"}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          <DinhKem doiTuong={loai} id={id} nhacHoaDon={row.loai === "Nhap mua"} />
          {data.log && <NhatKy log={data.log} nhan={loai === "chuyen_kho" ? TRANG_THAI_CK : TRANG_THAI_XU_LY} />}
          {user && <ThanhHanhDong ds={tinhHanhDong(loai, row, user)} onDone={load} />}
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
function TaiSanModal({ id, onClose }: { id: string; onClose: () => void }) {
  const auth = useAuth();
  const { moPhieu } = useChiTiet();
  const { reload } = useDuLieuChung();
  const user = auth.status === "authenticated" ? auth.user : null;
  const [data, setData] = useState<{ row: Row; lich_su: Row[]; xu_ly: Row[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [form, setForm] = useState<"bao-hong" | "kiem-ke" | "thanh-ly" | null>(null);
  const [loaiXuLy, setLoaiXuLy] = useState<"Thanh ly" | "Tieu huy">("Thanh ly");
  const [lyDo, setLyDo] = useState("");
  const [dotKiemKe, setDotKiemKe] = useState<Row[]>([]);
  const [kk, setKk] = useState({ dot: "", tinh_trang: "Dung vi tri", ghi_chu: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get<{ row: Row; lich_su: Row[]; xu_ly: Row[] }>(`/ccdc/${encodeURIComponent(id)}`)
      .then(setData)
      .catch((e) => setErr((e as { status?: number }).status === 404 ? t("Không tìm thấy tài sản có mã \"{id}\".", { id }) : thongBaoLoi(e, t("Không tải được tài sản."))));
  }, [id]);
  useEffect(load, [load]);
  useEffect(() => {
    import("qrcode").then((Q) => Q.toDataURL(id, { margin: 1, width: 160 })).then(setQr).catch(() => setQr(null));
  }, [id]);
  useEffect(() => {
    if (user && isHcns(user))
      api
        .get<{ rows: Row[] }>("/dot-kiem-ke")
        .then((r) => {
          const dang = r.rows.filter((d) => d.trang_thai === "Dang thuc hien");
          setDotKiemKe(dang);
          if (dang[0]) setKk((k) => ({ ...k, dot: s(dang[0].id) }));
        })
        .catch(() => setDotKiemKe([]));
  }, [user]);

  const row = data?.row;
  const tt = row ? (TRANG_THAI_TS[s(row.trang_thai_hien_tai)] ?? { label: s(row.trang_thai_hien_tai), tone: "neutral" as Tone }) : null;
  const coTheBaoHong = !!row && ["Trong kho", "Dang cap phat", "Dang bao tri"].includes(s(row.trang_thai_hien_tai));
  const laHC = !!user && isHcns(user);
  // Thanh ly / tieu huy: chi TS dang nam trong kho (da thu hoi), khong co nguoi giu (quy tac server).
  const coTheThanhLy = laHC && !!row && ["Trong kho", "Hong"].includes(s(row.trang_thai_hien_tai)) && !row.nguoi_dang_giu;

  async function gui(fn: () => Promise<unknown>, thanhCong: string) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      setMsg(thanhCong);
      setForm(null);
      baoThayDoi();
      await reload();
      load();
    } catch (e) {
      setErr(thongBaoLoi(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      size="lg"
      onClose={onClose}
      title={
        <span className="title-with-badge">
          {t("Tài sản")} {id} {tt && <StatusBadge label={tt.label} tone={tt.tone} />}
        </span>
      }
    >
      {err && <div className="alert alert-error">{err}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}
      {!data && !err && <div className="empty-state">{t("Đang tải…")}</div>}
      {row && (
        <>
          <div className="asset-head">
            {qr && <img src={qr} alt={`QR ${id}`} className="asset-qr" />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="asset-name">{s(row.ten_ccdc)}</div>
              <ThongTin
                items={[
                  [t("Nhóm"), s(row.ten_nhom)],
                  [t("Vị trí"), s(row.nguoi_dang_giu_ten) ? t("Đang giữ: {x}", { x: s(row.nguoi_dang_giu_ten) }) : s(row.ten_kho)],
                  [t("Nguyên giá"), row.nguyen_gia != null ? t("{x}đ", { x: fmtSo(n(row.nguyen_gia)) }) : ""],
                  [t("Tình trạng"), TINH_TRANG_TS[s(row.tinh_trang)] ?? s(row.tinh_trang)],
                  [t("Số seri"), s(row.so_seri)],
                  [t("Ngày mua"), s(row.ngay_mua) ? fmtNgay(s(row.ngay_mua)) : ""],
                  [t("Nhà cung cấp"), s(row.nha_cung_cap)],
                  [t("Hạn bảo hành"), s(row.han_bao_hanh) ? fmtNgay(s(row.han_bao_hanh)) : ""],
                  [t("Ghi chú"), s(row.ghi_chu)],
                ]}
              />
            </div>
          </div>
          <DinhKem doiTuong="tai_san" id={id} />

          {form === "bao-hong" && (
            <div className="action-panel">
              <div className="field-group">
                <label className="field-label">{t("Mô tả hư hỏng *")}</label>
                <input type="text" value={lyDo} onChange={(e) => setLyDo(e.target.value)} autoFocus placeholder={t("vd: Màn hình không lên, gãy chân ghế…")} />
              </div>
              <div className="modal-actions" style={{ marginTop: 0 }}>
                <button type="button" className="btn" onClick={() => setForm(null)}>
                  {t("Hủy")}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy || !lyDo.trim()}
                  onClick={() =>
                    gui(() => api.post("/phieu-xu-ly-ts", { loai: "Bao hong", ccdc_ids: [id], ly_do: lyDo.trim() }), t("Đã gửi báo hỏng - chờ Kế toán duyệt."))
                  }
                >
                  {t("Gửi báo hỏng")}
                </button>
              </div>
            </div>
          )}
          {form === "kiem-ke" && (
            <div className="action-panel">
              <div className="form-grid">
                <div className="field-group">
                  <label className="field-label">{t("Đợt kiểm kê")}</label>
                  <select value={kk.dot} onChange={(e) => setKk({ ...kk, dot: e.target.value })}>
                    {dotKiemKe.map((d) => (
                      <option key={s(d.id)} value={s(d.id)}>
                        {s(d.ten_dot)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label">{t("Tình trạng thực tế")}</label>
                  <select value={kk.tinh_trang} onChange={(e) => setKk({ ...kk, tinh_trang: e.target.value })}>
                    {Object.entries(TINH_TRANG_KIEM_KE).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field-group">
                <label className="field-label">{t("Ghi chú")}</label>
                <input type="text" value={kk.ghi_chu} onChange={(e) => setKk({ ...kk, ghi_chu: e.target.value })} />
              </div>
              <div className="modal-actions" style={{ marginTop: 0 }}>
                <button type="button" className="btn" onClick={() => setForm(null)}>
                  {t("Hủy")}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !kk.dot}
                  onClick={() =>
                    gui(
                      () =>
                        api.post(`/dot-kiem-ke/${encodeURIComponent(kk.dot)}/ghi-nhan`, {
                          ccdc_id: id,
                          tinh_trang_thuc_te: kk.tinh_trang,
                          ghi_chu: kk.ghi_chu.trim() || undefined,
                        }),
                      t("Đã ghi nhận kiểm kê."),
                    )
                  }
                >
                  {t("Ghi nhận")}
                </button>
              </div>
            </div>
          )}

          {form === "thanh-ly" && (
            <div className="action-panel">
              <div className="form-grid">
                <div className="field-group">
                  <label className="field-label">{t("Hình thức")}</label>
                  <select value={loaiXuLy} onChange={(e) => setLoaiXuLy(e.target.value as "Thanh ly" | "Tieu huy")}>
                    <option value="Thanh ly">{t("Thanh lý (bán / thu hồi giá trị)")}</option>
                    <option value="Tieu huy">{t("Tiêu hủy")}</option>
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label">{t("Lý do *")}</label>
                  <input type="text" value={lyDo} onChange={(e) => setLyDo(e.target.value)} autoFocus />
                </div>
              </div>
              <div className="modal-actions" style={{ marginTop: 0 }}>
                <button type="button" className="btn" onClick={() => setForm(null)}>
                  {t("Hủy")}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !lyDo.trim()}
                  onClick={() =>
                    gui(
                      () => api.post("/phieu-xu-ly-ts", { loai: loaiXuLy, ccdc_ids: [id], ly_do: lyDo.trim() }),
                      t("Đã lập phiếu đề xuất {x} - chờ Kế toán duyệt.", { x: loaiXuLy === "Thanh ly" ? t("thanh lý") : t("tiêu hủy") }),
                    )
                  }
                >
                  {t("Gửi Kế toán duyệt")}
                </button>
              </div>
            </div>
          )}

          {!form && (
            <div className="modal-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
              <button type="button" className="btn btn-outline" onClick={() => inTemQr([{ id, ten: s(row.ten_ccdc) }]).then((l) => l && setErr(l))}>
                In tem QR
              </button>
              {coTheBaoHong && (
                <button type="button" className="btn btn-danger" onClick={() => (setForm("bao-hong"), setLyDo(""), setMsg(null))}>
                  {t("Báo hỏng")}
                </button>
              )}
              {laHC && row.trang_thai_hien_tai === "Hong" && (
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={busy}
                  onClick={() => gui(() => api.post(`/ccdc/${encodeURIComponent(id)}/sua-xong`), t("Đã đánh dấu sửa xong - tài sản trở lại kho."))}
                >
                  {t("Sửa xong, đưa lại sử dụng")}
                </button>
              )}
              {coTheThanhLy && (
                <button type="button" className="btn btn-outline" onClick={() => (setForm("thanh-ly"), setLyDo(""), setMsg(null))}>
                  {t("Đề xuất thanh lý / tiêu hủy")}
                </button>
              )}
              {dotKiemKe.length > 0 && (
                <button type="button" className="btn btn-primary" onClick={() => (setForm("kiem-ke"), setMsg(null))}>
                  {t("Ghi nhận kiểm kê")}
                </button>
              )}
            </div>
          )}

          {(data.xu_ly.length > 0 || data.lich_su.length > 0) && (
            <>
              <div className="section-title" style={{ marginTop: 16 }}>
                {t("Lịch sử")}
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t("Mã phiếu")}</th>
                      <th>{t("Loại")}</th>
                      <th>{t("Chi tiết")}</th>
                      <th>{t("Ngày")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.xu_ly.map((p) => (
                      <tr key={`x${s(p.phieu_id)}`}>
                        <td>
                          <span className="code-link" onClick={() => moPhieu("xu_ly", s(p.phieu_id))}>
                            {s(p.ma_phieu) || s(p.phieu_id).slice(0, 8)}
                          </span>
                        </td>
                        <td>{LOAI_XU_LY[s(p.loai)] ?? s(p.loai)}</td>
                        <td>
                          {TRANG_THAI_XU_LY[s(p.trang_thai)]?.label ?? s(p.trang_thai)}
                          {p.ly_do ? ` · ${s(p.ly_do)}` : ""}
                        </td>
                        <td>{fmtNgayGio(s(p.ngay_de_xuat))}</td>
                      </tr>
                    ))}
                    {data.lich_su.map((p) => (
                      <tr key={`g${s(p.phieu_id)}`}>
                        <td>
                          <span className="code-link" onClick={() => moPhieu("giao_nhan", s(p.phieu_id))}>
                            {s(p.ma_phieu) || s(p.phieu_id).slice(0, 8)}
                          </span>
                        </td>
                        <td>{LOAI_GIAO_NHAN[s(p.loai_phieu)] ?? s(p.loai_phieu)}</td>
                        <td>
                          {[s(p.tu_kho_ten) || s(p.nhan_vien_ten), s(p.den_kho_ten) || s(p.nhan_vien_nhan_moi_ten)].filter(Boolean).join(" → ")}
                        </td>
                        <td>{fmtNgayGio(s(p.ngay_lap))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

/** Mo 1 dong "viec can lam" (chuong, Tong quan, man Viec can lam) - phieu/tai san: popup; kiem ke: chuyen man. */
export function useMoViec() {
  const { moPhieu, moTaiSan } = useChiTiet();
  const { navigate } = useNav();
  return useCallback(
    (v: Pick<ViecRow, "loai_phieu" | "id" | "hanh_dong">) => {
      // "Tai san hong cho xu ly" la dong gop (khong phai 1 tai san) -> danh muc loc trang thai Hong.
      if (v.hanh_dong === "xu_ly_hong") navigate("tai-san", { trang_thai: "Hong" });
      else if (v.loai_phieu === "tai_san") moTaiSan(v.id);
      else if (v.loai_phieu === "kiem_ke") navigate("kiem-ke");
      else moPhieu(v.loai_phieu, v.id);
    },
    [moPhieu, moTaiSan, navigate],
  );
}
