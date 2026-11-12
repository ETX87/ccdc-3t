import { t } from "../lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { Modal } from "./Modal";
import { StatusBadge } from "./StatusBadge";
import { FilterTabs } from "./FilterTabs";
import { BangLoc, type CotBang } from "./BangLoc";
import { LoaiChip, TienTe } from "./NoiBat";
import { fmtNgayGio, fmtSo } from "../lib/format";
import { LOAI_GIAO_NHAN, thongBaoLoi, TINH_TRANG_TS, TRANG_THAI_CK, TRANG_THAI_TS } from "../lib/nhan";
import { useKhiThayDoi } from "../lib/suKien";
import { NvLink, PhieuLink, TsLink, VtLink } from "./LienKet";

// Ho so 1 nhan vien (2026-11-12, user: tim nhan vien -> mo thang chi tiet, popup 95% man hinh): thong tin, tai san dang
// giu, tieu hao duoc cap phat (gop theo mat hang + tung lan), lich su giao nhan tai san. Moi bang loc / sap xep tung cot
// (BangLoc) + xuat Excel; bam dong mo phieu / tai san (popup chong, Dong quay ve ho so). GET /nhan-vien/:ma/ho-so.

interface DuLieu {
  nv: {
    ma_nv: string;
    ten_nv: string;
    bo_phan: string | null;
    chuc_vu: string | null;
    sdt: string | null;
    email_dang_nhap: string | null;
    dang_lam_viec: number;
    ma_etx: string | null;
    cong_ty_id: number;
    quan_ly_id: string | null;
    quan_ly_ten: string | null;
    cong_ty: { id: number; ma: string; ten: string }[];
  };
  tong: {
    ts_so: number;
    ts_gia_tri: number;
    ts_cho_xac_nhan: number;
    th_so_phieu: number;
    th_so_mat_hang: number;
    th_gia_tri: number;
    th_phieu_cho_xac_nhan: number;
    th_lan_cuoi: string | null;
  };
  tai_san: TaiSan[];
  giao_nhan: GiaoNhan[];
  tieu_hao: TieuHao[];
  tieu_hao_theo_vt: TheoVt[];
}
interface TaiSan {
  id: string;
  ten_ccdc: string;
  ten_nhom: string | null;
  trang_thai_hien_tai: string;
  tinh_trang: string | null;
  so_seri: string | null;
  nguyen_gia: number | null;
  ngay_mua: string | null;
  han_bao_hanh: string | null;
  cong_ty_ma: string | null;
  ngay_nhan: string | null;
}
interface GiaoNhan {
  phieu_id: string;
  ma_phieu: string | null;
  loai_phieu: string;
  ngay_lap: string;
  da_xac_nhan: number;
  nguoi_lap: string;
  ghi_chu: string | null;
  ccdc_id: string;
  ten_ccdc: string;
  nguyen_gia: number | null;
  huong: "nhan" | "tra";
  doi_tac: string | null;
  nhan_vien_id: string | null;
  nhan_vien_nhan_moi_id: string | null;
}
interface TieuHao {
  phieu_id: string;
  ma_phieu: string | null;
  created_at: string;
  trang_thai: string;
  da_xac_nhan: number;
  nguoi_lap: string;
  ghi_chu: string | null;
  tu_kho: string;
  vt_id: string;
  ten_vt: string;
  don_vi_tinh: string | null;
  ten_nhom: string | null;
  so_luong: number;
  don_gia: number | null;
  thanh_tien: number | null;
}
interface TheoVt {
  vt_id: string;
  ten_vt: string;
  don_vi_tinh: string | null;
  ten_nhom: string | null;
  so_luong: number;
  so_lan: number;
  gia_tri: number;
  da_nhan: number;
  cho_xac_nhan: number;
  lan_dau: string;
  lan_cuoi: string;
}
type Tab = "tai-san" | "tieu-hao-vt" | "tieu-hao" | "giao-nhan";

export function NhanVienModal({
  ma,
  onClose,
  onMoPhieu,
  onMoTaiSan,
  onMoVatTu,
}: {
  ma: string;
  onClose: () => void;
  onMoPhieu: (loai: "chuyen_kho" | "giao_nhan", id: string) => void;
  onMoTaiSan: (id: string) => void;
  onMoVatTu: (id: string) => void;
}) {
  const [d, setD] = useState<DuLieu | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("tai-san");
  const [lan, setLan] = useState(0);
  useKhiThayDoi(() => setLan((x) => x + 1));

  useEffect(() => {
    api
      .get<DuLieu>(`/nhan-vien/${encodeURIComponent(ma)}/ho-so`)
      .then(setD)
      .catch((e) => setLoi(thongBaoLoi(e, t("Không tải được hồ sơ nhân viên."))));
  }, [ma, lan]);

  const ten = (s: string) => `${s}_${ma}`.replace(/[^\w-]+/g, "_");
  const cotTs = useMemo<CotBang<TaiSan>[]>(
    () => [
      { key: "id", nhan: t("Mã tài sản"), kieu: "chu", giaTri: (r) => r.id, hien: (r) => <span className="code-link">{r.id}</span> },
      { key: "ten", nhan: t("Tên tài sản"), kieu: "chu", giaTri: (r) => r.ten_ccdc },
      { key: "nhom", nhan: t("Nhóm"), kieu: "chon", giaTri: (r) => r.ten_nhom ?? "" },
      { key: "seri", nhan: t("Số seri"), kieu: "chu", giaTri: (r) => r.so_seri ?? "" },
      {
        key: "tt",
        nhan: t("Trạng thái"),
        kieu: "chon",
        giaTri: (r) => TRANG_THAI_TS[r.trang_thai_hien_tai]?.label ?? r.trang_thai_hien_tai,
        hien: (r) => <StatusBadge label={TRANG_THAI_TS[r.trang_thai_hien_tai]?.label ?? r.trang_thai_hien_tai} tone={TRANG_THAI_TS[r.trang_thai_hien_tai]?.tone} />,
      },
      { key: "tinh", nhan: t("Tình trạng"), kieu: "chon", giaTri: (r) => (r.tinh_trang ? (TINH_TRANG_TS[r.tinh_trang] ?? r.tinh_trang) : "") },
      { key: "nhan", nhan: t("Ngày nhận"), kieu: "ngay", giaTri: (r) => r.ngay_nhan ?? "", hien: (r) => fmtNgayGio(r.ngay_nhan, false) },
      { key: "bh", nhan: t("Hạn bảo hành"), kieu: "ngay", giaTri: (r) => r.han_bao_hanh ?? "", hien: (r) => fmtNgayGio(r.han_bao_hanh, false) },
      { key: "gia", nhan: t("Nguyên giá"), kieu: "so", canPhai: true, giaTri: (r) => r.nguyen_gia ?? 0, hien: (r) => <TienTe so={r.nguyen_gia} /> },
      { key: "ct", nhan: t("Công ty"), kieu: "chon", giaTri: (r) => r.cong_ty_ma ?? "" },
    ],
    [],
  );
  const cotVt = useMemo<CotBang<TheoVt>[]>(
    () => [
      { key: "ten", nhan: t("Vật tư"), kieu: "chu", giaTri: (r) => `${r.ten_vt} (${r.vt_id})`, hien: (r) => (
        <>
          <span className="strong">{r.ten_vt}</span>
          <div className="muted small">{r.vt_id}</div>
        </>
      ) },
      { key: "nhom", nhan: t("Nhóm"), kieu: "chon", giaTri: (r) => r.ten_nhom ?? "" },
      { key: "dvt", nhan: t("ĐVT"), kieu: "chon", giaTri: (r) => r.don_vi_tinh ?? "" },
      { key: "sl", nhan: t("Tổng được cấp"), kieu: "so", canPhai: true, giaTri: (r) => r.so_luong, hien: (r) => <b>{fmtSo(r.so_luong, 2)}</b> },
      { key: "nhan", nhan: t("Đã nhận (tiêu dùng)"), kieu: "so", canPhai: true, giaTri: (r) => r.da_nhan, hien: (r) => fmtSo(r.da_nhan, 2) },
      {
        key: "cho",
        nhan: t("Chưa xác nhận"),
        kieu: "so",
        canPhai: true,
        giaTri: (r) => r.cho_xac_nhan,
        hien: (r) => (r.cho_xac_nhan ? <span className="text-orange">{fmtSo(r.cho_xac_nhan, 2)}</span> : <span className="muted">0</span>),
      },
      { key: "lan", nhan: t("Số lần"), kieu: "so", canPhai: true, giaTri: (r) => r.so_lan },
      { key: "gt", nhan: t("Giá trị"), kieu: "so", canPhai: true, giaTri: (r) => r.gia_tri, hien: (r) => <TienTe so={r.gia_tri} /> },
      { key: "dau", nhan: t("Lần đầu"), kieu: "ngay", giaTri: (r) => r.lan_dau, hien: (r) => fmtNgayGio(r.lan_dau, false) },
      { key: "cuoi", nhan: t("Lần gần nhất"), kieu: "ngay", giaTri: (r) => r.lan_cuoi, hien: (r) => fmtNgayGio(r.lan_cuoi, false) },
    ],
    [],
  );
  const cotTh = useMemo<CotBang<TieuHao>[]>(
    () => [
      { key: "ngay", nhan: t("Ngày"), kieu: "ngay", giaTri: (r) => r.created_at, hien: (r) => fmtNgayGio(r.created_at) },
      { key: "ma", nhan: t("Mã phiếu"), kieu: "chu", giaTri: (r) => r.ma_phieu ?? r.phieu_id, hien: (r) => <PhieuLink loai="chuyen_kho" id={r.phieu_id} ma={r.ma_phieu} /> },
      { key: "kho", nhan: t("Kho xuất"), kieu: "chon", giaTri: (r) => r.tu_kho },
      { key: "vt", nhan: t("Vật tư"), kieu: "chu", giaTri: (r) => `${r.ten_vt} (${r.vt_id})`, hien: (r) => <VtLink id={r.vt_id} ten={r.ten_vt} /> },
      { key: "nhom", nhan: t("Nhóm"), kieu: "chon", giaTri: (r) => r.ten_nhom ?? "" },
      { key: "sl", nhan: t("SL"), kieu: "so", canPhai: true, giaTri: (r) => r.so_luong, hien: (r) => `${fmtSo(r.so_luong, 2)} ${r.don_vi_tinh ?? ""}` },
      { key: "dg", nhan: t("Đơn giá"), kieu: "so", canPhai: true, giaTri: (r) => r.don_gia ?? "", hien: (r) => (r.don_gia != null ? fmtSo(r.don_gia) : "-") },
      { key: "tt", nhan: t("Thành tiền"), kieu: "so", canPhai: true, giaTri: (r) => r.thanh_tien ?? 0, hien: (r) => <TienTe so={r.thanh_tien} /> },
      {
        key: "trang",
        nhan: t("Trạng thái"),
        kieu: "chon",
        giaTri: (r) => (r.trang_thai === "Da giao" ? (r.da_xac_nhan ? t("Đã nhận") : t("Chờ NV xác nhận")) : (TRANG_THAI_CK[r.trang_thai]?.label ?? r.trang_thai)),
        hien: (r) =>
          r.trang_thai === "Da giao" ? (
            <StatusBadge label={r.da_xac_nhan ? t("Đã nhận") : t("Chờ NV xác nhận")} tone={r.da_xac_nhan ? "success" : "warning"} />
          ) : (
            <StatusBadge label={TRANG_THAI_CK[r.trang_thai]?.label ?? r.trang_thai} tone={TRANG_THAI_CK[r.trang_thai]?.tone} />
          ),
      },
      { key: "lap", nhan: t("Người lập"), kieu: "chon", giaTri: (r) => r.nguoi_lap },
      { key: "gc", nhan: t("Ghi chú"), kieu: "chu", giaTri: (r) => r.ghi_chu ?? "" },
    ],
    [],
  );
  const cotGn = useMemo<CotBang<GiaoNhan>[]>(
    () => [
      { key: "ngay", nhan: t("Ngày"), kieu: "ngay", giaTri: (r) => r.ngay_lap, hien: (r) => fmtNgayGio(r.ngay_lap) },
      { key: "ma", nhan: t("Mã phiếu"), kieu: "chu", giaTri: (r) => r.ma_phieu ?? r.phieu_id, hien: (r) => <PhieuLink loai="giao_nhan" id={r.phieu_id} ma={r.ma_phieu} /> },
      { key: "loai", nhan: t("Loại"), kieu: "chon", giaTri: (r) => LOAI_GIAO_NHAN[r.loai_phieu] ?? r.loai_phieu, hien: (r) => <LoaiChip loai={r.loai_phieu} nhan={LOAI_GIAO_NHAN[r.loai_phieu] ?? r.loai_phieu} /> },
      {
        key: "huong",
        nhan: t("Chiều"),
        kieu: "chon",
        giaTri: (r) => (r.huong === "nhan" ? t("Nhận vào") : t("Trả ra")),
        hien: (r) => <StatusBadge label={r.huong === "nhan" ? t("Nhận vào") : t("Trả ra")} tone={r.huong === "nhan" ? "success" : "neutral"} />,
      },
      {
        key: "dt",
        nhan: t("Từ / đến"),
        kieu: "chu",
        giaTri: (r) => r.doi_tac ?? "",
        // Dieu chuyen: doi tac la nhan vien (nguoi giu cu / nguoi nhan moi) -> bam mo ho so.
        hien: (r) =>
          r.loai_phieu === "Dieu chuyen" ? <NvLink ma={r.huong === "nhan" ? r.nhan_vien_id : r.nhan_vien_nhan_moi_id} ten={r.doi_tac} /> : (r.doi_tac ?? "-"),
      },
      { key: "ts", nhan: t("Tài sản"), kieu: "chu", giaTri: (r) => `${r.ten_ccdc} (${r.ccdc_id})`, hien: (r) => <TsLink id={r.ccdc_id} ten={r.ten_ccdc} /> },
      { key: "gia", nhan: t("Nguyên giá"), kieu: "so", canPhai: true, giaTri: (r) => r.nguyen_gia ?? 0, hien: (r) => <TienTe so={r.nguyen_gia} /> },
      {
        key: "xn",
        nhan: t("Xác nhận"),
        kieu: "chon",
        giaTri: (r) => (r.da_xac_nhan ? t("Đã xác nhận") : t("Chưa xác nhận")),
        hien: (r) => <StatusBadge label={r.da_xac_nhan ? t("Đã xác nhận") : t("Chưa xác nhận")} tone={r.da_xac_nhan ? "success" : "warning"} />,
      },
      { key: "lap", nhan: t("Người lập"), kieu: "chon", giaTri: (r) => r.nguoi_lap },
    ],
    [],
  );

  const nv = d?.nv;
  const tg = d?.tong;
  return (
    <Modal size="xl" title={nv ? `${nv.ten_nv} (${nv.ma_nv})` : t("Hồ sơ nhân viên")} onClose={onClose}>
      {loi && <div className="alert alert-error">{loi}</div>}
      {!d && !loi && <div className="empty-state">{t("Đang tải…")}</div>}
      {nv && tg && d && (
        <>
          <div className="info-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", marginBottom: 12 }}>
            <div className="info-item">
              <div className="info-label">{t("Bộ phận / chức vụ")}</div>
              <div className="info-value">{[nv.bo_phan, nv.chuc_vu].filter(Boolean).join(" · ") || "-"}</div>
            </div>
            <div className="info-item">
              <div className="info-label">{t("Công ty")}</div>
              <div className="info-value">
                {nv.cong_ty.map((c) => (c.id === nv.cong_ty_id ? c.ma : t("{ma} (kiêm nhiệm)", { ma: c.ma }))).join(", ")}
              </div>
            </div>
            <div className="info-item">
              <div className="info-label">{t("Quản lý trực tiếp")}</div>
              <div className="info-value">{nv.quan_ly_id ? <NvLink ma={nv.quan_ly_id} ten={`${nv.quan_ly_ten ?? ""} (${nv.quan_ly_id})`} /> : "-"}</div>
            </div>
            <div className="info-item">
              <div className="info-label">{t("Liên hệ / tài khoản")}</div>
              <div className="info-value">
                {[nv.sdt, nv.email_dang_nhap].filter(Boolean).join(" · ") || "-"}{" "}
                <StatusBadge label={nv.dang_lam_viec ? t("Đang làm việc") : t("Đã nghỉ")} tone={nv.dang_lam_viec ? "success" : "neutral"} />
              </div>
            </div>
          </div>
          <div className="info-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", marginBottom: 12 }}>
            <div className="info-item">
              <div className="info-label">{t("Tài sản đang giữ")}</div>
              <div className="info-value">
                <button type="button" className="so-link" onClick={() => setTab("tai-san")}>
                  {fmtSo(tg.ts_so)}
                </button>{" "}
                · <TienTe so={tg.ts_gia_tri} />
              </div>
            </div>
            <div className="info-item">
              <div className="info-label">{t("Tiêu hao được cấp")}</div>
              <div className="info-value">
                <button type="button" className="so-link" onClick={() => setTab("tieu-hao-vt")}>
                  {t("{n} mặt hàng", { n: fmtSo(tg.th_so_mat_hang) })}
                </button>{" "}
                · {t("{n} phiếu", { n: fmtSo(tg.th_so_phieu) })} · <TienTe so={tg.th_gia_tri} />
              </div>
            </div>
            <div className="info-item">
              <div className="info-label">{t("Chờ nhân viên xác nhận")}</div>
              <div className="info-value">
                {tg.th_phieu_cho_xac_nhan + tg.ts_cho_xac_nhan > 0 ? (
                  <span className="text-orange">
                    {t("{a} phiếu tiêu hao · {b} lượt tài sản", { a: fmtSo(tg.th_phieu_cho_xac_nhan), b: fmtSo(tg.ts_cho_xac_nhan) })}
                  </span>
                ) : (
                  <span className="muted">{t("Không có")}</span>
                )}
              </div>
            </div>
            <div className="info-item">
              <div className="info-label">{t("Cấp tiêu hao gần nhất")}</div>
              <div className="info-value">{fmtNgayGio(tg.th_lan_cuoi)}</div>
            </div>
          </div>

          <FilterTabs<Tab>
            value={tab}
            onChange={setTab}
            tabs={[
              { key: "tai-san", label: t("Tài sản đang giữ"), count: d.tai_san.length },
              { key: "tieu-hao-vt", label: t("Tiêu hao theo mặt hàng"), count: d.tieu_hao_theo_vt.length },
              { key: "tieu-hao", label: t("Lịch sử cấp phát tiêu hao"), count: d.tieu_hao.length },
              { key: "giao-nhan", label: t("Lịch sử giao nhận tài sản"), count: d.giao_nhan.length },
            ]}
          />
          <div style={{ marginTop: 10 }}>
            {tab === "tai-san" && (
              <BangLoc cot={cotTs} rows={d.tai_san} rowKey={(r) => r.id} onRowClick={(r) => onMoTaiSan(r.id)} tenFile={`${ten("Tai_san_dang_giu")}.xlsx`} rong={t("Không giữ tài sản nào.")} />
            )}
            {tab === "tieu-hao-vt" && (
              <BangLoc cot={cotVt} rows={d.tieu_hao_theo_vt} rowKey={(r) => r.vt_id} onRowClick={(r) => onMoVatTu(r.vt_id)} tenFile={`${ten("Tieu_hao_theo_mat_hang")}.xlsx`} rong={t("Chưa được cấp phát tiêu hao.")} />
            )}
            {tab === "tieu-hao" && (
              <BangLoc
                cot={cotTh}
                rows={d.tieu_hao}
                rowKey={(r, i) => `${r.phieu_id}-${r.vt_id}-${i}`}
                onRowClick={(r) => onMoPhieu("chuyen_kho", r.phieu_id)}
                rowClass={(r) => (r.trang_thai === "Da giao" && !r.da_xac_nhan ? "row-chu-y" : "")}
                tenFile={`${ten("Lich_su_cap_phat_tieu_hao")}.xlsx`}
                rong={t("Chưa được cấp phát tiêu hao.")}
              />
            )}
            {tab === "giao-nhan" && (
              <BangLoc
                cot={cotGn}
                rows={d.giao_nhan}
                rowKey={(r, i) => `${r.phieu_id}-${r.ccdc_id}-${i}`}
                onRowClick={(r) => onMoPhieu("giao_nhan", r.phieu_id)}
                rowClass={(r) => (r.huong === "nhan" && !r.da_xac_nhan ? "row-chu-y" : "")}
                tenFile={`${ten("Lich_su_giao_nhan_tai_san")}.xlsx`}
                rong={t("Chưa có phiếu giao nhận tài sản.")}
              />
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
