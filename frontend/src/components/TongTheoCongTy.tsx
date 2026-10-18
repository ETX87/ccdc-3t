import { t } from "../lib/i18n";
import { Building2, Layers } from "lucide-react";
import { fmtGiaTri, fmtSo } from "../lib/format";

// "Kho tong tat ca cong ty" (2026-10-18, user: nhan vien thuoc nhieu cong ty, moi cong ty 1 kho CCDC rieng + kho tong
// tat ca cong ty) = BAO CAO GOP, khong phai kho that: cong don so lieu tung cong ty + dong tong.

type CongTy = { id: number; ma: string; ten: string };

/** Tai san / tieu hao cua 1 nguoi kiem nhiem: tach theo cong ty + tong. */
export function TongTheoCongTyCaNhan({
  congTy,
  taiSan,
  tieuHao,
}: {
  congTy: CongTy[];
  taiSan: { cong_ty_id?: number; gia_tri: number | null }[];
  tieuHao: { cong_ty_id?: number; gia_tri: number | null }[];
}) {
  const dong = congTy
    .map((ct) => {
      const ts = taiSan.filter((x) => x.cong_ty_id === ct.id);
      const th = tieuHao.filter((x) => x.cong_ty_id === ct.id);
      return { ct, soTs: ts.length, gtTs: ts.reduce((a, x) => a + (x.gia_tri ?? 0), 0), soTh: th.length, gtTh: th.reduce((a, x) => a + (x.gia_tri ?? 0), 0) };
    })
    .filter((d) => d.soTs || d.soTh);
  if (dong.length < 2) return null;
  const tong = dong.reduce((a, d) => ({ soTs: a.soTs + d.soTs, gtTs: a.gtTs + d.gtTs, soTh: a.soTh + d.soTh, gtTh: a.gtTh + d.gtTh }), { soTs: 0, gtTs: 0, soTh: 0, gtTh: 0 });
  return (
    <div className="content-card">
      <div className="card-header">
        <div className="card-title-wrap">
          <Layers size={17} className="card-title-icon text-teal" />
          <h2 className="card-title">{t("Tài sản của tôi theo công ty")}</h2>
        </div>
      </div>
      <div className="task-table-wrapper">
        <table className="task-table">
          <thead>
            <tr>
              <th>{t("Công ty")}</th>
              <th style={{ textAlign: "right" }}>{t("TSCĐ đang giữ")}</th>
              <th style={{ textAlign: "right" }}>{t("Tiêu hao đã nhận")}</th>
            </tr>
          </thead>
          <tbody>
            {dong.map((d) => (
              <tr key={d.ct.id}>
                <td data-label={t("Công ty")}>
                  <span className="nb-tag">
                    <span className="nb-tag-icon nb-blue">
                      <Building2 size={11} strokeWidth={2.4} />
                    </span>
                    <span className="nb-tag-ten">
                      {d.ct.ma} - {d.ct.ten}
                    </span>
                  </span>
                </td>
                <td data-label={t("TSCĐ đang giữ")} style={{ textAlign: "right" }}>
                  <div className="strong">{fmtSo(d.soTs)}</div>
                  {d.gtTs > 0 && <div className="muted small">{fmtGiaTri(d.gtTs)}</div>}
                </td>
                <td data-label={t("Tiêu hao đã nhận")} style={{ textAlign: "right" }}>
                  <div className="strong">{t("{n} phiếu", { n: fmtSo(d.soTh) })}</div>
                  {d.gtTh > 0 && <div className="muted small">{fmtGiaTri(d.gtTh)}</div>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="nb-tong">
              <td>{t("Tất cả công ty")}</td>
              <td style={{ textAlign: "right" }}>
                {fmtSo(tong.soTs)} · {fmtGiaTri(tong.gtTs)}
              </td>
              <td style={{ textAlign: "right" }}>
                {t("{n} phiếu", { n: fmtSo(tong.soTh) })} · {fmtGiaTri(tong.gtTh)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export interface SoLieuKhoCt {
  cong_ty_id: number;
  bat_tat: number;
  ts_trong_kho: number;
  gt_ts: number;
  gt_tieu_hao: number;
  ton_am: number;
  cho_nhan: number;
  nxt?: { gt_dau: number; gt_nhap: number; gt_xuat: number; gt_cuoi: number } | null;
}

/** Kho & ton: dong tong tung cong ty + "Tat ca cong ty" (kho tong gop). Bam 1 cong ty -> loc bang kho ben duoi. */
export function TongTheoCongTyKho({
  congTy,
  rows,
  dangChon,
  onChon,
  nhanKy,
}: {
  congTy: CongTy[];
  rows: SoLieuKhoCt[];
  dangChon: number | null;
  onChon: (id: number | null) => void;
  nhanKy: string;
}) {
  const tinh = (ds: SoLieuKhoCt[]) =>
    ds.reduce(
      (a, k) => ({
        soKho: a.soKho + (k.bat_tat ? 1 : 0),
        ts: a.ts + k.ts_trong_kho,
        gtTs: a.gtTs + k.gt_ts,
        gtTh: a.gtTh + k.gt_tieu_hao,
        am: a.am + k.ton_am,
        choNhan: a.choNhan + k.cho_nhan,
        dau: a.dau + (k.nxt?.gt_dau ?? 0),
        nhap: a.nhap + (k.nxt?.gt_nhap ?? 0),
        xuat: a.xuat + (k.nxt?.gt_xuat ?? 0),
        cuoi: a.cuoi + (k.nxt?.gt_cuoi ?? 0),
      }),
      { soKho: 0, ts: 0, gtTs: 0, gtTh: 0, am: 0, choNhan: 0, dau: 0, nhap: 0, xuat: 0, cuoi: 0 },
    );
  const dong = congTy.map((ct) => ({ ct, s: tinh(rows.filter((k) => k.cong_ty_id === ct.id)) })).filter((d) => d.s.soKho);
  if (dong.length < 2) return null;
  const tong = tinh(rows);
  const o = (s: ReturnType<typeof tinh>) => (
    <>
      <td data-label={t("Kho đang hoạt động")} style={{ textAlign: "right" }}>
        {fmtSo(s.soKho)}
      </td>
      <td data-label={t("TSCĐ trong kho")} style={{ textAlign: "right" }}>
        <div className="strong">{fmtSo(s.ts)}</div>
        {s.gtTs > 0 && <div className="muted small">{fmtGiaTri(s.gtTs)}</div>}
      </td>
      <td data-label={t("Tồn đầu kỳ")} style={{ textAlign: "right" }}>
        {fmtGiaTri(s.dau)}
      </td>
      <td data-label={t("Nhập")} style={{ textAlign: "right" }} className="nb-nhap">
        {fmtGiaTri(s.nhap)}
      </td>
      <td data-label={t("Xuất")} style={{ textAlign: "right" }} className="nb-xuat">
        {fmtGiaTri(s.xuat)}
      </td>
      <td data-label={t("Tồn cuối kỳ")} style={{ textAlign: "right" }}>
        <span className="strong">{fmtGiaTri(s.cuoi)}</span>
      </td>
      <td data-label={t("Tồn âm")} style={{ textAlign: "center" }}>
        {s.am ? <span className="nb-so nb-so-am">{fmtSo(s.am)}</span> : <span className="muted">0</span>}
      </td>
      <td data-label={t("Chờ nhận")} style={{ textAlign: "center" }}>
        {s.choNhan ? fmtSo(s.choNhan) : <span className="muted">0</span>}
      </td>
    </>
  );
  return (
    <div className="content-card">
      <div className="card-header">
        <div className="card-title-wrap">
          <Layers size={17} className="card-title-icon text-teal" />
          <h2 className="card-title">{t("Kho tổng tất cả công ty")}</h2>
        </div>
        <span className="muted small">{t("Giá trị tiêu hao kỳ {ky} · bấm 1 công ty để lọc bảng kho", { ky: nhanKy })}</span>
      </div>
      <div className="task-table-wrapper">
        <table className="task-table">
          <thead>
            <tr>
              <th>{t("Công ty")}</th>
              <th style={{ textAlign: "right" }}>{t("Kho đang hoạt động")}</th>
              <th style={{ textAlign: "right" }}>{t("TSCĐ trong kho")}</th>
              <th style={{ textAlign: "right" }}>{t("Tồn đầu kỳ")}</th>
              <th style={{ textAlign: "right" }}>{t("Nhập")}</th>
              <th style={{ textAlign: "right" }}>{t("Xuất")}</th>
              <th style={{ textAlign: "right" }}>{t("Tồn cuối kỳ")}</th>
              <th style={{ textAlign: "center" }}>{t("Tồn âm")}</th>
              <th style={{ textAlign: "center" }}>{t("Chờ nhận")}</th>
            </tr>
          </thead>
          <tbody>
            {dong.map(({ ct, s }) => (
              <tr
                key={ct.id}
                className={`row-clickable${dangChon === ct.id ? " row-chu-y" : ""}`}
                onClick={() => onChon(dangChon === ct.id ? null : ct.id)}
                title={t("Lọc bảng kho theo công ty này")}
              >
                <td data-label={t("Công ty")}>
                  <span className="nb-tag">
                    <span className="nb-tag-icon nb-blue">
                      <Building2 size={11} strokeWidth={2.4} />
                    </span>
                    <span className="nb-tag-ten strong">
                      {ct.ma} - {ct.ten}
                    </span>
                  </span>
                </td>
                {o(s)}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="nb-tong row-clickable" onClick={() => onChon(null)} title={t("Bỏ lọc công ty")}>
              <td>{t("Tất cả công ty")}</td>
              {o(tong)}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
