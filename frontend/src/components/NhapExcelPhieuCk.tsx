import { moiNgonNgu, t } from "../lib/i18n";
import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { api } from "../api/client";
import { Modal } from "./Modal";
import { KhoTag, LoaiChip } from "./NoiBat";
import { fmtSo } from "../lib/format";
import { LOAI_KHO, LOAI_PHIEU_CK, laKhoTon, moTaLoi, thongBaoLoi } from "../lib/nhan";
import type { LoaiKho } from "../types";

// Import Excel phieu tieu hao (chuyen kho / cap phat NV / xuat tieu dung VP) tu kho HCNS, Mien, Trung chuyen, QL.
// Doc file o trinh duyet -> gui cac dong len POST /phieu-chuyen-kho/import (server tra ten kho / vat tu / ma NV,
// kiem quyen + ton) -> xem truoc -> chi tao khi KHONG con loi (tat ca phieu cung luc).

interface Kho {
  id: number;
  ten_kho: string;
  loai: LoaiKho;
  cong_ty_id?: number;
  cong_ty_ma?: string;
}
interface Vt {
  id: string;
  ten_vt: string;
  don_vi_tinh: string | null;
  cong_ty_id: number;
}
interface PhieuXem {
  dong: number[];
  loai: string;
  xuat_tieu_dung: boolean;
  tu_kho: string;
  den: string;
  trang_thai: string | null;
  /** Nguoi nhan khac cong ty kho -> se them kiem nhiem cong ty kho khi tao phieu. */
  them_kiem_nhiem: { ma_nv: string; ten_nv: string; cong_ty: string } | null;
  items: { vt_id: string; ten_vt: string; don_vi_tinh: string | null; so_luong: number; ton: number }[];
}
interface KetQuaXem {
  phieu: PhieuXem[];
  loi: { dong: number; ma: string; gia_tri?: string }[];
  so_dong: number;
  hop_le: boolean;
}

// Cot file mau: khoa gui server + tieu de o MOI ngon ngu (file mau theo ngon ngu dang dung; doc lai file nhan
// tieu de tieng Viet goc lan ban dich - vd file HCNS tu lap bang tieng Viet).
const COT: [string, string[]][] = [
  ["nhom", moiNgonNgu("Nhóm phiếu")],
  ["kho_xuat", moiNgonNgu("Kho xuất")],
  ["kho_nhan", moiNgonNgu("Kho nhận")],
  ["ma_nv", moiNgonNgu("Mã NV nhận")],
  ["nguoi_nhan", moiNgonNgu("Người nhận ngoài danh bạ")],
  ["vt", moiNgonNgu("Mã vật tư")],
  ["ten_vt", moiNgonNgu("Tên vật tư")],
  ["so_luong", moiNgonNgu("Số lượng")],
  ["don_gia", moiNgonNgu("Đơn giá")],
  ["ghi_chu", moiNgonNgu("Ghi chú")],
];
const NHAN_COT: Record<string, string> = Object.fromEntries(COT.map(([k, ds]) => [k, t(ds[0])]));

const chuan = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/gi, "d")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();

export function NhapExcelPhieuCk({ khoNguon, khoKhac, vts, onClose, onXong }: { khoNguon: Kho[]; khoKhac: Kho[]; vts: Vt[]; onClose: () => void; onXong: (msg: string, maPhieu: string[]) => void }) {
  const [tenFile, setTenFile] = useState("");
  const [dong, setDong] = useState<Record<string, unknown>[] | null>(null);
  const [xem, setXem] = useState<KetQuaXem | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangXuLy, setDangXuLy] = useState(false);
  const chon = useRef<HTMLInputElement>(null);

  async function taiMau() {
    const XLSX = await import("xlsx");
    const nguon = khoNguon.filter(laKhoTon);
    const k0 = nguon[0];
    const vt0 = vts.find((v) => v.cong_ty_id === k0?.cong_ty_id);
    const dich = khoKhac.find((k) => k.id !== k0?.id && laKhoTon(k) && k.cong_ty_id === k0?.cong_ty_id);
    const khoTh = khoKhac.find((k) => k.loai === "Tieu hao" && k.cong_ty_id === k0?.cong_ty_id);
    const tieuDe = COT.map(([k]) => NHAN_COT[k]);
    const vd = (o: Record<string, unknown>) => COT.map(([k]) => o[k] ?? "");
    const mau = [
      tieuDe,
      ...(k0 && vt0
        ? [
            ...(dich ? [vd({ nhom: 1, kho_xuat: k0.ten_kho, kho_nhan: dich.ten_kho, vt: vt0.id, ten_vt: vt0.ten_vt, so_luong: 1 })] : []),
            vd({ nhom: 2, kho_xuat: k0.ten_kho, ma_nv: t("(mã NV)"), vt: vt0.id, ten_vt: vt0.ten_vt, so_luong: 1 }),
            ...(khoTh ? [vd({ nhom: 3, kho_xuat: k0.ten_kho, kho_nhan: khoTh.ten_kho, vt: vt0.id, ten_vt: vt0.ten_vt, so_luong: 1 })] : []),
          ]
        : []),
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(mau);
    ws["!cols"] = COT.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, ws, t("Phiếu"));
    const huongDan = [
      [t("Hướng dẫn")],
      [t("Mỗi dòng = 1 mặt hàng. Các dòng cùng Nhóm phiếu + Kho xuất + người/kho nhận gộp thành 1 phiếu.")],
      [t("Người nhận: điền ĐÚNG 1 trong 3 cột - Kho nhận / Mã NV nhận / Người nhận ngoài danh bạ.")],
      [t("Kho nhận là kho thường → phiếu Chuyển kho; kho tiêu hao văn phòng → Xuất tiêu dùng VP; Mã NV / tên → Cấp phát NV.")],
      [t("Kho ghi theo tên hoặc mã kho (sheet Kho). Vật tư ghi Mã vật tư (ưu tiên) hoặc Tên vật tư đúng danh mục (sheet Vật tư).")],
      [t("Chỉ xuất được từ kho bạn phụ trách; tồn được cộng dồn mọi phiếu trong file. File còn lỗi thì không phiếu nào được tạo.")],
      [t("Xóa các dòng ví dụ trước khi nhập.")],
    ];
    const wsHd = XLSX.utils.aoa_to_sheet(huongDan);
    wsHd["!cols"] = [{ wch: 120 }];
    XLSX.utils.book_append_sheet(wb, wsHd, t("Hướng dẫn"));
    const dsKho = [...new Map([...khoNguon, ...khoKhac].map((k) => [k.id, k])).values()];
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        [t("Mã kho"), t("Tên kho"), t("Loại kho"), t("Công ty"), t("Bạn xuất được")],
        ...dsKho.map((k) => [k.id, k.ten_kho, LOAI_KHO[k.loai] ?? k.loai, k.cong_ty_ma ?? "", khoNguon.some((n) => n.id === k.id) && laKhoTon(k) ? "✓" : ""]),
      ]),
      t("Kho"),
    );
    const ctNguon = new Set(nguon.map((k) => k.cong_ty_id));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([[t("Mã vật tư"), t("Tên vật tư"), t("ĐVT")], ...vts.filter((v) => ctNguon.has(v.cong_ty_id)).map((v) => [v.id, v.ten_vt, v.don_vi_tinh ?? ""])]),
      t("Vật tư"),
    );
    XLSX.writeFile(wb, "Mau_import_phieu_tieu_hao.xlsx");
  }

  async function docFile(f: File | undefined) {
    if (!f) return;
    setLoi(null);
    setXem(null);
    setDong(null);
    setTenFile(f.name);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer());
      const ws = wb.Sheets[wb.SheetNames[0]];
      const bang = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: true });
      // Dong tieu de = dong dau tien co cot "Kho xuat" (goc hoac ban dich).
      const biDanh = Object.fromEntries(COT.map(([k, ds]) => [k, new Set(ds.map(chuan))]));
      const iTieuDe = bang.findIndex((r) => r.some((o) => biDanh.kho_xuat.has(chuan(o))));
      if (iTieuDe < 0) return setLoi(t("Không thấy dòng tiêu đề (cột \"Kho xuất\") ở sheet đầu tiên - dùng đúng file mẫu."));
      const viTri: Record<string, number> = {};
      bang[iTieuDe].forEach((o, i) => {
        const c = COT.find(([k]) => biDanh[k].has(chuan(o)));
        if (c && viTri[c[0]] === undefined) viTri[c[0]] = i;
      });
      const ds = bang
        .map((r, i) => {
          const o: Record<string, unknown> = { dong: i + 1 };
          for (const [k, i2] of Object.entries(viTri)) o[k] = typeof r[i2] === "string" ? (r[i2] as string).trim() : r[i2];
          return o;
        })
        .slice(iTieuDe + 1)
        .filter((o) => COT.some(([k]) => o[k] !== "" && o[k] != null));
      if (!ds.length) return setLoi(t("File không có dòng dữ liệu nào."));
      setDong(ds);
      await gui(ds, false);
    } catch (e) {
      setLoi(thongBaoLoi(e, t("Không đọc được file Excel.")));
    }
  }

  async function gui(ds: Record<string, unknown>[], thucHien: boolean) {
    setDangXuLy(true);
    setLoi(null);
    try {
      if (!thucHien) {
        setXem(await api.post<KetQuaXem>("/phieu-chuyen-kho/import", { dong: ds, thuc_hien: false }));
        return;
      }
      const r = await api.post<{ ok?: boolean; so_phieu?: number; so_nv_them?: number; phieu?: { ma_phieu: string }[] } & Partial<KetQuaXem>>("/phieu-chuyen-kho/import", {
        dong: ds,
        thuc_hien: true,
      });
      if (!r.ok) {
        // Du lieu doi giua luc xem truoc va luc tao (vd ton vua bi xuat) -> hien lai danh sach loi moi.
        setXem(r as KetQuaXem);
        return setLoi(t("Dữ liệu đã thay đổi so với lúc xem trước - kiểm tra lại các lỗi bên dưới."));
      }
      const msgTao = t("Đã tạo {n} phiếu từ file {file}.", { n: r.so_phieu ?? 0, file: tenFile });
      onXong(
        r.so_nv_them ? `${msgTao} ${t("Đã thêm {n} nhân viên công ty khác vào nhân sự công ty của kho (kiêm nhiệm).", { n: r.so_nv_them })}` : msgTao,
        (r.phieu ?? []).map((p) => p.ma_phieu),
      );
    } catch (e) {
      setLoi(thongBaoLoi(e));
    } finally {
      setDangXuLy(false);
    }
  }

  const soLoi = xem?.loi.length ?? 0;
  // Nguoi nhan khac cong ty se duoc them kiem nhiem (dem theo nguoi + cong ty).
  const nvThem = [...new Map((xem?.phieu ?? []).filter((p) => p.them_kiem_nhiem).map((p) => [`${p.them_kiem_nhiem!.ma_nv}|${p.them_kiem_nhiem!.cong_ty}`, p.them_kiem_nhiem!])).values()];
  return (
    <Modal size="lg" title={t("Nhập phiếu tiêu hao từ Excel")} onClose={onClose}>
      <div className="field-hint" style={{ marginBottom: 10 }}>
        {t("Chuyển kho, cấp phát nhân viên, xuất tiêu dùng văn phòng từ các kho bạn phụ trách (HCNS, miền, trung chuyển, quản lý). Tải file mẫu, điền rồi chọn file để xem trước - chỉ tạo phiếu khi không còn lỗi.")}
      </div>
      <div className="row-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap", marginBottom: 12 }}>
        <button type="button" className="btn btn-outline" onClick={taiMau}>
          <Download size={14} /> {t("Tải file mẫu")}
        </button>
        <button type="button" className="btn btn-outline" disabled={dangXuLy} onClick={() => chon.current?.click()}>
          <Upload size={14} /> {t("Chọn file Excel")}
        </button>
        {tenFile && (
          <span className="muted small" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <FileSpreadsheet size={14} /> {tenFile}
          </span>
        )}
        <input ref={chon} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => (docFile(e.target.files?.[0]), (e.target.value = ""))} />
      </div>
      {loi && <div className="alert alert-error">{loi}</div>}
      {dangXuLy && <div className="muted small">{t("Đang kiểm tra...")}</div>}

      {xem && (
        <>
          <div className={`alert ${soLoi ? "alert-error" : "alert-success"}`}>
            {soLoi
              ? t("{so_dong} dòng → {so_phieu} phiếu hợp lệ, {so_loi} lỗi. Sửa file rồi chọn lại - còn lỗi thì không phiếu nào được tạo.", {
                  so_dong: xem.so_dong,
                  so_phieu: xem.phieu.length,
                  so_loi: soLoi,
                })
              : t("{so_dong} dòng → {so_phieu} phiếu, không có lỗi.", { so_dong: xem.so_dong, so_phieu: xem.phieu.length })}
          </div>
          {nvThem.length > 0 && (
            <div className="alert alert-warning">
              {t("{n} người nhận thuộc công ty khác - khi tạo phiếu sẽ tự thêm vào nhân sự công ty của kho xuất (kiêm nhiệm, ghi người thêm): {ds}", {
                n: nvThem.length,
                ds: nvThem.map((x) => `${x.ten_nv} (${x.ma_nv}) → ${x.cong_ty}`).join(", "),
              })}
            </div>
          )}

          {soLoi > 0 && (
            <div className="task-table-wrapper" style={{ maxHeight: 220, overflow: "auto", marginBottom: 12 }}>
              <table className="task-table">
                <thead>
                  <tr>
                    <th>{t("Dòng")}</th>
                    <th>{t("Lỗi")}</th>
                    <th>{t("Giá trị")}</th>
                  </tr>
                </thead>
                <tbody>
                  {xem.loi.map((l, i) => (
                    <tr key={i} className="row-canh-bao">
                      <td data-label={t("Dòng")}>{l.dong}</td>
                      <td data-label={t("Lỗi")}>{moTaLoi(l.ma)}</td>
                      <td data-label={t("Giá trị")}>{l.gia_tri ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {xem.phieu.length > 0 && (
            <div className="task-table-wrapper" style={{ maxHeight: 360, overflow: "auto" }}>
              <table className="task-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t("Loại")}</th>
                    <th>{t("Từ")}</th>
                    <th>{t("Đến")}</th>
                    <th>{t("Hàng")}</th>
                    <th>{t("Dòng")}</th>
                  </tr>
                </thead>
                <tbody>
                  {xem.phieu.map((p, i) => (
                    <tr key={i} className={p.trang_thai ? "" : "row-canh-bao"}>
                      <td data-label="#">{i + 1}</td>
                      <td data-label={t("Loại")}>
                        <LoaiChip loai={p.xuat_tieu_dung ? "Tieu dung" : p.loai} nhan={p.xuat_tieu_dung ? t("Xuất tiêu dùng VP") : (LOAI_PHIEU_CK[p.loai] ?? p.loai)} />
                      </td>
                      <td data-label={t("Từ")}>
                        <KhoTag ten={p.tu_kho} />
                      </td>
                      <td data-label={t("Đến")}>
                        {p.den}
                        {p.them_kiem_nhiem && (
                          <div className="small text-orange">{t("Khác công ty - sẽ thêm kiêm nhiệm công ty {ct}", { ct: p.them_kiem_nhiem.cong_ty })}</div>
                        )}
                      </td>
                      <td data-label={t("Hàng")}>
                        {p.items.map((it) => (
                          <div key={it.vt_id} className="small">
                            {it.ten_vt}: <b>{fmtSo(it.so_luong)}</b> {it.don_vi_tinh ?? ""} <span className="muted">{t("(tồn {x})", { x: fmtSo(it.ton) })}</span>
                          </div>
                        ))}
                      </td>
                      <td data-label={t("Dòng")}>{p.dong.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>
          {t("Đóng")}
        </button>
        <button type="button" className="btn btn-primary" disabled={!xem?.hop_le || !dong || dangXuLy} onClick={() => dong && gui(dong, true)}>
          {t("Tạo {n} phiếu", { n: xem?.phieu.length ?? 0 })}
        </button>
      </div>
    </Modal>
  );
}
