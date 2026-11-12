import { t, tS } from "../lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { api } from "../api/client";
import { Modal } from "./Modal";
import { StatusBadge } from "./StatusBadge";
import { FilterTabs } from "./FilterTabs";
import { ChonLoc } from "./ChonLoc";
import { PhanTrang, useTrangKhach } from "./PhanTrang";
import { KhoTag, LoaiChip, SoTon, TienTe } from "./NoiBat";
import { MucTonBadge, SuaTonToiThieuVt, type MucTon } from "./TonToiThieu";
import { useAuth } from "../auth/AuthContext";
import { isHcns } from "../lib/nhan";
import { boDau } from "./ChonLoc";
import { NvLink } from "./LienKet";
import { exportRowsToExcel } from "../lib/exportExcel";
import { fmtNgayGio, fmtSo } from "../lib/format";
import { LOAI_KHO, thongBaoLoi, TRANG_THAI_CK } from "../lib/nhan";

// Popup "ho so" 1 vat tu tieu hao (2026-10-30, user: tim 1 mat hang 1-2 click thay het): ton tung kho (ca kho DA HET),
// gia tri, ton toi thieu, lich su moi phieu, nguoi nhan cap phat. Mo qua useChiTiet().moVatTu(id) tu tim kiem, danh muc,
// ton kho, canh bao. Du lieu: GET /vt-tieu-hao/:id/chi-tiet.

type Kieu = "nhap_mua" | "chuyen_kho" | "cap_phat" | "tieu_dung" | "dieu_chinh";
interface DongLs {
  phieu_id: string;
  ma_phieu: string | null;
  loai: string;
  kieu: Kieu;
  trang_thai: string;
  ngay: string;
  nguoi_lap: string | null;
  tu_kho_id: number | null;
  tu: string | null;
  den_kho_id: number | null;
  den: string | null;
  den_nhan_vien_id: string | null;
  nguoi_nhan: string | null;
  so_luong: number;
  don_gia: number | null;
  thanh_tien: number;
  khac_cong_ty: boolean;
  ghi_chu: string | null;
}
interface KhoTon {
  kho_id: number;
  ten_kho: string;
  loai: string;
  ton: number;
  gia_tri: number;
  dang_chuyen_den: number;
  tong_nhap: number;
  tong_xuat: number;
  dieu_chinh: number;
  phat_sinh_cuoi: string | null;
}
interface DuLieu {
  vt: { id: string; ten_vt: string; ten_nhom: string | null; don_vi_tinh: string | null; don_gia_tham_khao: number | null; cong_ty_ma: string | null; thoi_gian_dat_hang: string | null; vo_hieu_hoa: number };
  pham_vi: "cong_ty" | "kho";
  tong: {
    ton: number;
    gia_tri: number;
    dang_chuyen: number;
    so_kho_con_hang: number;
    so_kho_het: number;
    so_kho_am: number;
    nhap_mua: { so_luong: number; gia_tri: number; so_phieu: number };
    cap_phat_nv: { so_luong: number; gia_tri: number; so_nguoi: number };
    tieu_dung_vp: { so_luong: number; gia_tri: number };
    gia_nhap_cuoi: number | null;
    ngay_nhap_cuoi: string | null;
    gia_nhap_tb: number | null;
    phat_sinh_cuoi: string | null;
  };
  toi_thieu: { ton_toi_thieu: number | null; muc: MucTon; danh_gia: string; de_xuat: string; thieu: number } | null;
  theo_kho: KhoTon[];
  tieu_dung: { kho_id: number; ten_kho: string; so_luong: number; gia_tri: number; lan_cuoi: string }[];
  nguoi_nhan: { ma_nv: string | null; ten: string; bo_phan: string | null; so_luong: number; so_lan: number; gia_tri: number; lan_cuoi: string }[];
  lich_su: DongLs[];
}

const NHAN_KIEU: Record<Kieu, string> = {
  nhap_mua: t("Nhập mua"),
  chuyen_kho: t("Chuyển kho"),
  cap_phat: t("Cấp phát NV"),
  tieu_dung: t("Tiêu dùng VP"),
  dieu_chinh: t("Điều chỉnh"),
};
const CHIP_KIEU: Record<Kieu, string> = { nhap_mua: "Nhap mua", chuyen_kho: "Chuyen kho", cap_phat: "Cap phat NV", tieu_dung: "Tieu dung", dieu_chinh: "Dieu chinh" };
type Tab = "kho" | "lich-su" | "nguoi-nhan";

export function VatTuModal({ id, onClose, onMoPhieu }: { id: string; onClose: () => void; onMoPhieu: (id: string) => void }) {
  const [d, setD] = useState<DuLieu | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("kho");
  const [locKieu, setLocKieu] = useState<"" | Kieu>("");
  const [locKho, setLocKho] = useState("");
  const [tim, setTim] = useState("");
  const auth = useAuth();
  const suaDuoc = auth.status === "authenticated" && isHcns(auth.user);
  const [suaMin, setSuaMin] = useState(false);
  const [taiLai, setTaiLai] = useState(0);

  useEffect(() => {
    api
      .get<DuLieu>(`/vt-tieu-hao/${encodeURIComponent(id)}/chi-tiet`)
      .then(setD)
      .catch((e) => setLoi(thongBaoLoi(e, t("Không tải được thông tin vật tư."))));
  }, [id, taiLai]);

  const dvt = d?.vt.don_vi_tinh ?? "";
  const khoLs = useMemo(() => {
    const m = new Map<number, string>();
    for (const x of d?.lich_su ?? []) {
      if (x.tu_kho_id != null && x.tu) m.set(x.tu_kho_id, x.tu);
      if (x.den_kho_id != null && x.den) m.set(x.den_kho_id, x.den);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "vi"));
  }, [d]);
  const lichSu = useMemo(() => {
    const k = boDau(tim.trim());
    const kho = locKho ? Number(locKho) : null;
    return (d?.lich_su ?? []).filter(
      (x) =>
        (!locKieu || x.kieu === locKieu) &&
        (kho == null || x.tu_kho_id === kho || x.den_kho_id === kho) &&
        (!k || boDau(`${x.ma_phieu ?? ""} ${x.tu ?? ""} ${x.den ?? ""} ${x.nguoi_lap ?? ""} ${x.ghi_chu ?? ""}`).includes(k)),
    );
  }, [d, locKieu, locKho, tim]);
  const tLs = useTrangKhach(lichSu, [locKieu, locKho, tim]);
  const tNn = useTrangKhach(d?.nguoi_nhan ?? [], []);
  const khoChon = locKho ? Number(locKho) : null;

  /** So luong co dau theo kho dang loc: vao kho +, ra kho - (chua loc kho: so luong phieu). */
  function soCoDau(x: DongLs): number | null {
    if (khoChon == null) return null;
    if (x.kieu === "dieu_chinh") return x.so_luong;
    return x.den_kho_id === khoChon ? x.so_luong : -x.so_luong;
  }
  const xemKho = (khoId: number) => (setLocKho(String(khoId)), setLocKieu(""), setTim(""), setTab("lich-su"));

  function xuatExcel() {
    if (!d) return;
    exportRowsToExcel(
      lichSu.map((x) => ({
        ngay: x.ngay,
        ma_phieu: x.ma_phieu ?? x.phieu_id,
        loai: NHAN_KIEU[x.kieu],
        tu: x.tu ?? "",
        den: x.den ?? "",
        so_luong: x.so_luong,
        don_gia: x.don_gia ?? "",
        thanh_tien: x.thanh_tien,
        trang_thai: TRANG_THAI_CK[x.trang_thai]?.label ?? x.trang_thai,
        nguoi_lap: x.nguoi_lap ?? "",
      })),
      `lich-su_${d.vt.id}.xlsx`,
      t("Lịch sử"),
      { ngay: t("Ngày"), ma_phieu: t("Mã phiếu"), loai: t("Loại"), tu: t("Từ"), den: t("Đến"), so_luong: t("Số lượng"), don_gia: t("Đơn giá"), thanh_tien: t("Thành tiền"), trang_thai: t("Trạng thái"), nguoi_lap: t("Người lập") },
    );
  }

  const tg = d?.tong;
  return (
    <Modal size="xl" title={d ? `${d.vt.ten_vt}` : t("Chi tiết vật tư")} onClose={onClose}>
      {loi && <div className="alert alert-error">{loi}</div>}
      {!d && !loi && <div className="empty-state">{t("Đang tải…")}</div>}
      {d && tg && (
        <>
          <div className="muted small" style={{ marginBottom: 10 }}>
            {[d.vt.id, d.vt.ten_nhom, dvt && t("ĐVT: {x}", { x: dvt }), d.vt.cong_ty_ma, d.vt.don_gia_tham_khao != null ? t("Giá tham khảo {x}đ", { x: fmtSo(d.vt.don_gia_tham_khao) }) : null]
              .filter(Boolean)
              .join(" · ")}
            {d.vt.vo_hieu_hoa ? ` · ${t("Đã vô hiệu hoá")}` : ""}
            {d.pham_vi === "kho" && <div>{t("Bạn đang xem trong phạm vi các kho mình phụ trách.")}</div>}
          </div>

          <div className="info-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginBottom: 12 }}>
            <div className="info-item">
              <div className="info-label">{t("Tổng tồn hiện tại")}</div>
              <div className="info-value">
                <SoTon so={tg.ton} dvt={dvt} /> · <TienTe so={tg.gia_tri} />
                {tg.dang_chuyen > 0 && <div className="muted small">{t("+ {x} đang chuyển", { x: fmtSo(tg.dang_chuyen, 2) })}</div>}
              </div>
            </div>
            <div className="info-item">
              <div className="info-label">{t("Kho")}</div>
              <div className="info-value">
                {t("{a} còn hàng · {b} đã hết", { a: fmtSo(tg.so_kho_con_hang), b: fmtSo(tg.so_kho_het) })}
                {tg.so_kho_am > 0 && <span className="text-red"> · {t("{x} kho âm", { x: fmtSo(tg.so_kho_am) })}</span>}
              </div>
            </div>
            <div className="info-item">
              <div className="info-label">{t("Tồn tối thiểu")}</div>
              <div className="info-value">
                {d.toi_thieu && d.toi_thieu.muc !== "khong" ? (
                  <>
                    {fmtSo(d.toi_thieu.ton_toi_thieu ?? 0, 2)} <MucTonBadge muc={d.toi_thieu.muc} danhGia={d.toi_thieu.danh_gia} />
                    {d.vt.thoi_gian_dat_hang && <div className="muted small">{d.vt.thoi_gian_dat_hang}</div>}
                  </>
                ) : (
                  <span className="muted">{t("Chưa cài")}</span>
                )}
                {suaDuoc && (
                  <button type="button" className="btn btn-outline btn-sm" style={{ marginLeft: 6 }} onClick={() => setSuaMin(true)}>
                    {t("Sửa")}
                  </button>
                )}
              </div>
            </div>
            <div className="info-item">
              <div className="info-label">{t("Đã nhập mua")}</div>
              <div className="info-value">
                {fmtSo(tg.nhap_mua.so_luong, 2)} · <TienTe so={tg.nhap_mua.gia_tri} />
                <div className="muted small">
                  {tg.gia_nhap_cuoi != null
                    ? t("Giá nhập gần nhất {gia}đ ({ngay})", { gia: fmtSo(tg.gia_nhap_cuoi), ngay: fmtNgayGio(tg.ngay_nhap_cuoi, false) })
                    : t("{x} phiếu", { x: fmtSo(tg.nhap_mua.so_phieu) })}
                </div>
              </div>
            </div>
            <div className="info-item">
              <div className="info-label">{t("Đã cấp phát nhân viên")}</div>
              <div className="info-value">
                {tg.cap_phat_nv.so_luong ? (
                  <button type="button" className="so-link" onClick={() => setTab("nguoi-nhan")}>
                    {fmtSo(tg.cap_phat_nv.so_luong, 2)}
                  </button>
                ) : (
                  "0"
                )}{" "}
                · <TienTe so={tg.cap_phat_nv.gia_tri} />
                <div className="muted small">{t("{x} người nhận", { x: fmtSo(tg.cap_phat_nv.so_nguoi) })}</div>
              </div>
            </div>
            <div className="info-item">
              <div className="info-label">{t("Đã tiêu dùng văn phòng")}</div>
              <div className="info-value">
                {fmtSo(tg.tieu_dung_vp.so_luong, 2)} · <TienTe so={tg.tieu_dung_vp.gia_tri} />
                <div className="muted small">{tg.phat_sinh_cuoi ? t("Phát sinh cuối {x}", { x: fmtNgayGio(tg.phat_sinh_cuoi) }) : ""}</div>
              </div>
            </div>
          </div>

          <FilterTabs<Tab>
            tabs={[
              { key: "kho", label: t("Tồn theo kho"), count: d.theo_kho.length },
              { key: "lich-su", label: t("Lịch sử phiếu"), count: d.lich_su.length },
              { key: "nguoi-nhan", label: t("Người nhận cấp phát"), count: d.nguoi_nhan.length },
            ]}
            value={tab}
            onChange={setTab}
          />

          {tab === "kho" && (
            <>
              <div className="task-table-wrapper" style={{ maxHeight: 360, overflow: "auto" }}>
                <table className="task-table">
                  <thead>
                    <tr>
                      <th>{t("Kho")}</th>
                      <th style={{ textAlign: "right" }}>{t("Tồn")}</th>
                      <th style={{ textAlign: "right" }}>{t("Giá trị")}</th>
                      <th style={{ textAlign: "right" }}>{t("Nhập / Xuất lũy kế")}</th>
                      <th>{t("Phát sinh cuối")}</th>
                      <th>{t("Tình trạng")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.theo_kho.length === 0 && (
                      <tr>
                        <td colSpan={6} className="task-empty">
                          {t("Chưa có kho nào phát sinh vật tư này.")}
                        </td>
                      </tr>
                    )}
                    {d.theo_kho.map((k) => (
                      <tr key={k.kho_id} className={`row-clickable${k.ton < 0 ? " row-canh-bao" : ""}`} title={t("Xem lịch sử tại kho này")} onClick={() => xemKho(k.kho_id)}>
                        <td data-label={t("Kho")}>
                          <KhoTag ten={k.ten_kho} loai={k.loai} />
                          <div className="muted small">{LOAI_KHO[k.loai as keyof typeof LOAI_KHO] ?? k.loai}</div>
                        </td>
                        <td data-label={t("Tồn")} style={{ textAlign: "right" }}>
                          <SoTon so={k.ton} dvt={dvt} />
                          {k.dang_chuyen_den > 0 && <div className="muted small">{t("+ {x} đang chuyển", { x: fmtSo(k.dang_chuyen_den, 2) })}</div>}
                        </td>
                        <td data-label={t("Giá trị")} style={{ textAlign: "right" }}>
                          <TienTe so={k.gia_tri || null} />
                        </td>
                        <td data-label={t("Nhập / Xuất lũy kế")} style={{ textAlign: "right" }}>
                          {fmtSo(k.tong_nhap, 2)} / {fmtSo(k.tong_xuat, 2)}
                          {k.dieu_chinh !== 0 && <div className="muted small">{t("Điều chỉnh {x}", { x: fmtSo(k.dieu_chinh, 2) })}</div>}
                        </td>
                        <td data-label={t("Phát sinh cuối")}>{fmtNgayGio(k.phat_sinh_cuoi)}</td>
                        <td data-label={t("Tình trạng")}>
                          <StatusBadge label={k.ton > 0 ? t("Còn hàng") : k.ton < 0 ? t("Tồn âm") : t("Đã hết")} tone={k.ton > 0 ? "success" : k.ton < 0 ? "danger" : "neutral"} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {d.tieu_dung.length > 0 && (
                <>
                  <div className="section-title" style={{ marginTop: 14 }}>
                    {t("Đã xuất vào điểm tiêu dùng văn phòng (không tính tồn)")}
                  </div>
                  <div className="task-table-wrapper">
                    <table className="task-table">
                      <tbody>
                        {d.tieu_dung.map((k) => (
                          <tr key={k.kho_id} className="row-clickable" onClick={() => xemKho(k.kho_id)}>
                            <td data-label={t("Kho")}>
                              <KhoTag ten={k.ten_kho} loai="Tieu hao" />
                            </td>
                            <td data-label={t("Số lượng")} style={{ textAlign: "right" }}>
                              {fmtSo(k.so_luong, 2)} {dvt}
                            </td>
                            <td data-label={t("Giá trị")} style={{ textAlign: "right" }}>
                              <TienTe so={k.gia_tri} />
                            </td>
                            <td data-label={t("Lần cuối")}>{fmtNgayGio(k.lan_cuoi)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {tab === "lich-su" && (
            <>
              <div className="filter-bar">
                <input className="search-input" style={{ maxWidth: 220 }} placeholder={t("Tìm mã phiếu, kho, người nhận...")} value={tim} onChange={(e) => setTim(e.target.value)} />
                <ChonLoc value={locKieu} onChange={(e) => setLocKieu(e.target.value as "" | Kieu)} aria-label={t("Loại")}>
                  <option value="">{t("Mọi loại phiếu")}</option>
                  {(Object.keys(NHAN_KIEU) as Kieu[]).map((k) => (
                    <option key={k} value={k}>
                      {NHAN_KIEU[k]}
                    </option>
                  ))}
                </ChonLoc>
                <ChonLoc value={locKho} onChange={(e) => setLocKho(e.target.value)} aria-label={t("Kho")}>
                  <option value="">{t("Mọi kho")}</option>
                  {khoLs.map(([kid, ten]) => (
                    <option key={kid} value={kid}>
                      {ten}
                    </option>
                  ))}
                </ChonLoc>
                <button type="button" className="btn btn-outline btn-sm" onClick={xuatExcel} disabled={!lichSu.length}>
                  <Download size={13} /> {t("Xuất Excel")}
                </button>
              </div>
              <div className="task-table-wrapper" style={{ maxHeight: 420, overflow: "auto" }}>
                <table className="task-table">
                  <thead>
                    <tr>
                      <th>{t("Ngày")}</th>
                      <th>{t("Phiếu")}</th>
                      <th>{t("Từ → Đến")}</th>
                      <th style={{ textAlign: "right" }}>{khoChon != null ? t("Vào (+) / Ra (−)") : t("Số lượng")}</th>
                      <th style={{ textAlign: "right" }}>{t("Thành tiền")}</th>
                      <th>{t("Trạng thái")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lichSu.length === 0 && (
                      <tr>
                        <td colSpan={6} className="task-empty">
                          {t("Không có phiếu khớp bộ lọc.")}
                        </td>
                      </tr>
                    )}
                    {tLs.dongTrang.map((x, i) => {
                      const so = soCoDau(x);
                      const tt = TRANG_THAI_CK[x.trang_thai];
                      return (
                        <tr key={`${x.phieu_id}:${i}`}>
                          <td data-label={t("Ngày")}>
                            {fmtNgayGio(x.ngay)}
                            {x.nguoi_lap && <div className="muted small">{x.nguoi_lap}</div>}
                          </td>
                          <td data-label={t("Phiếu")}>
                            <span className="code-link" onClick={() => onMoPhieu(x.phieu_id)}>
                              {x.ma_phieu ?? x.phieu_id}
                            </span>
                            <div>
                              <LoaiChip loai={CHIP_KIEU[x.kieu]} nhan={NHAN_KIEU[x.kieu]} />
                            </div>
                          </td>
                          <td data-label={t("Từ → Đến")}>
                            {x.tu ?? "-"} →{" "}
                            <b>{x.den_nhan_vien_id ? <NvLink ma={x.den_nhan_vien_id} ten={x.den} /> : (x.den ?? (x.kieu === "dieu_chinh" ? t("Tại chính kho này") : "-"))}</b>
                            {x.khac_cong_ty && <div className="muted small">{t("Chuyển giữa 2 công ty")}</div>}
                          </td>
                          <td data-label={t("Số lượng")} style={{ textAlign: "right" }}>
                            {so != null ? <SoTon so={so} /> : fmtSo(x.so_luong, 2)}
                            {x.don_gia != null && <div className="muted small">× {fmtSo(x.don_gia)}</div>}
                          </td>
                          <td data-label={t("Thành tiền")} style={{ textAlign: "right" }}>
                            <TienTe so={x.thanh_tien} />
                          </td>
                          <td data-label={t("Trạng thái")}>
                            <StatusBadge label={tt?.label ?? x.trang_thai} tone={tt?.tone ?? "neutral"} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <PhanTrang trang={tLs.trang} tong={tLs.tong} onDoi={tLs.setTrang} donVi={t("phiếu")} />
            </>
          )}

          {tab === "nguoi-nhan" && (
            <>
              <div className="task-table-wrapper" style={{ maxHeight: 420, overflow: "auto" }}>
                <table className="task-table">
                  <thead>
                    <tr>
                      <th>{t("Người nhận")}</th>
                      <th style={{ textAlign: "right" }}>{t("Số lượng")}</th>
                      <th style={{ textAlign: "right" }}>{t("Số lần")}</th>
                      <th style={{ textAlign: "right" }}>{t("Giá trị")}</th>
                      <th>{t("Lần cuối")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.nguoi_nhan.length === 0 && (
                      <tr>
                        <td colSpan={5} className="task-empty">
                          {t("Chưa cấp phát cho nhân viên nào.")}
                        </td>
                      </tr>
                    )}
                    {tNn.dongTrang.map((x) => (
                      <tr key={`${x.ma_nv ?? x.ten}`} className="row-clickable" title={t("Xem các phiếu cấp cho người này")} onClick={() => (setLocKieu("cap_phat"), setLocKho(""), setTim(x.ten), setTab("lich-su"))}>
                        <td data-label={t("Người nhận")}>
                          <b>{x.ma_nv ? <NvLink ma={x.ma_nv} ten={x.ten} /> : tS(x.ten)}</b>
                          <div className="muted small">{[x.ma_nv, x.bo_phan].filter(Boolean).join(" · ") || t("Ngoài danh bạ")}</div>
                        </td>
                        <td data-label={t("Số lượng")} style={{ textAlign: "right" }}>
                          {fmtSo(x.so_luong, 2)} {dvt}
                        </td>
                        <td data-label={t("Số lần")} style={{ textAlign: "right" }}>
                          {fmtSo(x.so_lan)}
                        </td>
                        <td data-label={t("Giá trị")} style={{ textAlign: "right" }}>
                          <TienTe so={x.gia_tri} />
                        </td>
                        <td data-label={t("Lần cuối")}>{fmtNgayGio(x.lan_cuoi)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PhanTrang trang={tNn.trang} tong={tNn.tong} onDoi={tNn.setTrang} donVi={t("người")} />
            </>
          )}
        </>
      )}
      {suaMin && d && (
        <SuaTonToiThieuVt
          vt={{ id: d.vt.id, ten_vt: d.vt.ten_vt, don_vi_tinh: d.vt.don_vi_tinh, ton_toi_thieu: d.toi_thieu?.ton_toi_thieu ?? null, thoi_gian_dat_hang: d.vt.thoi_gian_dat_hang }}
          onClose={() => setSuaMin(false)}
          onXong={() => {
            setSuaMin(false);
            setTaiLai((x) => x + 1);
          }}
        />
      )}
    </Modal>
  );
}
