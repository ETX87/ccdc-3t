import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bell, Eye, ListChecks, ShieldAlert } from "lucide-react";
import { api } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { KhoFilter } from "../components/KhoFilter";
import { KpiCard } from "../components/KpiCard";
import { CanhBaoRow, MUC_DO_NHAN, type CanhBao, type CanhBaoChiTiet, type LoaiCanhBao } from "../components/CanhBaoRow";
import { useChiTiet } from "../components/ChiTiet";
import { useNav } from "../lib/navigation";
import { useKhiThayDoi } from "../lib/suKien";
import { fmtNgayGio, fmtSo } from "../lib/format";
import { thongBaoLoi } from "../lib/nhan";

interface CanhBaoResp {
  cap_nhat_luc: string;
  nguong_gio: number;
  rows: CanhBao[];
  chi_tiet: CanhBaoChiTiet[] | null;
}

// Man Canh bao: 7 loai canh bao that (nguong qua han 48 gio) + danh sach chi tiet tung loai; bam 1 dong
// chi tiet -> mo phieu / tai san / ton kho vat tu tuong ung.
export function CanhBaoScreen() {
  const { params, navigate } = useNav();
  const { moPhieu, moTaiSan } = useChiTiet();
  const [khoId, setKhoId] = useState(params.kho_id ?? "");
  const [loai, setLoai] = useState<LoaiCanhBao | null>((params.loai as LoaiCanhBao) ?? null);
  const [data, setData] = useState<CanhBaoResp | null>(null);
  const [chiTiet, setChiTiet] = useState<CanhBaoChiTiet[] | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

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
                    <th style={{ width: "17%" }}>Thời gian</th>
                  </tr>
                </thead>
                <tbody>
                  {chiTiet.map((d, i) => (
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
                      <td data-label="Thời gian" className="text-secondary">
                        {d.thoi_gian ? fmtNgayGio(d.thoi_gian) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {dangChon && dangChon.so_luong > chiTiet.length && (
                <p className="muted small" style={{ padding: "8px 4px" }}>
                  Đang hiển thị {chiTiet.length}/{dangChon.so_luong} mục đầu tiên.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
