import type { BaoCaoTuan, NoiBat } from "./baoCaoTuan";
import { QUA_HAN_GIO } from "./baoCaoTuan";
import type { DongTonToiThieu, MucTon } from "./tonToiThieu";
import { taoXlsx, type SheetXlsx } from "./xlsx";

// Dung email HTML (inline style - Gmail/Outlook bo <style>) + file Excel dinh kem tu BaoCaoTuan. Bang mau theo
// DESIGN_SYSTEM.md (teal #006573, pastel KPI, do = phai xu ly, vang = sap toi han).

const TEAL = "#006573";
const MAU_MUC: Record<MucTon | NoiBat["muc"], { nen: string; chu: string }> = {
  het: { nen: "#FEE2E2", chu: "#B91C1C" },
  duoi: { nen: "#FEE2E2", chu: "#B91C1C" },
  cao: { nen: "#FEE2E2", chu: "#B91C1C" },
  sap: { nen: "#FFF9E7", chu: "#B45309" },
  trung_binh: { nen: "#FFF9E7", chu: "#B45309" },
  du: { nen: "#E4FAFB", chu: "#047857" },
  tot: { nen: "#E4FAFB", chu: "#047857" },
  khong: { nen: "#F1F5F9", chu: "#475569" },
};

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** 1234567 -> "1.234.567" (khong phu thuoc ICU cua runtime). */
export function soVN(n: number, le = 0): string {
  const am = n < 0;
  const [nguyen, thap] = Math.abs(n).toFixed(le).split(".");
  const s = nguyen.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${am ? "-" : ""}${s}${thap && Number(thap) ? `,${thap.replace(/0+$/, "")}` : ""}`;
}
/** Tien gon: 1,25 tỷ / 350,5 tr / 120.000 đ. */
export function tienVN(n: number): string {
  if (Math.abs(n) >= 1e9) return `${soVN(n / 1e9, 2)} tỷ`;
  if (Math.abs(n) >= 1e6) return `${soVN(n / 1e6, 1)} tr`;
  return `${soVN(n)} đ`;
}
const ngayVN = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const ngayGioVN = (d: string) => `${ngayVN(d)} ${d.slice(11, 16)}`;

function the(tieuDe: string, noiDung: string, phu = ""): string {
  return `<tr><td style="padding:18px 24px 6px 24px">
    <div style="font-size:15px;font-weight:700;color:#0F172A;margin:0 0 2px 0">${tieuDe}</div>
    ${phu ? `<div style="font-size:12px;color:#64748B;margin:0 0 10px 0">${phu}</div>` : `<div style="height:8px"></div>`}
    ${noiDung}
  </td></tr>`;
}

function kpi(o: { nhan: string; so: string; phu: string; nen: string; vien?: string }): string {
  return `<td width="25%" valign="top" style="padding:4px">
    <div style="background:${o.nen};border-radius:12px;padding:12px 12px 10px 12px;${o.vien ? `border-left:4px solid ${o.vien};` : ""}">
      <div style="font-size:11.5px;color:#475569;font-weight:600;text-transform:uppercase;letter-spacing:.3px">${o.nhan}</div>
      <div style="font-size:24px;font-weight:800;color:#0F172A;line-height:1.25;margin-top:4px">${o.so}</div>
      <div style="font-size:11.5px;color:#64748B;margin-top:2px">${o.phu}</div>
    </div></td>`;
}

function bang(cot: { nhan: string; phai?: boolean; rong?: string }[], dong: string[][], rong = "Không có dữ liệu."): string {
  const th = cot
    .map((c) => `<th align="${c.phai ? "right" : "left"}" style="padding:8px 10px;font-size:11.5px;color:#475569;font-weight:700;background:#F1F5F9;border-bottom:1px solid #E2E8F0${c.rong ? `;width:${c.rong}` : ""}">${c.nhan}</th>`)
    .join("");
  const td = dong.length
    ? dong
        .map(
          (d, i) =>
            `<tr style="background:${i % 2 ? "#FAFCFE" : "#FFFFFF"}">${d
              .map((v, j) => `<td align="${cot[j]?.phai ? "right" : "left"}" style="padding:7px 10px;font-size:12.5px;color:#0F172A;border-bottom:1px solid #F1F5F9;vertical-align:top">${v}</td>`)
              .join("")}</tr>`,
        )
        .join("")
    : `<tr><td colspan="${cot.length}" style="padding:12px 10px;font-size:12.5px;color:#64748B">${rong}</td></tr>`;
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #E2E8F0;border-radius:8px">${th ? `<tr>${th}</tr>` : ""}${td}</table>`;
}

const chip = (nhan: string, muc: keyof typeof MAU_MUC) =>
  `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11.5px;font-weight:700;background:${MAU_MUC[muc].nen};color:${MAU_MUC[muc].chu};white-space:nowrap">${esc(nhan)}</span>`;

function soNho(nhan: string, so: string, mau = "#0F172A"): string {
  return `<td style="padding:8px 10px;border:1px solid #E2E8F0;border-radius:8px" valign="top">
    <div style="font-size:11.5px;color:#64748B">${nhan}</div><div style="font-size:18px;font-weight:800;color:${mau}">${so}</div></td>`;
}

export function taoHtmlBaoCao(bc: BaoCaoTuan, linkApp: string): string {
  const nhieuCt = bc.cong_ty.length > 1;
  const maCt = (id: number | null) => bc.cong_ty.find((c) => c.id === id)?.ma ?? "";
  const ts = bc.tai_san;
  const delta = ts.ky_truoc ? ts.tong.sl - ts.ky_truoc.sl : null;

  // Diem noi bat
  const noiBat = bc.noi_bat
    .map(
      (n) =>
        `<tr><td style="padding:6px 0;font-size:13px;color:#0F172A"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${MAU_MUC[n.muc].chu};margin-right:8px"></span>${esc(n.noi_dung)}</td></tr>`,
    )
    .join("");

  // KPI tai san
  const kpis = `<table width="100%" cellpadding="0" cellspacing="0"><tr>
    ${kpi({ nhan: "Tổng tài sản", so: soVN(ts.tong.sl), phu: `${tienVN(ts.tong.gt)}${delta != null ? ` · ${delta === 0 ? "không đổi" : `${delta > 0 ? "+" : ""}${soVN(delta)}`} so với 7 ngày trước` : ""}`, nen: "#E4FAFB" })}
    ${kpi({ nhan: "Trong kho", so: soVN(ts.trong_kho.sl), phu: tienVN(ts.trong_kho.gt), nen: "#E9F3FD" })}
    ${kpi({ nhan: "Đang sử dụng", so: soVN(ts.dang_su_dung.sl), phu: tienVN(ts.dang_su_dung.gt), nen: "#F4EDFD" })}
    ${kpi({ nhan: "Hỏng chờ xử lý", so: soVN(ts.hong), phu: ts.cho_duyet_nhap ? `${soVN(ts.cho_duyet_nhap)} TS chờ duyệt nhập` : "Sửa chữa / thanh lý", nen: ts.hong ? "#FFF9E7" : "#F1F5F9", vien: ts.hong ? "#F59E0B" : undefined })}
  </tr></table>`;

  // Ton toi thieu
  const canXl = bc.ton_toi_thieu.filter((d) => d.muc === "het" || d.muc === "duoi" || d.muc === "sap");
  const GIOI_HAN = 30;
  const dongMin = canXl.slice(0, GIOI_HAN).map((d) => [
    `<b>${esc(d.ten)}</b><div style="font-size:11px;color:#64748B">${d.loai === "vat_tu" ? `Vật tư · ${esc(d.ma)}` : "TSCĐ (theo tên)"}${nhieuCt ? ` · ${esc(maCt(d.cong_ty_id))}` : ""}</div>`,
    `<b style="color:${MAU_MUC[d.muc].chu}">${soVN(d.ton, 2)}</b> / ${soVN(d.ton_toi_thieu, 2)}${d.don_vi_tinh ? ` <span style="color:#64748B">${esc(d.don_vi_tinh)}</span>` : ""}`,
    chip(d.danh_gia, d.muc),
    `${esc(d.de_xuat)}${d.thieu ? ` <b>(thiếu ${soVN(d.thieu, 2)})</b>` : ""}${d.thoi_gian_dat_hang ? `<div style="font-size:11px;color:#64748B">${esc(d.thoi_gian_dat_hang)}</div>` : ""}`,
  ]);
  const tongMin = bc.ton_toi_thieu.length;
  const khoiMin = tongMin
    ? bang(
        [{ nhan: "Mặt hàng" }, { nhan: "Tồn / Tối thiểu", phai: true, rong: "110px" }, { nhan: "Đánh giá", rong: "120px" }, { nhan: "Đề xuất xử lý" }],
        dongMin,
        `Tất cả ${soVN(tongMin)} mặt hàng đang đảm bảo tồn kho tối thiểu.`,
      ) + (canXl.length > GIOI_HAN ? `<div style="font-size:12px;color:#64748B;margin-top:6px">… và ${canXl.length - GIOI_HAN} mặt hàng khác – xem file Excel đính kèm.</div>` : "")
    : `<div style="font-size:12.5px;color:#64748B">Chưa cài tồn kho tối thiểu cho mặt hàng nào (Danh mục vật tư / Danh mục tài sản → Tồn tối thiểu).</div>`;

  // Viec ton dong
  const v = bc.viec;
  const khoiViec =
    `<table width="100%" cellpadding="0" cellspacing="6" style="margin:0 -6px"><tr>
      ${soNho("Chờ Kế toán duyệt", soVN(v.cho_ke_toan))}
      ${soNho("Chờ nhận / xác nhận", soVN(v.cho_nhan))}
      ${soNho("Bị từ chối chưa xử lý", soVN(v.bi_tu_choi), v.bi_tu_choi ? "#B45309" : "#0F172A")}
      ${soNho(`Quá ${QUA_HAN_GIO} giờ`, soVN(v.qua_han), v.qua_han ? "#B91C1C" : "#0F172A")}
    </tr></table><div style="height:8px"></div>` +
    (v.chi_tiet.length
      ? bang(
          [{ nhan: "Phiếu", rong: "120px" }, { nhan: "Việc" }, { nhan: "Nội dung" }, { nhan: "Đã chờ", phai: true, rong: "80px" }],
          v.chi_tiet.slice(0, 10).map((x) => [
            `<b>${esc(x.ma_phieu)}</b>${nhieuCt && x.cong_ty_id ? `<div style="font-size:11px;color:#64748B">${esc(maCt(x.cong_ty_id))}</div>` : ""}`,
            esc(x.loai),
            esc(x.noi_dung),
            x.qua_han ? chip(x.gio_cho >= 48 ? `${Math.floor(x.gio_cho / 24)} ngày` : `${x.gio_cho} giờ`, "cao") : `${x.gio_cho} giờ`,
          ]),
        ) + (v.chi_tiet.length > 10 ? `<div style="font-size:12px;color:#64748B;margin-top:6px">… ${v.chi_tiet.length - 10} phiếu khác trong file Excel.</div>` : "")
      : `<div style="font-size:12.5px;color:#047857">Không có phiếu tồn đọng.</div>`);

  // Tieu hao
  const th = bc.tieu_hao;
  const khoiTieuHao =
    `<table width="100%" cellpadding="0" cellspacing="6" style="margin:0 -6px"><tr>
      ${soNho(`Nhập mua · ${soVN(th.nhap_mua.so_phieu)} phiếu`, tienVN(th.nhap_mua.gt))}
      ${soNho(`Cấp phát NV · ${soVN(th.cap_phat_nv.so_phieu)} phiếu`, tienVN(th.cap_phat_nv.gt))}
      ${soNho(`Tiêu dùng VP · ${soVN(th.tieu_dung_vp.so_phieu)} phiếu`, tienVN(th.tieu_dung_vp.gt))}
      ${soNho("Phiếu chuyển kho", soVN(th.chuyen_kho))}
    </tr></table><div style="height:8px"></div>` +
    bang(
      [{ nhan: "Vật tư xuất nhiều nhất" }, { nhan: "SL xuất", phai: true, rong: "90px" }, { nhan: "SL nhập", phai: true, rong: "90px" }, { nhan: "Giá trị xuất", phai: true, rong: "100px" }],
      th.chi_tiet
        .filter((d) => d.sl_cap_nv + d.sl_tieu_dung > 0)
        .slice(0, 10)
        .map((d) => [
          `${esc(d.ten_vt)}<div style="font-size:11px;color:#64748B">${esc(d.vt_id)}${d.ten_nhom ? ` · ${esc(d.ten_nhom)}` : ""}${nhieuCt ? ` · ${esc(maCt(d.cong_ty_id))}` : ""}</div>`,
          `${soVN(d.sl_cap_nv + d.sl_tieu_dung, 2)} ${esc(d.don_vi_tinh ?? "")}`,
          d.sl_nhap ? soVN(d.sl_nhap, 2) : "–",
          tienVN(d.gt_xuat),
        ]),
      "Không có phiếu xuất tiêu hao trong kỳ.",
    );

  // TSCD bien dong + theo cong ty
  const bd = bc.bien_dong_ts;
  const khoiTs =
    bang(
      [{ nhan: "Nhập mới" }, { nhan: "Cấp phát" }, { nhan: "Thu hồi" }, { nhan: "Điều chuyển" }, { nhan: "Báo hỏng" }, { nhan: "Thanh lý / Tiêu hủy" }],
      [[`<b>${soVN(bd.nhap_moi.sl)}</b> TS · ${tienVN(bd.nhap_moi.gt)}`, soVN(bd.cap_phat), soVN(bd.thu_hoi), soVN(bd.dieu_chuyen), soVN(bd.bao_hong), `${soVN(bd.thanh_ly)} / ${soVN(bd.tieu_huy)}`]],
    ) +
    (nhieuCt
      ? `<div style="height:10px"></div>` +
        bang(
          [{ nhan: "Công ty" }, { nhan: "Tổng TS", phai: true }, { nhan: "Giá trị", phai: true }, { nhan: "Trong kho", phai: true }, { nhan: "Đang dùng", phai: true }, { nhan: "Hỏng", phai: true }, { nhan: "Dưới tối thiểu", phai: true }],
          bc.theo_cong_ty.map((d) => [
            `<b>${esc(bc.cong_ty.find((c) => c.id === d.cong_ty_id)?.ten ?? d.cong_ty_id)}</b>`,
            soVN(d.tong.sl),
            tienVN(d.tong.gt),
            soVN(d.trong_kho.sl),
            soVN(d.dang_su_dung.sl),
            soVN(d.hong),
            d.duoi_toi_thieu ? `<b style="color:#B91C1C">${soVN(d.duoi_toi_thieu)}</b>` : "0",
          ]),
        )
      : "");

  // Tai khoan
  const tk = bc.tai_khoan;
  const khoiTk = `<table width="100%" cellpadding="0" cellspacing="6" style="margin:0 -6px"><tr>
    ${soNho("Đang sử dụng", soVN(tk.dang_su_dung), "#047857")}
    ${soNho("Chờ duyệt", soVN(tk.cho_duyet), tk.cho_duyet ? "#B45309" : "#0F172A")}
    ${soNho("Đã khoá", soVN(tk.bi_khoa))}
    ${soNho("Từ chối", soVN(tk.tu_choi))}
    ${soNho("Mới trong kỳ", soVN(tk.moi_trong_ky))}
  </tr></table>`;

  return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Báo cáo CCDC</title></head>
<body style="margin:0;padding:0;background:#F7FBFE;font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7FBFE"><tr><td align="center" style="padding:20px 10px">
<table width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:14px;overflow:hidden">
  <tr><td style="background:${TEAL};background:linear-gradient(135deg,#0B6B7A 0%,#006573 55%,#017280 100%);padding:20px 24px;color:#FFFFFF">
    <div style="font-size:12px;opacity:.85;letter-spacing:.5px;text-transform:uppercase">Quản lý công cụ dụng cụ · Báo cáo định kỳ</div>
    <div style="font-size:21px;font-weight:800;margin-top:4px">Báo cáo tuần ${ngayVN(bc.tu)} – ${ngayVN(bc.den)}</div>
    <div style="font-size:12.5px;opacity:.9;margin-top:4px">${esc(bc.cong_ty.map((c) => c.ten).join(" · "))} · Số liệu lúc ${ngayGioVN(bc.tao_luc)}</div>
  </td></tr>
  ${the("Điểm nổi bật", `<table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:6px 14px">${noiBat}</table>`)}
  ${the("Tài sản cố định – hiện trạng", kpis)}
  ${the("Cảnh báo tồn kho tối thiểu", khoiMin, tongMin ? `${soVN(canXl.length)}/${soVN(tongMin)} mặt hàng cần chú ý · tồn tính trên tổng các kho của công ty (gồm hàng đang chuyển)` : "")}
  ${the("Việc tồn đọng", khoiViec, "Phiếu đang chờ duyệt / nhận / xử lý tại thời điểm gửi báo cáo")}
  ${the("Vật tư tiêu hao trong kỳ", khoiTieuHao)}
  ${the("Biến động tài sản cố định trong kỳ", khoiTs, "Số tài sản trên các phiếu lập trong kỳ")}
  ${the("Tài khoản người dùng", khoiTk, "Toàn hệ thống")}
  <tr><td style="padding:18px 24px 22px 24px">
    <a href="${esc(linkApp)}" style="display:inline-block;background:${TEAL};color:#FFFFFF;text-decoration:none;font-weight:700;font-size:13px;padding:10px 18px;border-radius:8px">Mở hệ thống CCDC</a>
    <div style="font-size:11.5px;color:#94A3B8;margin-top:12px">Email gửi tự động từ hệ thống Quản lý CCDC. Số liệu chi tiết (dạng bảng phẳng để nhập sang hệ thống khác) trong file Excel đính kèm.</div>
  </td></tr>
</table></td></tr></table></body></html>`;
}

// ---- Excel dinh kem: moi sheet 1 bang phang, dong 1 = tieu de cot ----
export function taoExcelBaoCao(bc: BaoCaoTuan): Uint8Array {
  const ct = (id: number | null) => bc.cong_ty.find((c) => c.id === id)?.ma ?? "";
  const ts = bc.tai_san;
  const tq: [string, string, number | string, string?][] = [
    ["Thông tin", "Kỳ báo cáo", `${bc.tu} → ${bc.den}`],
    ["Thông tin", "Thời điểm lấy số liệu", bc.tao_luc],
    ["Thông tin", "Công ty", bc.cong_ty.map((c) => c.ma).join(", ")],
    ["Tài sản", "Tổng tài sản đang quản lý (SL)", ts.tong.sl],
    ["Tài sản", "Tổng tài sản đang quản lý (giá trị)", ts.tong.gt],
    ["Tài sản", "Tổng tài sản 7 ngày trước (SL)", ts.ky_truoc?.sl ?? "", ts.ngay_ky_truoc ? `Ảnh chụp ngày ${ts.ngay_ky_truoc}` : "Chưa có số liệu kỳ trước"],
    ["Tài sản", "Trong kho (SL)", ts.trong_kho.sl],
    ["Tài sản", "Trong kho (giá trị)", ts.trong_kho.gt],
    ["Tài sản", "Đang sử dụng (SL)", ts.dang_su_dung.sl],
    ["Tài sản", "Đang sử dụng (giá trị)", ts.dang_su_dung.gt],
    ["Tài sản", "Hỏng chờ xử lý", ts.hong],
    ["Tài sản", "Chờ duyệt nhập", ts.cho_duyet_nhap],
    ["Biến động TSCĐ trong kỳ", "Nhập mới (SL)", bc.bien_dong_ts.nhap_moi.sl],
    ["Biến động TSCĐ trong kỳ", "Nhập mới (giá trị)", bc.bien_dong_ts.nhap_moi.gt],
    ["Biến động TSCĐ trong kỳ", "Cấp phát", bc.bien_dong_ts.cap_phat],
    ["Biến động TSCĐ trong kỳ", "Thu hồi", bc.bien_dong_ts.thu_hoi],
    ["Biến động TSCĐ trong kỳ", "Điều chuyển", bc.bien_dong_ts.dieu_chuyen],
    ["Biến động TSCĐ trong kỳ", "Báo hỏng", bc.bien_dong_ts.bao_hong],
    ["Biến động TSCĐ trong kỳ", "Đề xuất thanh lý", bc.bien_dong_ts.thanh_ly],
    ["Biến động TSCĐ trong kỳ", "Đề xuất tiêu hủy", bc.bien_dong_ts.tieu_huy],
    ["Tiêu hao trong kỳ", "Nhập mua (số phiếu)", bc.tieu_hao.nhap_mua.so_phieu],
    ["Tiêu hao trong kỳ", "Nhập mua (giá trị)", bc.tieu_hao.nhap_mua.gt],
    ["Tiêu hao trong kỳ", "Cấp phát NV (số phiếu)", bc.tieu_hao.cap_phat_nv.so_phieu],
    ["Tiêu hao trong kỳ", "Cấp phát NV (giá trị)", bc.tieu_hao.cap_phat_nv.gt],
    ["Tiêu hao trong kỳ", "Tiêu dùng văn phòng (số phiếu)", bc.tieu_hao.tieu_dung_vp.so_phieu],
    ["Tiêu hao trong kỳ", "Tiêu dùng văn phòng (giá trị)", bc.tieu_hao.tieu_dung_vp.gt],
    ["Tiêu hao trong kỳ", "Phiếu chuyển kho", bc.tieu_hao.chuyen_kho],
    ["Tồn kho", "Mặt hàng có cài tồn tối thiểu", bc.ton_toi_thieu.length],
    ["Tồn kho", "Hết hàng", bc.ton_toi_thieu.filter((d) => d.muc === "het").length],
    ["Tồn kho", "Dưới mức tối thiểu", bc.ton_toi_thieu.filter((d) => d.muc === "duoi").length],
    ["Tồn kho", "Sắp chạm mức tối thiểu", bc.ton_toi_thieu.filter((d) => d.muc === "sap").length],
    ["Tồn kho", "Vật tư tồn âm (kho x vật tư)", bc.ton_am],
    ["Việc tồn đọng", "Chờ Kế toán duyệt", bc.viec.cho_ke_toan],
    ["Việc tồn đọng", "Chờ nhận / xác nhận", bc.viec.cho_nhan],
    ["Việc tồn đọng", "Bị từ chối chưa xử lý", bc.viec.bi_tu_choi],
    ["Việc tồn đọng", `Quá ${QUA_HAN_GIO} giờ`, bc.viec.qua_han],
    ["Tài khoản", "Đang sử dụng", bc.tai_khoan.dang_su_dung],
    ["Tài khoản", "Chờ duyệt", bc.tai_khoan.cho_duyet],
    ["Tài khoản", "Đã khoá", bc.tai_khoan.bi_khoa],
    ["Tài khoản", "Từ chối", bc.tai_khoan.tu_choi],
    ["Tài khoản", "Mới trong kỳ", bc.tai_khoan.moi_trong_ky],
    ...bc.noi_bat.map((n, i): [string, string, string] => ["Điểm nổi bật", `#${i + 1} (${n.muc === "cao" ? "Cao" : n.muc === "trung_binh" ? "Trung bình" : "Tốt"})`, n.noi_dung]),
  ];
  const sheets: SheetXlsx[] = [
    {
      name: "Tong quan",
      cols: [
        { key: "nhom", header: "Nhóm", width: 24 },
        { key: "chi_so", header: "Chỉ số", width: 38 },
        { key: "gia_tri", header: "Giá trị", width: 22, kieu: "tien" },
        { key: "ghi_chu", header: "Ghi chú", width: 30 },
      ],
      rows: tq.map(([nhom, chi_so, gia_tri, ghi_chu]) => ({ nhom, chi_so, gia_tri, ghi_chu })),
    },
    {
      name: "Ton toi thieu",
      cols: [
        { key: "cong_ty", header: "Công ty", width: 9 },
        { key: "loai", header: "Loại", width: 16 },
        { key: "ma", header: "Mã", width: 16 },
        { key: "ten", header: "Tên mặt hàng", width: 42 },
        { key: "dvt", header: "ĐVT", width: 9 },
        { key: "ton", header: "Tồn hiện tại", width: 12, kieu: "so" },
        { key: "toi_thieu", header: "Tồn tối thiểu", width: 12, kieu: "so" },
        { key: "thieu", header: "Thiếu", width: 10, kieu: "so" },
        { key: "danh_gia", header: "Đánh giá", width: 22 },
        { key: "de_xuat", header: "Đề xuất xử lý", width: 26 },
        { key: "dat_hang", header: "Thời gian đặt hàng / ghi chú", width: 34 },
      ],
      rows: bc.ton_toi_thieu.map((d: DongTonToiThieu) => ({
        cong_ty: ct(d.cong_ty_id),
        loai: d.loai === "vat_tu" ? "Vật tư tiêu hao" : "TSCĐ",
        ma: d.loai === "vat_tu" ? d.ma : "",
        ten: d.ten,
        dvt: d.don_vi_tinh ?? "",
        ton: d.ton,
        toi_thieu: d.ton_toi_thieu,
        thieu: d.thieu,
        danh_gia: d.danh_gia,
        de_xuat: d.de_xuat,
        dat_hang: d.thoi_gian_dat_hang ?? "",
      })),
    },
    {
      name: "Tieu hao trong ky",
      cols: [
        { key: "cong_ty", header: "Công ty", width: 9 },
        { key: "vt_id", header: "Mã vật tư", width: 16 },
        { key: "ten_vt", header: "Tên vật tư", width: 42 },
        { key: "nhom", header: "Nhóm", width: 22 },
        { key: "dvt", header: "ĐVT", width: 9 },
        { key: "sl_cap_nv", header: "SL cấp phát NV", width: 14, kieu: "so" },
        { key: "sl_tieu_dung", header: "SL tiêu dùng VP", width: 14, kieu: "so" },
        { key: "sl_nhap", header: "SL nhập mua", width: 12, kieu: "so" },
        { key: "gt_xuat", header: "Giá trị xuất", width: 16, kieu: "tien" },
        { key: "gt_nhap", header: "Giá trị nhập", width: 16, kieu: "tien" },
      ],
      rows: bc.tieu_hao.chi_tiet.map((d) => ({ ...d, cong_ty: ct(d.cong_ty_id), nhom: d.ten_nhom ?? "", dvt: d.don_vi_tinh ?? "" })),
    },
    {
      name: "Viec ton dong",
      cols: [
        { key: "cong_ty", header: "Công ty", width: 9 },
        { key: "ma_phieu", header: "Mã phiếu", width: 18 },
        { key: "loai", header: "Việc", width: 34 },
        { key: "noi_dung", header: "Nội dung", width: 44 },
        { key: "thoi_gian", header: "Lập lúc", width: 19 },
        { key: "gio_cho", header: "Số giờ chờ", width: 11, kieu: "so" },
        { key: "qua_han", header: `Quá ${QUA_HAN_GIO}h`, width: 10 },
      ],
      rows: bc.viec.chi_tiet.map((x) => ({ ...x, cong_ty: ct(x.cong_ty_id), qua_han: x.qua_han ? "Có" : "Không" })),
    },
    {
      name: "Theo cong ty",
      cols: [
        { key: "ma", header: "Mã công ty", width: 11 },
        { key: "ten", header: "Công ty", width: 30 },
        { key: "tong_sl", header: "Tổng TS", width: 10, kieu: "so" },
        { key: "tong_gt", header: "Giá trị TS", width: 18, kieu: "tien" },
        { key: "kho_sl", header: "Trong kho", width: 10, kieu: "so" },
        { key: "kho_gt", header: "Giá trị trong kho", width: 18, kieu: "tien" },
        { key: "dung_sl", header: "Đang sử dụng", width: 12, kieu: "so" },
        { key: "dung_gt", header: "Giá trị đang dùng", width: 18, kieu: "tien" },
        { key: "hong", header: "Hỏng", width: 8, kieu: "so" },
        { key: "duoi", header: "Dưới tồn tối thiểu", width: 16, kieu: "so" },
      ],
      rows: bc.theo_cong_ty.map((d) => {
        const c = bc.cong_ty.find((x) => x.id === d.cong_ty_id);
        return {
          ma: c?.ma ?? "",
          ten: c?.ten ?? "",
          tong_sl: d.tong.sl,
          tong_gt: d.tong.gt,
          kho_sl: d.trong_kho.sl,
          kho_gt: d.trong_kho.gt,
          dung_sl: d.dang_su_dung.sl,
          dung_gt: d.dang_su_dung.gt,
          hong: d.hong,
          duoi: d.duoi_toi_thieu,
        };
      }),
    },
  ];
  return taoXlsx(sheets);
}

export const tenFileExcel = (bc: BaoCaoTuan) => `bao-cao-ccdc_${bc.tu}_${bc.den}.xlsx`;
