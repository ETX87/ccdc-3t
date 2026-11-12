import { t, tS } from "../lib/i18n";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Modal } from "./Modal";
import { DinhKem } from "./DinhKem";
import { StatusBadge } from "./StatusBadge";
import { SuaPhieuCk } from "./SuaPhieuCk";
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
import { ChonLoc } from "./ChonLoc";
import { VatTuModal } from "./ChiTietVatTu";
import { NhanVienModal } from "./ChiTietNhanVien";
import { ChiTietCtx, NvLink, PhieuLink, TsLink, VtLink, useChiTiet, type LoaiPhieu } from "./LienKet";
import { LuongNgang, type Moc } from "./LuongNgang";
import { BangLoc, type CotBang } from "./BangLoc";
import { LoaiChip } from "./NoiBat";
import { useKhiThayDoi } from "../lib/suKien";

// Popup chi tiet dung chung toan app: mo tu ma phieu / ma tai san o bat ky dau (tim kiem, chuong, bang
// viec, canh bao, quet QR). Nut thao tac chi hien khi nguoi dung dung vai tro; server van kiem lai.

export type { LoaiPhieu } from "./LienKet";
export { useChiTiet } from "./LienKet";

type Dang = { kind: "phieu"; loai: LoaiPhieu; id: string } | { kind: "tai_san"; id: string } | { kind: "vat_tu"; id: string } | { kind: "nhan_vien"; id: string };

export function ChiTietProvider({ children }: { children: ReactNode }) {
  // Chong popup: mo popup tu trong popup (vd phieu trong ho so vat tu) -> Back / Dong quay ve popup truoc. Moi popup
  // chiem 1 buoc lich su (state.popup = do sau) - nut Back trinh duyet / dien thoai dong popup tren cung truoc.
  const [chong, setChong] = useState<Dang[]>([]);
  const chongRef = useRef<Dang[]>([]);
  chongRef.current = chong;
  const mo = useCallback((d: Dang) => {
    window.history.pushState({ ...(window.history.state ?? {}), popup: chongRef.current.length + 1 }, "");
    setChong((cu) => [...cu, d]);
  }, []);
  const moPhieu = useCallback((loai: LoaiPhieu, id: string) => mo({ kind: "phieu", loai, id }), [mo]);
  const moTaiSan = useCallback((id: string) => mo({ kind: "tai_san", id }), [mo]);
  const moVatTu = useCallback((id: string) => mo({ kind: "vat_tu", id }), [mo]);
  const moNhanVien = useCallback((id: string) => mo({ kind: "nhan_vien", id }), [mo]);
  const dong = useCallback(() => {
    if ((window.history.state as { popup?: number } | null)?.popup) window.history.back();
    else setChong((cu) => cu.slice(0, -1));
  }, []);
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const doSau = Number((e.state as { popup?: number } | null)?.popup) || 0;
      setChong((cu) => cu.slice(0, doSau));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const dang = chong[chong.length - 1];
  return (
    <ChiTietCtx.Provider value={{ moPhieu, moTaiSan, moVatTu, moNhanVien }}>
      {children}
      {dang?.kind === "phieu" && <PhieuModal key={`p:${dang.id}`} loai={dang.loai} id={dang.id} onClose={dong} />}
      {dang?.kind === "tai_san" && <TaiSanModal key={`t:${dang.id}`} id={dang.id} onClose={dong} />}
      {dang?.kind === "nhan_vien" && (
        <NhanVienModal key={`n:${dang.id}`} ma={dang.id} onClose={dong} onMoPhieu={moPhieu} onMoTaiSan={moTaiSan} onMoVatTu={moVatTu} />
      )}
      {dang?.kind === "vat_tu" && <VatTuModal key={`v:${dang.id}`} id={dang.id} onClose={dong} onMoPhieu={(id) => moPhieu("chuyen_kho", id)} />}
    </ChiTietCtx.Provider>
  );
}

// ---------------------------------------------------------------------------------------------
type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

function ThongTin({ items, cot }: { items: [string, ReactNode][]; cot?: number }) {
  return (
    <div className="info-grid" style={cot ? { gridTemplateColumns: `repeat(${cot}, minmax(0, 1fr))` } : undefined}>
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
                {fmtNgayGio(s(l.ngay_xu_ly))} · <NvLink ma={s(l.nguoi_xu_ly_nv) || null} ten={s(l.nguoi_xu_ly_ten) || s(l.nguoi_xu_ly)} />
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
  /** Bat buoc nhap ma EO (hoan tat tieu huy cua phieu lap truoc khi bat buoc ma EO). */
  canMaEo?: boolean;
  /** Hoi xac nhan (kem ghi chu khong bat buoc) truoc khi gui. */
  hoiLai?: boolean;
  path: string;
}

// Phieu tieu hao chua KT duyet: nguoi lap / HCNS sua (Nhap mua, chuyen cong ty) hoac huy.
const CK_SUA_DUOC = ["Cho ke toan duyet", "Ke toan tu choi"];
const coQuyenSuaCk = (row: Row, user: AppUser) => CK_SUA_DUOC.includes(s(row.trang_thai)) && (row.nguoi_lap === user.email || isHcns(user));

function tinhHanhDong(loai: LoaiPhieu, row: Row, user: AppUser): HanhDong[] {
  const khoCuaToi = new Set(user.kho_phu_trach.map((k) => k.id));
  // Ben nhan that su (server: laBenNhan) - khong dung kho_phu_trach (Admin / thu kho nguon khong nhan thay).
  const khoNhan = new Set(user.kho_nhan ?? []);
  // Nguoi lap khong tu duyet phieu cua minh (server: KHONG_TU_DUYET).
  const tuLap = row.nguoi_lap === user.email || row.nguoi_de_xuat === user.email;
  const id = encodeURIComponent(s(row.id));
  const ds: HanhDong[] = [];
  // Da phap nhan: KT chi duyet phieu cua cong ty minh (chuyen cong ty: KT cong ty NGUON) - server kiem lai.
  const ktCongTy = (ct: unknown) => isKeToan(user) && !tuLap && (ct == null || user.cong_ty.some((c) => c.id === n(ct)));
  if (loai === "chuyen_kho") {
    const base = `/phieu-chuyen-kho/${id}`;
    if (row.trang_thai === "Cho ke toan duyet" && ktCongTy(row.tu_cong_ty_id)) {
      ds.push({ key: "duyet", nhan: t("Duyệt"), kieu: "primary", path: `${base}/ke-toan-duyet` });
      ds.push({ key: "tu-choi", nhan: t("Từ chối"), kieu: "danger", canLyDo: t("Lý do từ chối"), path: `${base}/ke-toan-tu-choi` });
    }
    if (row.trang_thai === "Dang chuyen" && khoNhan.has(n(row.den_kho_id))) {
      ds.push({ key: "nhan", nhan: t("Xác nhận đã nhận"), kieu: "primary", path: `${base}/nhan` });
      ds.push({ key: "tu-choi-nhan", nhan: t("Từ chối nhận"), kieu: "danger", canLyDo: t("Lý do từ chối nhận"), path: `${base}/tu-choi-nhan` });
    }
    if (row.loai === "Cap phat NV" && row.trang_thai === "Da giao" && !n(row.da_xac_nhan) && user.ma_nv && row.den_nhan_vien_id === user.ma_nv) {
      ds.push({ key: "xac-nhan", nhan: t("Xác nhận đã nhận"), kieu: "primary", path: `${base}/xac-nhan` });
    }
    if (coQuyenSuaCk(row, user)) {
      ds.push({ key: "huy", nhan: t("Hủy phiếu"), kieu: "danger", canLyDo: t("Lý do hủy"), path: `${base}/huy` });
    }
    // Bi tu choi nhan (thuong bam nham): nguoi lap / thu kho nguon gui lai bang phieu moi, hoac danh dau da xu ly.
    if (row.trang_thai === "Bi tu choi" && !n(row.da_xu_ly_tu_choi) && (row.nguoi_lap === user.email || khoCuaToi.has(n(row.tu_kho_id)))) {
      ds.push({ key: "gui-lai", nhan: t("Gửi lại"), kieu: "primary", hoiLai: true, path: `${base}/gui-lai` });
      ds.push({ key: "da-xu-ly", nhan: t("Đã xử lý, không gửi lại"), kieu: "outline", hoiLai: true, path: `${base}/da-xu-ly` });
    }
  } else if (loai === "giao_nhan") {
    if (row.trang_thai_duyet === "Cho ke toan duyet" && ktCongTy(row.tu_cong_ty_id)) {
      ds.push({ key: "duyet", nhan: t("Duyệt chuyển công ty"), kieu: "primary", path: `/phieu-giao-nhan/${id}/ke-toan-duyet` });
      ds.push({ key: "tu-choi", nhan: t("Từ chối"), kieu: "danger", canLyDo: t("Lý do từ chối"), path: `/phieu-giao-nhan/${id}/ke-toan-tu-choi` });
    }
    // Chuyen cong ty chua duyet / bi tu choi: chua xac nhan nhan duoc.
    if (!n(row.da_xac_nhan) && (!row.trang_thai_duyet || row.trang_thai_duyet === "Da duyet")) {
      const nhanNV =
        (row.loai_phieu === "Cap phat" && row.nhan_vien_id === user.ma_nv) || (row.loai_phieu === "Dieu chuyen" && row.nhan_vien_nhan_moi_id === user.ma_nv);
      const nhanKho = (row.loai_phieu === "Thu hoi" || row.loai_phieu === "Chuyen kho") && khoNhan.has(n(row.den_kho_id));
      if ((nhanNV && user.ma_nv) || nhanKho)
        ds.push({ key: "xac-nhan", nhan: t("Xác nhận đã nhận"), kieu: "primary", path: `/phieu-giao-nhan/${id}/xac-nhan` });
    }
  } else {
    const base = `/phieu-xu-ly-ts/${id}`;
    if (row.trang_thai === "Cho ke toan duyet" && isKeToan(user) && !tuLap) {
      ds.push({ key: "duyet", nhan: t("Duyệt"), kieu: "primary", path: `${base}/ke-toan-duyet` });
      ds.push({ key: "tu-choi", nhan: t("Từ chối"), kieu: "danger", canLyDo: t("Lý do từ chối"), path: `${base}/ke-toan-tu-choi` });
    }
    if (row.trang_thai === "Da duyet" && isHcns(user) && (row.loai === "Thanh ly" || row.loai === "Tieu huy")) {
      ds.push({
        key: "hoan-tat",
        nhan: row.loai === "Thanh ly" ? t("Hoàn tất thanh lý") : t("Hoàn tất tiêu hủy"),
        kieu: "primary",
        canGiaTri: row.loai === "Thanh ly",
        canMaEo: row.loai === "Tieu huy" && !row.ma_eo,
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
  const [maEo, setMaEo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!ds.length) return null;

  async function gui(h: HanhDong) {
    if (h.canLyDo && !ghiChu.trim()) {
      setErr(t("Vui lòng nhập {x}.", { x: h.canLyDo.toLowerCase() }));
      return;
    }
    if (h.canMaEo && !maEo.trim()) {
      setErr(t("Tiêu hủy bắt buộc nhập mã EO."));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = { ghi_chu: ghiChu.trim() || undefined };
      if (h.canGiaTri && giaTri !== "") body.gia_tri_thu_hoi = Number(giaTri);
      if (h.canMaEo) body.ma_eo = maEo.trim();
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
      {chon && (chon.canLyDo || chon.canGiaTri || chon.canMaEo || chon.hoiLai) && (
        <div className="form-grid">
          {chon.canMaEo && (
            <div className="field-group">
              <label className="field-label">{t("Mã EO *")}</label>
              <input type="text" value={maEo} onChange={(e) => setMaEo(e.target.value)} placeholder={t("Mã phê duyệt EO cho việc tiêu hủy")} />
            </div>
          )}
          {chon.canGiaTri && (
            <div className="field-group">
              <label className="field-label">{t("Giá trị thu hồi (đ)")}</label>
              <input type="number" min={0} value={giaTri} onChange={(e) => setGiaTri(e.target.value)} placeholder="0" />
            </div>
          )}
          <div className="field-group" style={{ gridColumn: chon.canGiaTri || chon.canMaEo ? undefined : "1 / -1" }}>
            <label className="field-label">{chon.canLyDo ?? t("Ghi chú (không bắt buộc)")}</label>
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
              onClick={() => (h.canLyDo || h.canGiaTri || h.canMaEo || h.hoiLai ? (setChon(h), setGhiChu(""), setErr(null)) : gui(h))}
            >
              {h.nhan}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ---- Luong quy trinh ngang cua tung loai phieu (quy uoc UI chi tiet): moc + gio lay tu nhat ky phieu.
function mocPhieu(loai: LoaiPhieu, row: Row, log: Row[]): Moc[] {
  const ten = (l: Row | undefined) => (l ? s(l.nguoi_xu_ly_ten) || s(l.nguoi_xu_ly) : null);
  const tim = (...tt: string[]) => [...log].reverse().find((l) => tt.includes(s(l.trang_thai)));
  const ttHt = s(row.trang_thai);
  const ds: Moc[] = [];
  if (loai === "chuyen_kho") {
    const loaiCk = s(row.loai);
    const lienCt = row.den_cong_ty_id != null && n(row.den_cong_ty_id) !== n(row.tu_cong_ty_id);
    const tieuDung = loaiCk === "Cap phat NV" && row.den_kho_loai === "Tieu hao";
    ds.push({ nhan: t("Lập phiếu"), tt: "xong", luc: s(row.created_at), nguoi: s(row.nguoi_lap_ten) || s(row.nguoi_lap) });
    const coKt = loaiCk === "Nhap mua" || loaiCk === "Dieu chinh" || lienCt;
    if (coKt) {
      const tc = tim("Ke toan tu choi");
      const qua = !["Cho ke toan duyet", "Ke toan tu choi", "Da huy"].includes(ttHt);
      const l = qua ? log.find((x) => !["Cho ke toan duyet", "Ke toan tu choi"].includes(s(x.trang_thai))) : tc;
      ds.push({
        nhan: ttHt === "Ke toan tu choi" ? t("KT từ chối") : t("Kế toán duyệt"),
        tt: qua ? "xong" : ttHt === "Ke toan tu choi" ? "loi" : ttHt === "Cho ke toan duyet" ? "dang" : "bo-qua",
        luc: qua || ttHt === "Ke toan tu choi" ? s(l?.ngay_xu_ly) : null,
        nguoi: qua || ttHt === "Ke toan tu choi" ? ten(l) : null,
        ghiChu: ttHt === "Ke toan tu choi" ? s(tc?.ghi_chu) : null,
      });
    }
    if (loaiCk === "Nhap mua") {
      const l = tim("Da nhan");
      ds.push({ nhan: t("Vào kho HCNS"), tt: ttHt === "Da nhan" ? "xong" : ttHt === "Da huy" ? "bo-qua" : "cho", luc: s(l?.ngay_xu_ly) || null });
    } else if (loaiCk === "Dieu chinh") {
      const l = tim("Da dieu chinh");
      ds.push({ nhan: t("Đã điều chỉnh tồn"), tt: ttHt === "Da dieu chinh" ? "xong" : ttHt === "Da huy" ? "bo-qua" : "cho", luc: s(l?.ngay_xu_ly) || null });
    } else if (loaiCk === "Chuyen kho") {
      const xuat = tim("Dang chuyen");
      const daXuat = ["Dang chuyen", "Da nhan", "Bi tu choi"].includes(ttHt);
      ds.push({ nhan: t("Xuất kho, đang chuyển"), tt: daXuat ? "xong" : ttHt === "Da huy" ? "bo-qua" : "cho", luc: daXuat ? s(xuat?.ngay_xu_ly) || s(row.created_at) : null, nguoi: ten(xuat) });
      const nhan = tim("Da nhan", "Bi tu choi");
      ds.push({
        nhan: ttHt === "Bi tu choi" ? t("Kho nhận từ chối") : t("Kho nhận xác nhận"),
        tt: ttHt === "Da nhan" ? "xong" : ttHt === "Bi tu choi" ? "loi" : ttHt === "Dang chuyen" ? "dang" : ttHt === "Da huy" ? "bo-qua" : "cho",
        luc: s(nhan?.ngay_xu_ly) || null,
        nguoi: ten(nhan),
        ghiChu: ttHt === "Bi tu choi" ? s(nhan?.ghi_chu) : null,
      });
    } else {
      const giao = tim("Da giao");
      ds.push({ nhan: tieuDung ? t("Xuất tiêu dùng") : t("Giao cho nhân viên"), tt: ttHt === "Da giao" ? "xong" : ttHt === "Da huy" ? "bo-qua" : "cho", luc: s(giao?.ngay_xu_ly) || s(row.created_at) });
      if (!tieuDung && !row.nguoi_nhan_ten_tu_do)
        ds.push({
          nhan: t("NV xác nhận đã nhận"),
          tt: n(row.da_xac_nhan) ? "xong" : ttHt === "Da giao" ? "dang" : "cho",
          luc: n(row.da_xac_nhan) ? s(row.xac_nhan_luc) : null,
          nguoi: s(row.den_nhan_vien_ten) || null,
        });
    }
    if (ttHt === "Da huy") ds.push({ nhan: t("Đã hủy"), tt: "loi", luc: s(tim("Da huy")?.ngay_xu_ly) || null, nguoi: ten(tim("Da huy")) });
  } else if (loai === "giao_nhan") {
    ds.push({ nhan: t("Lập phiếu"), tt: "xong", luc: s(row.ngay_lap), nguoi: s(row.nguoi_lap_ten) || s(row.nguoi_lap) });
    const duyet = s(row.trang_thai_duyet);
    if (duyet)
      ds.push({
        nhan: duyet === "Ke toan tu choi" ? t("KT từ chối") : t("Kế toán duyệt chuyển công ty"),
        tt: duyet === "Da duyet" ? "xong" : duyet === "Ke toan tu choi" ? "loi" : "dang",
      });
    ds.push({
      nhan: s(row.loai_phieu) === "Thu hoi" || s(row.loai_phieu) === "Chuyen kho" ? t("Kho nhận xác nhận") : t("Nhân viên xác nhận"),
      tt: n(row.da_xac_nhan) ? "xong" : !duyet || duyet === "Da duyet" ? "dang" : "cho",
      luc: n(row.da_xac_nhan) ? s(row.xac_nhan_luc) : null,
      nguoi: s(row.nguoi_xac_nhan_ten) || s(row.nguoi_xac_nhan) || null,
    });
  } else {
    const lx = s(row.loai);
    ds.push({ nhan: lx === "Bao hong" ? t("Báo hỏng") : t("Đề xuất"), tt: "xong", luc: s(row.ngay_de_xuat), nguoi: s(row.nguoi_de_xuat_ten) || s(row.nguoi_de_xuat) });
    const kt = tim("Da duyet", "Tu choi", "Da hoan tat");
    ds.push({
      nhan: ttHt === "Tu choi" ? t("KT từ chối") : t("Kế toán duyệt"),
      tt: ttHt === "Cho ke toan duyet" ? "dang" : ttHt === "Tu choi" ? "loi" : "xong",
      luc: ttHt === "Cho ke toan duyet" ? null : s(kt?.ngay_xu_ly) || null,
      nguoi: ttHt === "Cho ke toan duyet" ? null : ten(kt),
      ghiChu: ttHt === "Tu choi" ? s(kt?.ghi_chu) : null,
    });
    if (lx === "Thanh ly" || lx === "Tieu huy") {
      const ht = tim("Da hoan tat");
      ds.push({
        nhan: lx === "Thanh ly" ? t("Hoàn tất thanh lý") : t("Hoàn tất tiêu hủy"),
        tt: ttHt === "Da hoan tat" ? "xong" : ttHt === "Da duyet" ? "dang" : ttHt === "Tu choi" ? "bo-qua" : "cho",
        luc: s(ht?.ngay_xu_ly) || null,
        nguoi: ten(ht),
      });
    }
  }
  return ds;
}

function PhieuModal({ loai, id, onClose }: { loai: LoaiPhieu; id: string; onClose: () => void }) {
  const auth = useAuth();
  const [dangSua, setDangSua] = useState(false);
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
  useKhiThayDoi(load);

  const user = auth.status === "authenticated" ? auth.user : null;
  const row = data?.row;
  const items = data?.items ?? [];
  let tieuDe = t("Phiếu");
  let trangThai: { label: string; tone: Tone } | null = null;
  let chinh: [string, ReactNode][] = [];
  let phu: [string, ReactNode][] = [];
  const nguoiLap = row ? <NvLink ma={s(row.nguoi_lap_nv) || null} ten={s(row.nguoi_lap_ten) || s(row.nguoi_lap)} /> : null;
  if (row) {
    const ma = s(row.ma_phieu) || s(row.id);
    if (loai === "chuyen_kho") {
      const lienCt = row.den_cong_ty_id != null && n(row.den_cong_ty_id) !== n(row.tu_cong_ty_id);
      const tieuDung = row.loai === "Cap phat NV" && row.den_kho_loai === "Tieu hao";
      tieuDe = `${lienCt ? t("Chuyển công ty") : tieuDung ? t("Xuất tiêu dùng") : (LOAI_PHIEU_CK[s(row.loai)] ?? s(row.loai))} · ${ma}`;
      trangThai = TRANG_THAI_CK[s(row.trang_thai)] ?? { label: s(row.trang_thai), tone: "neutral" };
      const tongSl = items.reduce((a, it) => a + n(it.so_luong), 0);
      const tongTien = items.reduce((a, it) => a + n(it.thanh_tien), 0);
      chinh = [
        [row.loai === "Dieu chinh" ? t("Kho điều chỉnh") : row.loai === "Nhap mua" ? t("Nhà cung cấp → kho") : t("Từ kho"), row.loai === "Nhap mua" ? `${s(row.nha_cung_cap) || "-"} → ${s(row.den_kho_ten)}` : s(row.tu_kho_ten)],
        [
          t("Đến"),
          row.loai === "Nhap mua" || row.loai === "Dieu chinh" ? "" : row.den_nhan_vien_id ? (
            <NvLink ma={s(row.den_nhan_vien_id)} ten={s(row.den_nhan_vien_ten)} />
          ) : (
            s(row.den_kho_ten) || (row.nguoi_nhan_ten_tu_do ? t("{x} (ngoài danh bạ)", { x: s(row.nguoi_nhan_ten_tu_do) }) : "")
          ),
        ],
        [t("Người lập"), nguoiLap],
        [t("Ngày lập"), fmtNgayGio(s(row.created_at))],
        [t("Tổng"), t("{a} mặt hàng · SL {b} · {c}", { a: items.length, b: fmtSo(tongSl, 2), c: fmtGiaTri(tongTien) })],
      ];
      phu = [
        [t("Công ty"), lienCt ? `${s(row.tu_cong_ty_ma)} → ${s(row.den_cong_ty_ma)}` : s(row.tu_cong_ty_ma)],
        [t("Gửi lại từ phiếu"), row.gui_lai_tu ? <PhieuLink loai="chuyen_kho" id={s(row.gui_lai_tu)} ma={s(row.gui_lai_tu_ma)} /> : ""],
        [t("Đã gửi lại bằng phiếu"), row.da_gui_lai_id ? <PhieuLink loai="chuyen_kho" id={s(row.da_gui_lai_id)} ma={s(row.da_gui_lai_ma)} /> : ""],
        [t("NV xác nhận"), row.loai === "Cap phat NV" && !tieuDung ? (n(row.da_xac_nhan) ? t("Đã xác nhận {x}", { x: fmtNgayGio(s(row.xac_nhan_luc)) }) : t("Chưa xác nhận")) : ""],
        [t("Ghi chú"), s(row.ghi_chu)],
        [t("Mã hệ thống"), s(row.id)],
      ];
    } else if (loai === "giao_nhan") {
      const lienCt = row.trang_thai_duyet != null;
      tieuDe = t("{x} TSCĐ · {ma}", { x: lienCt ? t("Chuyển công ty") : (LOAI_GIAO_NHAN[s(row.loai_phieu)] ?? s(row.loai_phieu)), ma });
      trangThai =
        row.trang_thai_duyet === "Cho ke toan duyet"
          ? { label: t("Chờ kế toán duyệt"), tone: "warning" }
          : row.trang_thai_duyet === "Ke toan tu choi"
            ? { label: t("Kế toán từ chối"), tone: "danger" }
            : n(row.da_xac_nhan)
              ? { label: t("Đã xác nhận"), tone: "success" }
              : { label: t("Chờ xác nhận"), tone: "warning" };
      const lp = s(row.loai_phieu);
      const nvGiu = <NvLink ma={s(row.nhan_vien_id) || null} ten={s(row.nhan_vien_ten)} />;
      const nvMoi = <NvLink ma={s(row.nhan_vien_nhan_moi_id) || null} ten={s(row.nhan_vien_nhan_moi_ten)} />;
      chinh = [
        [t("Từ"), lp === "Cap phat" || lp === "Chuyen kho" ? s(row.tu_kho_ten) : nvGiu],
        [t("Đến"), lp === "Cap phat" ? nvGiu : lp === "Dieu chuyen" ? nvMoi : s(row.den_kho_ten)],
        [t("Người lập"), nguoiLap],
        [t("Ngày lập"), fmtNgayGio(s(row.ngay_lap))],
        [t("Tổng"), t("{a} tài sản · {b}", { a: items.length, b: fmtGiaTri(items.reduce((a, it) => a + n(it.nguyen_gia), 0)) })],
      ];
      phu = [
        [t("Xác nhận lúc"), n(row.da_xac_nhan) ? fmtNgayGio(s(row.xac_nhan_luc)) : ""],
        [t("Người xác nhận"), row.nguoi_xac_nhan ? <NvLink ma={s(row.nguoi_xac_nhan_nv) || null} ten={s(row.nguoi_xac_nhan_ten) || s(row.nguoi_xac_nhan)} /> : ""],
        [t("Ghi chú"), s(row.ghi_chu)],
        [t("Mã hệ thống"), s(row.id)],
      ];
    } else {
      tieuDe = `${LOAI_XU_LY[s(row.loai)] ?? s(row.loai)} · ${ma}`;
      trangThai = TRANG_THAI_XU_LY[s(row.trang_thai)] ?? { label: s(row.trang_thai), tone: "neutral" };
      chinh = [
        [t("Lý do"), s(row.ly_do)],
        [t("Người đề xuất"), <NvLink key="nd" ma={s(row.nguoi_de_xuat_nv) || null} ten={s(row.nguoi_de_xuat_ten) || s(row.nguoi_de_xuat)} />],
        [t("Ngày đề xuất"), fmtNgayGio(s(row.ngay_de_xuat))],
        [t("Mã EO"), s(row.ma_eo)],
        [t("Tổng"), t("{a} tài sản · {b}", { a: items.length, b: fmtGiaTri(items.reduce((a, it) => a + n(it.nguyen_gia), 0)) })],
      ];
      phu = [
        [t("Giá trị thu hồi"), row.gia_tri_thu_hoi != null ? fmtGiaTri(n(row.gia_tri_thu_hoi)) : ""],
        [t("Ghi chú"), s(row.ghi_chu)],
        [t("Mã hệ thống"), s(row.id)],
      ];
    }
  }

  const cotItems = useMemo<CotBang<Row>[]>(() => {
    if (loai === "chuyen_kho")
      return [
        { key: "ma", nhan: t("Mã"), kieu: "chu", giaTri: (it) => s(it.vt_id) },
        { key: "ten", nhan: t("Tên vật tư"), kieu: "chu", giaTri: (it) => s(it.ten_vt), hien: (it) => <VtLink id={s(it.vt_id)} ten={s(it.ten_vt)} /> },
        {
          key: "sl",
          nhan: t("Số lượng"),
          kieu: "so",
          canPhai: true,
          giaTri: (it) => n(it.so_luong) * (it.dau != null && n(it.dau) < 0 ? -1 : 1),
          hien: (it) => (
            <span className={it.dau != null ? (n(it.dau) > 0 ? "text-teal" : "text-red") : ""}>
              {it.dau != null ? (n(it.dau) > 0 ? "+" : "−") : ""}
              {fmtSo(n(it.so_luong), 2)} {s(it.don_vi_tinh)}
            </span>
          ),
        },
        { key: "dg", nhan: t("Đơn giá"), kieu: "so", canPhai: true, giaTri: (it) => (it.don_gia != null ? n(it.don_gia) : ""), hien: (it) => (it.don_gia != null ? fmtSo(n(it.don_gia)) : "-") },
        { key: "tt", nhan: t("Thành tiền"), kieu: "so", canPhai: true, giaTri: (it) => (it.thanh_tien != null ? n(it.thanh_tien) : ""), hien: (it) => (it.thanh_tien != null ? fmtSo(n(it.thanh_tien)) : "-") },
      ];
    const chung: CotBang<Row>[] = [
      { key: "ma", nhan: t("Mã tài sản"), kieu: "chu", giaTri: (it) => s(it.ccdc_id), hien: (it) => <TsLink id={s(it.ccdc_id)} /> },
      { key: "ten", nhan: t("Tên tài sản"), kieu: "chu", giaTri: (it) => s(it.ten_ccdc) },
    ];
    const trangThaiHt: CotBang<Row> = {
      key: "ht",
      nhan: t("Trạng thái hiện tại"),
      kieu: "chon",
      giaTri: (it) => TRANG_THAI_TS[s(it.trang_thai_hien_tai)]?.label ?? s(it.trang_thai_hien_tai),
    };
    const gia: CotBang<Row> = { key: "gia", nhan: t("Nguyên giá"), kieu: "so", canPhai: true, giaTri: (it) => n(it.nguyen_gia), hien: (it) => (it.nguyen_gia != null ? fmtSo(n(it.nguyen_gia)) : "-") };
    if (loai === "giao_nhan")
      return [
        ...chung,
        { key: "tinh", nhan: t("Tình trạng ghi nhận"), kieu: "chon", giaTri: (it) => s(it.tinh_trang_ghi_nhan) },
        trangThaiHt,
        { key: "giu", nhan: t("Người giữ hiện tại"), kieu: "chu", giaTri: (it) => s(it.nguoi_dang_giu_ten), hien: (it) => <NvLink ma={s(it.nguoi_dang_giu) || null} ten={s(it.nguoi_dang_giu_ten)} /> },
        gia,
      ];
    return [
      ...chung,
      { key: "truoc", nhan: t("Trạng thái trước"), kieu: "chon", giaTri: (it) => TRANG_THAI_TS[s(it.trang_thai_truoc)]?.label ?? s(it.trang_thai_truoc) },
      { key: "giu", nhan: t("Người giữ trước"), kieu: "chu", giaTri: (it) => s(it.nguoi_giu_truoc_ten), hien: (it) => <NvLink ma={s(it.nguoi_giu_truoc) || null} ten={s(it.nguoi_giu_truoc_ten)} /> },
      { key: "kho", nhan: t("Kho trước"), kieu: "chon", giaTri: (it) => s(it.kho_truoc_ten) },
      trangThaiHt,
      gia,
    ];
  }, [loai]);

  return (
    <Modal
      size="xl"
      onClose={onClose}
      title={
        <span className="title-with-badge">
          {tieuDe} {trangThai && <StatusBadge label={trangThai.label} tone={trangThai.tone} />}
        </span>
      }
    >
      {err && <div className="alert alert-error">{err}</div>}
      {!data && !err && <div className="empty-state">{t("Đang tải…")}</div>}
      {row && dangSua && (
        <SuaPhieuCk
          row={row}
          items={data.items}
          onHuy={() => setDangSua(false)}
          onXong={() => {
            setDangSua(false);
            load();
          }}
        />
      )}
      {row && !dangSua && (
        <>
          <LuongNgang
            moc={mocPhieu(loai, row, data.log ?? [])}
            chiTiet={
              <>
                <ThongTin items={phu} />
                {data.log && <NhatKy log={data.log} nhan={loai === "chuyen_kho" ? TRANG_THAI_CK : TRANG_THAI_XU_LY} />}
              </>
            }
          />
          {user && <ThanhHanhDong ds={tinhHanhDong(loai, row, user)} onDone={load} />}
          {user && loai === "chuyen_kho" && (row.loai === "Nhap mua" || row.loai === "Chuyen kho") && coQuyenSuaCk(row, user) && (
            <div className="modal-actions" style={{ marginTop: 10, justifyContent: "flex-start" }}>
              <button type="button" className="btn btn-outline" onClick={() => setDangSua(true)}>
                {row.trang_thai === "Ke toan tu choi" ? t("Sửa và gửi duyệt lại") : t("Sửa phiếu")}
              </button>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <ThongTin items={chinh} cot={5} />
          </div>
          <div className="section-title" style={{ marginTop: 14 }}>
            {loai === "chuyen_kho" ? t("Vật tư") : t("Tài sản")} ({items.length})
          </div>
          <BangLoc
            cot={cotItems}
            rows={items}
            rowKey={(it, i) => `${s(it.vt_id) || s(it.ccdc_id)}-${i}`}
            tenFile={`Phieu_${(s(row.ma_phieu) || s(row.id)).replace(/[^\w-]+/g, "_")}.xlsx`}
          />
          <DinhKem doiTuong={loai} id={id} nhacHoaDon={row.loai === "Nhap mua"} />
        </>
      )}
    </Modal>
  );
}

// ---- Ho so tai san: luong vong doi (nhap -> trong kho -> su dung -> ket thuc) + lich su gop (giao nhan, xu ly, kiem ke).
interface DongLs {
  key: string;
  ngay: string;
  nhom: string;
  loaiGoc: string;
  nhanLoai: string;
  phieu: { loai: LoaiPhieu; id: string; ma: string } | null;
  maTxt: string;
  tu: { ma: string | null; ten: string };
  den: { ma: string | null; ten: string };
  chiTiet: string;
  nguoi: { ma: string | null; ten: string };
}

function lichSuTaiSan(data: { lich_su: Row[]; xu_ly: Row[]; kiem_ke?: Row[] }): DongLs[] {
  const ds: DongLs[] = [];
  for (const p of data.lich_su) {
    const lp = s(p.loai_phieu);
    const nvGiu = { ma: s(p.nhan_vien_id) || null, ten: s(p.nhan_vien_ten) };
    const kho = (x: unknown) => ({ ma: null, ten: s(x) });
    ds.push({
      key: `g${s(p.phieu_id)}`,
      ngay: s(p.ngay_lap),
      nhom: t("Giao nhận"),
      loaiGoc: p.trang_thai_duyet != null ? "Chuyen cong ty" : lp,
      nhanLoai: p.trang_thai_duyet != null ? t("Chuyển công ty") : (LOAI_GIAO_NHAN[lp] ?? lp),
      phieu: { loai: "giao_nhan", id: s(p.phieu_id), ma: s(p.ma_phieu) },
      maTxt: s(p.ma_phieu) || s(p.phieu_id),
      tu: lp === "Cap phat" || lp === "Chuyen kho" ? kho(p.tu_kho_ten) : nvGiu,
      den: lp === "Cap phat" ? nvGiu : lp === "Dieu chuyen" ? { ma: s(p.nhan_vien_nhan_moi_id) || null, ten: s(p.nhan_vien_nhan_moi_ten) } : kho(p.den_kho_ten),
      chiTiet: [n(p.da_xac_nhan) ? t("Đã xác nhận {x}", { x: fmtNgayGio(s(p.xac_nhan_luc)) }) : t("Chưa xác nhận"), s(p.tinh_trang_ghi_nhan), s(p.ghi_chu)].filter(Boolean).join(" · "),
      nguoi: { ma: s(p.nguoi_lap_nv) || null, ten: s(p.nguoi_lap_ten) || s(p.nguoi_lap) },
    });
  }
  for (const p of data.xu_ly) {
    ds.push({
      key: `x${s(p.phieu_id)}`,
      ngay: s(p.ngay_de_xuat),
      nhom: t("Kế toán duyệt"),
      loaiGoc: s(p.loai),
      nhanLoai: LOAI_XU_LY[s(p.loai)] ?? s(p.loai),
      phieu: { loai: "xu_ly", id: s(p.phieu_id), ma: s(p.ma_phieu) },
      maTxt: s(p.ma_phieu) || s(p.phieu_id),
      tu: { ma: null, ten: "" },
      den: { ma: null, ten: "" },
      chiTiet: [TRANG_THAI_XU_LY[s(p.trang_thai)]?.label ?? s(p.trang_thai), s(p.ly_do), p.ma_eo ? t("Mã EO {x}", { x: s(p.ma_eo) }) : "", p.gia_tri_thu_hoi != null ? t("Thu hồi {x}", { x: fmtGiaTri(n(p.gia_tri_thu_hoi)) }) : ""]
        .filter(Boolean)
        .join(" · "),
      nguoi: { ma: s(p.nguoi_de_xuat_nv) || null, ten: s(p.nguoi_de_xuat_ten) || s(p.nguoi_de_xuat) },
    });
  }
  for (const k of data.kiem_ke ?? []) {
    ds.push({
      key: `k${s(k.id)}`,
      ngay: s(k.kiem_ke_luc),
      nhom: t("Kiểm kê"),
      loaiGoc: "Kiem ke",
      nhanLoai: t("Kiểm kê"),
      phieu: null,
      maTxt: s(k.ma_phieu) || s(k.ten_dot),
      tu: { ma: null, ten: "" },
      den: { ma: s(k.nguoi_dang_giu_thuc_te) || null, ten: s(k.nguoi_giu_ten) },
      chiTiet: [s(k.ten_dot), TINH_TRANG_KIEM_KE[s(k.tinh_trang_thuc_te)]?.label ?? s(k.tinh_trang_thuc_te), s(k.ghi_chu)].filter(Boolean).join(" · "),
      nguoi: { ma: s(k.nguoi_kiem_ke_nv) || null, ten: s(k.nguoi_kiem_ke_ten) || s(k.nguoi_kiem_ke) },
    });
  }
  return ds.sort((a, b) => b.ngay.localeCompare(a.ngay));
}

const COT_LS: CotBang<DongLs>[] = [
  { key: "ngay", nhan: t("Ngày"), kieu: "ngay", giaTri: (r) => r.ngay, hien: (r) => fmtNgayGio(r.ngay) },
  { key: "nhom", nhan: t("Nhóm"), kieu: "chon", giaTri: (r) => r.nhom },
  { key: "loai", nhan: t("Loại"), kieu: "chon", giaTri: (r) => r.nhanLoai, hien: (r) => <LoaiChip loai={r.loaiGoc} nhan={r.nhanLoai} /> },
  { key: "ma", nhan: t("Mã phiếu / đợt"), kieu: "chu", giaTri: (r) => r.maTxt, hien: (r) => (r.phieu ? <PhieuLink loai={r.phieu.loai} id={r.phieu.id} ma={r.phieu.ma} /> : r.maTxt) },
  { key: "tu", nhan: t("Từ"), kieu: "chu", giaTri: (r) => r.tu.ten, hien: (r) => (r.tu.ten ? <NvLink ma={r.tu.ma} ten={r.tu.ten} /> : "-") },
  { key: "den", nhan: t("Đến / người giữ"), kieu: "chu", giaTri: (r) => r.den.ten, hien: (r) => (r.den.ten ? <NvLink ma={r.den.ma} ten={r.den.ten} /> : "-") },
  { key: "ct", nhan: t("Chi tiết"), kieu: "chu", giaTri: (r) => r.chiTiet },
  { key: "nguoi", nhan: t("Người lập / thực hiện"), kieu: "chon", giaTri: (r) => r.nguoi.ten, hien: (r) => <NvLink ma={r.nguoi.ma} ten={r.nguoi.ten} /> },
];

/** Vong doi tai san tren luong ngang - moc dang dung = trang thai hien tai. */
function mocTaiSan(row: Row, ls: DongLs[]): Moc[] {
  const tt = s(row.trang_thai_hien_tai);
  const tim = (...loai: string[]) => ls.find((d) => loai.includes(d.loaiGoc));
  const nhap = [...ls].reverse().find((d) => d.loaiGoc === "Nhap mua");
  const suDung = tim("Cap phat", "Dieu chuyen");
  const thuHoi = tim("Thu hoi");
  const ketThuc = tim("Thanh ly", "Tieu huy");
  const daKetThuc = tt === "Da thanh ly" || tt === "Da tieu huy";
  const choKetThuc = tt === "Cho thanh ly" || tt === "Cho tieu huy";
  const hong = tt === "Hong" || tt === "Dang bao tri" || tt === "Cho duyet bao hong";
  return [
    { nhan: t("Nhập mua"), tt: "xong", luc: nhap?.ngay ?? s(row.created_at), nguoi: nhap?.nguoi.ten },
    { nhan: tt === "Cho duyet nhap" ? t("Chờ KT duyệt nhập") : t("Vào kho"), tt: tt === "Cho duyet nhap" ? "dang" : tt === "Trong kho" ? "dang" : "xong", luc: tt === "Trong kho" ? (thuHoi?.ngay ?? null) : null },
    {
      nhan: hong ? (TRANG_THAI_TS[tt]?.label ?? tt) : t("Cấp phát sử dụng"),
      tt: hong ? "loi" : tt === "Dang cap phat" ? "dang" : suDung ? "xong" : tt === "Cho duyet nhap" || tt === "Trong kho" ? "cho" : "bo-qua",
      luc: suDung?.ngay ?? null,
      nguoi: tt === "Dang cap phat" ? s(row.nguoi_dang_giu_ten) || null : null,
    },
    {
      nhan: daKetThuc || choKetThuc ? (TRANG_THAI_TS[tt]?.label ?? tt) : t("Thanh lý / tiêu hủy"),
      tt: daKetThuc ? "xong" : choKetThuc ? "dang" : "cho",
      luc: ketThuc?.ngay ?? null,
      nguoi: ketThuc?.nguoi.ten,
    },
  ];
}

// ---------------------------------------------------------------------------------------------
function TaiSanModal({ id, onClose }: { id: string; onClose: () => void }) {
  const auth = useAuth();
  const { reload } = useDuLieuChung();
  const user = auth.status === "authenticated" ? auth.user : null;
  const [data, setData] = useState<{ row: Row; lich_su: Row[]; xu_ly: Row[]; kiem_ke?: Row[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [form, setForm] = useState<"bao-hong" | "kiem-ke" | "thanh-ly" | null>(null);
  const [loaiXuLy, setLoaiXuLy] = useState<"Thanh ly" | "Tieu huy">("Thanh ly");
  const [maEo, setMaEo] = useState("");
  const [lyDo, setLyDo] = useState("");
  const [dotKiemKe, setDotKiemKe] = useState<Row[]>([]);
  const [kk, setKk] = useState({ dot: "", tinh_trang: "Dung vi tri", ghi_chu: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get<{ row: Row; lich_su: Row[]; xu_ly: Row[]; kiem_ke?: Row[] }>(`/ccdc/${encodeURIComponent(id)}`)
      .then(setData)
      .catch((e) => setErr((e as { status?: number }).status === 404 ? t("Không tìm thấy tài sản có mã \"{id}\".", { id }) : thongBaoLoi(e, t("Không tải được tài sản."))));
  }, [id]);
  useEffect(load, [load]);
  useKhiThayDoi(load);
  const ls = useMemo(() => (data ? lichSuTaiSan(data) : []), [data]);
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
      size="xl"
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
          <LuongNgang moc={mocTaiSan(row, ls)} />
          <div className="asset-head" style={{ marginTop: 12 }}>
            {qr && <img src={qr} alt={`QR ${id}`} className="asset-qr" />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="asset-name">{s(row.ten_ccdc)}</div>
              <ThongTin
                items={[
                  [t("Nhóm"), s(row.ten_nhom)],
                  [
                    t("Vị trí"),
                    row.nguoi_dang_giu ? (
                      <>
                        {t("Đang giữ:")} <NvLink ma={s(row.nguoi_dang_giu)} ten={s(row.nguoi_dang_giu_ten)} />
                      </>
                    ) : (
                      s(row.ten_kho)
                    ),
                  ],
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
                  <ChonLoc value={kk.dot} onChange={(e) => setKk({ ...kk, dot: e.target.value })}>
                    {dotKiemKe.map((d) => (
                      <option key={s(d.id)} value={s(d.id)}>
                        {s(d.ten_dot)}
                      </option>
                    ))}
                  </ChonLoc>
                </div>
                <div className="field-group">
                  <label className="field-label">{t("Tình trạng thực tế")}</label>
                  <ChonLoc value={kk.tinh_trang} onChange={(e) => setKk({ ...kk, tinh_trang: e.target.value })}>
                    {Object.entries(TINH_TRANG_KIEM_KE).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </ChonLoc>
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
                  <ChonLoc value={loaiXuLy} onChange={(e) => setLoaiXuLy(e.target.value as "Thanh ly" | "Tieu huy")}>
                    <option value="Thanh ly">{t("Thanh lý (bán / thu hồi giá trị)")}</option>
                    <option value="Tieu huy">{t("Tiêu hủy")}</option>
                  </ChonLoc>
                </div>
                <div className="field-group">
                  <label className="field-label">{t("Lý do *")}</label>
                  <input type="text" value={lyDo} onChange={(e) => setLyDo(e.target.value)} autoFocus />
                </div>
                {loaiXuLy === "Tieu huy" && (
                  <div className="field-group">
                    <label className="field-label">{t("Mã EO *")}</label>
                    <input type="text" value={maEo} onChange={(e) => setMaEo(e.target.value)} placeholder={t("Mã phê duyệt EO cho việc tiêu hủy")} />
                  </div>
                )}
              </div>
              <div className="modal-actions" style={{ marginTop: 0 }}>
                <button type="button" className="btn" onClick={() => setForm(null)}>
                  {t("Hủy")}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !lyDo.trim() || (loaiXuLy === "Tieu huy" && !maEo.trim())}
                  onClick={() =>
                    gui(
                      () => api.post("/phieu-xu-ly-ts", { loai: loaiXuLy, ccdc_ids: [id], ly_do: lyDo.trim(), ma_eo: loaiXuLy === "Tieu huy" ? maEo.trim() : undefined }),
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
                <button type="button" className="btn btn-outline" onClick={() => (setForm("thanh-ly"), setLyDo(""), setMaEo(""), setMsg(null))}>
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

          <div className="section-title" style={{ marginTop: 16 }}>
            {t("Lịch sử tài sản ({n})", { n: ls.length })}
          </div>
          <BangLoc cot={COT_LS} rows={ls} rowKey={(r) => r.key} tenFile={`Lich_su_${id.replace(/[^\w-]+/g, "_")}.xlsx`} rong={t("Chưa có phát sinh.")} />
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
