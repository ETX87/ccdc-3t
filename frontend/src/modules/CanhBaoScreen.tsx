import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, EyeOff, Eye, ListChecks, ShieldAlert, Wand2 } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { KhoFilter } from "../components/KhoFilter";
import { KpiCard } from "../components/KpiCard";
import { CanhBaoRow, LOAI_BO_QUA_DUOC, MUC_DO_NHAN, type CanhBao, type CanhBaoChiTiet, type LoaiCanhBao } from "../components/CanhBaoRow";
import { Modal } from "../components/Modal";
import { useAuth } from "../auth/AuthContext";
import { useDuLieuChung } from "../lib/duLieuChung";
import { useChiTiet } from "../components/ChiTiet";
import { useNav } from "../lib/navigation";
import { baoThayDoi, useKhiThayDoi } from "../lib/suKien";
import { fmtGiaTriDong, fmtNgayGio, fmtSo } from "../lib/format";
import { thongBaoLoi } from "../lib/nhan";
import { PhanTrang, useTrangKhach } from "../components/PhanTrang";

interface CanhBaoResp {
  cap_nhat_luc: string;
  nguong_gio: number;
  rows: CanhBao[];
  chi_tiet: CanhBaoChiTiet[] | null;
}

const MAU_DE_XUAT = { sua_tham_khao: "text-teal", kiem_tra_phieu: "text-orange", khong_ro: "muted" } as const;

// Man Canh bao: 7 loai canh bao that (nguong qua han 48 gio) + danh sach chi tiet tung loai; bam 1 dong
// chi tiet -> mo phieu / tai san / ton kho vat tu tuong ung. Loai "theo doi" (don gia bat thuong, sap het
// bao hanh): Admin/HCNS/KT bo qua duoc tung muc (co hoan tac); don gia bat thuong kem de xuat - gia tham
// khao sai thi bam la sua (tung dong hoac ap dung hang loat co xac nhan).
export function CanhBaoScreen() {
  const auth = useAuth();
  const vaiTro = auth.status === "authenticated" ? auth.user.vai_tro : null;
  const coQuyenXuLy = vaiTro === "Admin" || vaiTro === "HCNS" || vaiTro === "Ke toan";
  const { reload: reloadViec } = useDuLieuChung();
  const { params, navigate } = useNav();
  const { moPhieu, moTaiSan } = useChiTiet();
  const [khoId, setKhoId] = useState(params.kho_id ?? "");
  const [loai, setLoai] = useState<LoaiCanhBao | null>((params.loai as LoaiCanhBao) ?? null);
  const [data, setData] = useState<CanhBaoResp | null>(null);
  const [chiTiet, setChiTiet] = useState<CanhBaoChiTiet[] | null>(null);
  const tCb = useTrangKhach(chiTiet);
  const [dangTai, setDangTai] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; hoanTac?: { loai: LoaiCanhBao; khoa: string[] } } | null>(null);
  const [busy, setBusy] = useState(false);
  const [apDung, setApDung] = useState<Map<string, boolean> | null>(null); // modal ap dung hang loat: vt_id -> chon

  const load = useCallback(async () => {
    setDangTai(true);
    setLoi(null);
    try {
      const qs = new URLSearchParams();
      if (khoId) qs.set("kho_id", khoId);
      if (loai) qs.set("loai", loai);
      const r = await api.get<CanhBaoResp>(`/dashboard/canh-bao?${qs}`);
      setData(r);
      // Chua chon loai -> tu chon loai nang nhat dang co canh bao.
      if (!loai) {
        const dau = r.rows.find((x) => x.so_luong > 0);
        if (dau) setLoai(dau.loai);
        else setChiTiet([]);
      } else setChiTiet(r.chi_tiet ?? []);
    } catch (e) {
      setLoi(thongBaoLoi(e, "Không tải được cảnh báo."));
    } finally {
      setDangTai(false);
    }
  }, [khoId, loai]);

  useEffect(() => {
    load();
  }, [load]);
  useKhiThayDoi(load);

  const rows = data?.rows ?? [];
  const dem = (m: CanhBao["muc_do"]) => rows.filter((r) => r.muc_do === m).reduce((s, r) => s + r.so_luong, 0);
  const loaiCo = (m: CanhBao["muc_do"]) => rows.filter((r) => r.muc_do === m && r.so_luong > 0).length;
  const dangChon = rows.find((r) => r.loai === loai);

  const xuLyDuoc = coQuyenXuLy && !!loai && LOAI_BO_QUA_DUOC.includes(loai);
  const laDonGia = loai === "don-gia-bat-thuong";
  // De xuat sua gia tham khao, gop theo vat tu (nhieu dong phieu cung 1 vat tu -> sua 1 lan).
  const deXuatGia = useMemo(() => {
    const m = new Map<string, { vt_id: string; ten: string; cu: number; moi: number; so_dong: number }>();
    for (const d of chiTiet ?? []) {
      if (d.de_xuat?.kieu !== "sua_tham_khao" || !d.vt_id || !d.de_xuat.gia_de_xuat) continue;
      const x = m.get(d.vt_id);
      if (x) x.so_dong++;
      else m.set(d.vt_id, { vt_id: d.vt_id, ten: d.ten, cu: d.don_gia_tham_khao ?? 0, moi: d.de_xuat.gia_de_xuat, so_dong: 1 });
    }
    return [...m.values()];
  }, [chiTiet]);

  async function goi(fn: () => Promise<void>) {
    setBusy(true);
    setLoi(null);
    try {
      await fn();
      baoThayDoi();
      await Promise.all([load(), reloadViec()]);
    } catch (e) {
      setLoi(thongBaoLoi(e, "Không xử lý được cảnh báo."));
    } finally {
      setBusy(false);
    }
  }

  const boQua = (khoa: string[]) =>
    loai &&
    goi(async () => {
      await api.post("/dashboard/canh-bao/bo-qua", { loai, khoa });
      setMsg({ text: `Đã bỏ qua ${fmtSo(khoa.length)} mục.`, hoanTac: { loai, khoa } });
    });

  const hoanTac = (h: { loai: LoaiCanhBao; khoa: string[] }) =>
    goi(async () => {
      await api.post("/dashboard/canh-bao/hoan-tac", h);
      setMsg({ text: "Đã hoàn tác - các mục hiện lại trong danh sách." });
    });

  const suaGia = (items: { vt_id: string; don_gia: number }[]) =>
    goi(async () => {
      await api.post("/dashboard/canh-bao/sua-gia-tham-khao", { items });
      setApDung(null);
      setMsg({ text: `Đã sửa giá tham khảo ${fmtSo(items.length)} vật tư (có ghi nhật ký giá cũ/mới). Các dòng khớp giá mới tự hết cảnh báo.` });
    });

  function moDong(d: CanhBaoChiTiet) {
    if (d.kind === "tai_san") moTaiSan(d.ref);
    else if (d.kind === "vat_tu") navigate("cap-phat", { tab: "ton-kho", q: d.ref });
    else moPhieu(d.kind, d.ref);
  }

  return (
    <div className="dashboard-container">
      <PageHeader
        title="Cảnh báo"
        filters={<KhoFilter value={khoId} onChange={setKhoId} />}
        capNhatLuc={data?.cap_nhat_luc}
        onRefresh={load}
        dangTai={dangTai}
      />
      {loi && <div className="alert alert-error">{loi}</div>}
      {msg && (
        <div className="alert alert-success">
          <span className="icon-text">
            {msg.text}
            {msg.hoanTac && (
              <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => msg.hoanTac && hoanTac(msg.hoanTac)}>
                Hoàn tác
              </button>
            )}
          </span>
        </div>
      )}

      <div className="kpi-grid kpi-grid-4">
        <KpiCard
          tone="red"
          icon={<AlertTriangle size={20} className="text-white" />}
          watermark={<AlertTriangle size={52} />}
          label={MUC_DO_NHAN.cao}
          value={fmtSo(dem("cao"))}
          trend={<div className="kpi-trend trend-warning"><span className="trend-sub">{loaiCo("cao")} loại: chờ bàn giao, quá hạn duyệt, tồn âm</span></div>}
          subtext={`Quá ${data?.nguong_gio ?? 48} giờ chưa xử lý`}
        />
        <KpiCard
          tone="yellow"
          icon={<Bell size={20} className="text-white" />}
          watermark={<Bell size={52} />}
          label={MUC_DO_NHAN.trung_binh}
          value={fmtSo(dem("trung_binh"))}
          trend={<div className="kpi-trend"><span className="trend-sub">{loaiCo("trung_binh")} loại: báo hỏng, chênh lệch kiểm kê</span></div>}
        />
        <KpiCard
          tone="blue"
          icon={<ShieldAlert size={20} className="text-white" />}
          watermark={<ShieldAlert size={52} />}
          label={MUC_DO_NHAN.thap}
          value={fmtSo(dem("thap"))}
          trend={<div className="kpi-trend"><span className="trend-sub">{loaiCo("thap")} loại: bảo hành, đơn giá bất thường</span></div>}
        />
        <KpiCard
          tone="cyan"
          icon={<ListChecks size={20} className="text-white" />}
          watermark={<ListChecks size={52} />}
          label="Loại cảnh báo đang có"
          value={`${rows.filter((r) => r.so_luong > 0).length}/${rows.length}`}
          trend={<div className="kpi-trend trend-up"><span className="trend-sub">{rows.filter((r) => r.so_luong === 0).length} loại không có vấn đề</span></div>}
        />
      </div>

      <div className="split-grid">
        <div className="content-card alert-card">
          <div className="card-header">
            <div className="card-title-wrap">
              <AlertTriangle size={17} className="card-title-icon text-red" />
              <h2 className="card-title">Loại cảnh báo</h2>
            </div>
          </div>
          <div className="alert-list">
            {rows.map((cb) => (
              <CanhBaoRow key={cb.loai} cb={cb} active={cb.loai === loai} onClick={() => setLoai(cb.loai)} />
            ))}
          </div>
        </div>

        <div className="content-card">
          <div className="card-header">
            <div className="card-title-wrap">
              <Eye size={17} className="card-title-icon text-teal" />
              <h2 className="card-title">{dangChon ? `${dangChon.tieu_de} (${dangChon.so_luong})` : "Chi tiết"}</h2>
            </div>
            {xuLyDuoc && laDonGia && deXuatGia.length > 0 && (
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setApDung(new Map(deXuatGia.map((x) => [x.vt_id, true])))}>
                <Wand2 size={13} /> Áp dụng đề xuất sửa giá ({fmtSo(deXuatGia.length)} vật tư)
              </button>
            )}
          </div>
          {chiTiet && chiTiet.length === 0 && <div className="empty-state">Không có mục nào cần xử lý.</div>}
          {chiTiet && chiTiet.length > 0 && (
            <div className="task-table-wrapper">
              <table className="task-table">
                <thead>
                  <tr>
                    <th style={{ width: "18%" }}>Mã</th>
                    <th style={{ width: "26%" }}>Đối tượng</th>
                    <th>Chi tiết</th>
                    {laDonGia && <th style={{ width: "30%" }}>Đề xuất</th>}
                    <th style={{ width: "13%" }}>Thời gian</th>
                    {xuLyDuoc && <th style={{ width: laDonGia ? "15%" : "12%", textAlign: "right" }}>Thao tác</th>}
                  </tr>
                </thead>
                <tbody>
                  {tCb.dongTrang.map((d, i) => (
                    <tr key={`${d.ref}:${i}`}>
                      <td data-label="Mã">
                        <span className="code-link" role="button" tabIndex={0} onClick={() => moDong(d)}>
                          {d.ma ?? d.ref.slice(0, 8)}
                        </span>
                      </td>
                      <td data-label="Đối tượng">{d.ten}</td>
                      <td data-label="Chi tiết" className="text-secondary">
                        {d.chi_tiet}
                      </td>
                      {laDonGia && (
                        <td data-label="Đề xuất" className={`small ${d.de_xuat ? MAU_DE_XUAT[d.de_xuat.kieu] : "muted"}`}>
                          {d.de_xuat?.ly_do ?? "-"}
                        </td>
                      )}
                      <td data-label="Thời gian" className="text-secondary">
                        {d.thoi_gian ? fmtNgayGio(d.thoi_gian) : "-"}
                      </td>
                      {xuLyDuoc && (
                        <td data-label="Thao tác" style={{ textAlign: "right" }}>
                          <div className="row-actions">
                            {d.de_xuat?.kieu === "sua_tham_khao" && d.vt_id && d.de_xuat.gia_de_xuat ? (
                              <button
                                className="btn btn-primary btn-sm"
                                disabled={busy}
                                title={`Sửa giá tham khảo ${fmtGiaTriDong(d.don_gia_tham_khao ?? 0)} → ${fmtGiaTriDong(d.de_xuat.gia_de_xuat)}`}
                                onClick={() => suaGia([{ vt_id: d.vt_id!, don_gia: d.de_xuat!.gia_de_xuat! }])}
                              >
                                <Wand2 size={12} /> Sửa → {fmtSo(d.de_xuat.gia_de_xuat)}đ
                              </button>
                            ) : d.de_xuat?.kieu === "kiem_tra_phieu" ? (
                              <button className="btn btn-outline btn-sm" onClick={() => moDong(d)}>
                                Xem phiếu
                              </button>
                            ) : null}
                            {d.khoa && (
                              <button className="btn btn-outline btn-sm" disabled={busy} title="Đã xem, không cần xử lý - ẩn mục này" onClick={() => boQua([d.khoa!])}>
                                <EyeOff size={12} /> Bỏ qua
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <PhanTrang trang={tCb.trang} tong={tCb.tong} onDoi={tCb.setTrang} donVi="mục" />
              {dangChon && dangChon.so_luong > chiTiet.length && (
                <p className="muted small" style={{ padding: "8px 4px" }}>
                  Đang hiển thị {chiTiet.length}/{dangChon.so_luong} mục đầu tiên.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {apDung && (
        <Modal size="lg" title="Áp dụng đề xuất sửa giá tham khảo" onClose={() => setApDung(null)}>
          <p className="muted small">
            Giá đề xuất = giá đa số các lần nhập mua thực tế. Bỏ chọn vật tư có giá đề xuất không hợp lý (vd phiếu nhập cũng bị nhập sai) - vật tư đó giữ nguyên.
          </p>
          <div className="task-table-wrapper table-scroll-y">
            <table className="task-table">
              <thead>
                <tr>
                  <th style={{ width: 30 }} />
                  <th>Vật tư</th>
                  <th style={{ textAlign: "right" }}>Giá tham khảo hiện tại</th>
                  <th style={{ textAlign: "right" }}>Giá đề xuất</th>
                  <th style={{ textAlign: "right" }}>Số dòng lệch</th>
                </tr>
              </thead>
              <tbody>
                {deXuatGia.map((x) => (
                  <tr key={x.vt_id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Chọn ${x.ten}`}
                        checked={!!apDung.get(x.vt_id)}
                        onChange={(e) => setApDung(new Map(apDung).set(x.vt_id, e.target.checked))}
                      />
                    </td>
                    <td data-label="Vật tư">{x.ten}</td>
                    <td data-label="Hiện tại" style={{ textAlign: "right" }} className="text-secondary">
                      {fmtSo(x.cu)}đ
                    </td>
                    <td data-label="Đề xuất" style={{ textAlign: "right" }} className="strong">
                      {fmtSo(x.moi)}đ
                    </td>
                    <td data-label="Số dòng" style={{ textAlign: "right" }}>
                      {fmtSo(x.so_dong)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => setApDung(null)}>
              Huỷ
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || ![...apDung.values()].some(Boolean)}
              onClick={() => suaGia(deXuatGia.filter((x) => apDung.get(x.vt_id)).map((x) => ({ vt_id: x.vt_id, don_gia: x.moi })))}
            >
              {busy ? "Đang sửa..." : `Sửa giá ${fmtSo([...apDung.values()].filter(Boolean).length)} vật tư`}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
