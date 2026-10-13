import { t } from "../lib/i18n";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, Download, Layers, Package, Search, Truck } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { exportRowsToExcel } from "../lib/exportExcel";
import { useNav } from "../lib/navigation";
import { laQuanTri } from "../lib/menu";
import { useKhiThayDoi } from "../lib/suKien";
import { fmtGiaTri, fmtGiaTriDong, fmtSo, homNayVN } from "../lib/format";
import { LOAI_KHO, laKhoTon, thongBaoLoi } from "../lib/nhan";
import type { LoaiKho } from "../types";
import { PhanTrang, useTrangKhach } from "../components/PhanTrang";
import { TonTheoKho } from "../components/TonTheoKho";
import { DieuChinhTonModal, TheKhoModal } from "../components/TheKho";
import { isHcns } from "../lib/nhan";
import { ChonLoc } from "../components/ChonLoc";

interface KhoRow {
  id: number;
  ten_kho: string;
  loai: LoaiKho;
  bat_tat: number;
  cong_ty_id?: number;
}
interface TonRow {
  id: string;
  ten_vt: string;
  don_vi_tinh: string | null;
  ten_nhom: string | null;
  don_gia_tham_khao: number | null;
  ton: number;
  dang_chuyen_den?: number;
  so_kho_con_hang?: number;
  so_kho_am?: number;
}

// Ton tinh DONG theo kho tai thoi diem xem (view v_ton_kho) - khong luu san trong danh muc. Quan tri xem
// toan he thong / moi kho; thu kho chi kho minh phu trach (server kiem lai).
export function TonTieuHaoScreen({ tabs }: { tabs?: ReactNode }) {
  const auth = useAuth();
  const { params, navigate } = useNav();
  const user = auth.status === "authenticated" ? auth.user : null;
  const toanBo = !!user && laQuanTri(user);
  const myKho = useMemo(() => (user?.kho_phu_trach ?? []).filter(laKhoTon), [user]);
  const [khos, setKhos] = useState<KhoRow[]>([]);
  const [khoId, setKhoId] = useState<string>(params.kho_id ?? (!toanBo && myKho.length === 1 ? String(myKho[0].id) : ""));
  const [rows, setRows] = useState<TonRow[] | null>(null);
  const [anHet, setAnHet] = useState(true);
  const [tim, setTim] = useState(params.q ?? "");
  const [chiAm, setChiAm] = useState(params.ton_am === "1");
  const [dangTai, setDangTai] = useState(false);
  const [capNhatLuc, setCapNhatLuc] = useState<string | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  // "vt" = danh sach theo vat tu (1 kho / cong don); "kho" = ma tran vat tu x kho.
  const [cheDo, setCheDo] = useState<"vt" | "kho">(params.che_do === "kho" ? "kho" : "vt");
  const [theKho, setTheKho] = useState<TonRow | null>(null);
  const [dieuChinh, setDieuChinh] = useState<string[] | null>(null);

  useEffect(() => {
    if (toanBo)
      api
        .get<{ rows: KhoRow[] }>("/kho")
        .then((r) => setKhos(r.rows.filter((k) => k.bat_tat && laKhoTon(k))))
        .catch(() => setKhos([]));
    else setKhos(myKho.map((k) => ({ ...k, bat_tat: 1 })));
  }, [toanBo, myKho]);

  const load = useCallback(async () => {
    setDangTai(true);
    setLoi(null);
    try {
      const res = await api.get<{ rows: TonRow[] }>(`/bao-cao/ton-kho${khoId ? `?kho_id=${khoId}` : ""}`);
      setRows(res.rows);
      setCapNhatLuc(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace("T", " "));
    } catch (e) {
      setLoi(thongBaoLoi(e, t("Không tải được tồn kho.")));
      setRows([]);
    } finally {
      setDangTai(false);
    }
  }, [khoId]);
  useEffect(() => {
    load();
  }, [load]);
  useKhiThayDoi(load);

  const tu = tim.trim().toLowerCase();
  const hienThi = (rows ?? []).filter(
    (r) =>
      (!anHet || r.ton !== 0 || (r.dang_chuyen_den ?? 0) > 0) &&
      (!chiAm || r.ton < 0 || (r.so_kho_am ?? 0) > 0) &&
      (!tu || r.id.toLowerCase().includes(tu) || r.ten_vt.toLowerCase().includes(tu)),
  );
  const tTon = useTrangKhach(hienThi, [tu, anHet, chiAm, khoId]);
  const tk = useMemo(() => {
    const all = rows ?? [];
    return {
      conHang: all.filter((r) => r.ton > 0).length,
      giaTri: all.reduce((s, r) => s + (r.ton > 0 ? r.ton * (r.don_gia_tham_khao ?? 0) : 0), 0),
      thieuGia: all.filter((r) => r.ton > 0 && !r.don_gia_tham_khao).length,
      am: all.filter((r) => r.ton < 0 || (r.so_kho_am ?? 0) > 0).length,
      dangDen: all.filter((r) => (r.dang_chuyen_den ?? 0) > 0).length,
      tongDangDen: all.reduce((s, r) => s + (r.dang_chuyen_den ?? 0), 0),
    };
  }, [rows]);
  const khoChon = khos.find((k) => String(k.id) === khoId);
  const tenKho = khoChon?.ten_kho ?? (toanBo ? t("Toàn hệ thống") : t("Các kho của tôi"));
  // Dieu chinh ton: HCNS (moi kho cong ty minh) hoac thu kho cua kho dang chon - server kiem lai.
  const duocDieuChinh = !!khoChon && !!user && (isHcns(user) || myKho.some((k) => k.id === khoChon.id));

  async function exportExcel() {
    await exportRowsToExcel(
      hienThi.map((r) => ({
        id: r.id,
        ten_vt: r.ten_vt,
        ten_nhom: r.ten_nhom,
        don_vi_tinh: r.don_vi_tinh,
        ton: r.ton,
        don_gia: r.don_gia_tham_khao,
        gia_tri: r.ton > 0 && r.don_gia_tham_khao ? r.ton * r.don_gia_tham_khao : null,
        dang_chuyen_den: r.dang_chuyen_den ?? "",
      })),
      `Ton_kho_${tenKho.replace(/\s+/g, "_")}_${homNayVN()}.xlsx`,
      "Ton kho",
      { id: t("Mã vật tư"), ten_vt: t("Tên vật tư"), ten_nhom: t("Nhóm"), don_vi_tinh: t("ĐVT"), ton: t("Tồn"), don_gia: t("Giá tham khảo"), gia_tri: t("Giá trị tồn"), dang_chuyen_den: t("Đang chuyển đến") },
    );
  }

  return (
    <div className="dashboard-container">
      <PageHeader
        title={t("Tồn kho tiêu hao")}
        filters={tabs}
        actions={
          <>
            {cheDo === "vt" && duocDieuChinh && (
              <button className="btn btn-outline" onClick={() => setDieuChinh([])} title={t("Nhập tồn đếm thực tế, lập phiếu điều chỉnh chờ Kế toán duyệt")}>
                <Layers size={14} /> {t("Điều chỉnh tồn")}
              </button>
            )}
            {cheDo === "vt" && (
              <button className="btn btn-outline" onClick={exportExcel} disabled={!hienThi.length}>
                <Download size={14} /> {t("Xuất Excel")}
              </button>
            )}
          </>
        }
        capNhatLuc={capNhatLuc}
        onRefresh={load}
        dangTai={dangTai}
      />

      <div className="kpi-grid kpi-grid-4">
        <KpiCard
          tone="cyan"
          icon={<Package size={20} className="text-white" />}
          watermark={<Package size={52} />}
          label={t("Mặt hàng còn tồn")}
          value={fmtSo(tk.conHang)}
          trend={<div className="kpi-trend"><span className="trend-sub">{tenKho}</span></div>}
          subtext={t("{x} mặt hàng có phát sinh", { x: fmtSo((rows ?? []).length) })}
          onClick={() => (setChiAm(false), setAnHet(true))}
        />
        <KpiCard
          tone="purple"
          icon={<Layers size={20} className="text-white" />}
          watermark={<Layers size={52} />}
          label={t("Giá trị tồn (giá tham khảo)")}
          value={fmtGiaTri(tk.giaTri)}
          trend={
            <div className={`kpi-trend ${tk.thieuGia ? "trend-warning" : "trend-up"}`}>
              <span className="trend-sub">{tk.thieuGia ? t("{x} mặt hàng chưa có giá tham khảo", { x: fmtSo(tk.thieuGia) }) : t("Mọi mặt hàng đều có giá")}</span>
            </div>
          }
          subtext={fmtGiaTriDong(tk.giaTri)}
        />
        <KpiCard
          tone={tk.am ? "red" : "blue-light"}
          icon={<AlertTriangle size={20} className="text-white" />}
          watermark={<AlertTriangle size={52} />}
          label={t("Vật tư tồn âm")}
          value={fmtSo(tk.am)}
          tangLaXau
          trend={<div className={`kpi-trend ${tk.am ? "trend-danger" : "trend-up"}`}><span className="trend-sub">{tk.am ? t("Xuất vượt nhập - cần kiểm kê, điều chỉnh") : t("Không có tồn âm")}</span></div>}
          onClick={() => (setChiAm(true), setAnHet(false))}
        />
        <KpiCard
          tone="blue"
          icon={<Truck size={20} className="text-white" />}
          watermark={<Truck size={52} />}
          label={t("Đang chuyển đến")}
          value={khoId ? fmtSo(tk.dangDen) : "-"}
          trend={
            <div className="kpi-trend">
              <span className="trend-sub">{khoId ? t("{x} đơn vị trên đường tới kho", { x: fmtSo(tk.tongDangDen) }) : t("Chọn 1 kho để xem hàng đang tới")}</span>
            </div>
          }
          onClick={() => navigate("viec-can-lam", { tab: "ban-giao" })}
        />
      </div>

      {loi && <div className="alert alert-error">{loi}</div>}

      <div className="content-card task-card-full">
        <div className="filter-bar">
          <div className="task-filter-tabs" style={{ marginBottom: 0 }}>
            <button type="button" className={`task-tab-btn${cheDo === "vt" ? " active" : ""}`} onClick={() => setCheDo("vt")}>
              {t("Theo vật tư")}
            </button>
            <button type="button" className={`task-tab-btn${cheDo === "kho" ? " active" : ""}`} onClick={() => setCheDo("kho")}>
              {t("Tồn theo từng kho")}
            </button>
          </div>
          <div className="topbar-search filter-search">
            <Search size={15} className="search-icon" />
            <input className="search-input" placeholder={t("Tìm mã, tên vật tư...")} value={tim} onChange={(e) => setTim(e.target.value)} />
          </div>
          {cheDo === "vt" && (
          <>
          <label className="header-dropdown select-dropdown">
            <ChonLoc value={khoId} onChange={(e) => setKhoId(e.target.value)} aria-label={t("Kho")}>
              <option value="">{toanBo ? t("Toàn hệ thống (cộng mọi kho)") : t("Tất cả kho của tôi")}</option>
              {khos.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.ten_kho} ({LOAI_KHO[k.loai]})
                </option>
              ))}
            </ChonLoc>
            <ChevronDown size={13} className="dropdown-arrow" />
          </label>
          <label className="check-label">
            <input type="checkbox" checked={anHet} onChange={(e) => setAnHet(e.target.checked)} />
            {t("Ẩn vật tư tồn 0")}
          </label>
          <label className="check-label">
            <input type="checkbox" checked={chiAm} onChange={(e) => setChiAm(e.target.checked)} />
            {t("Chỉ tồn âm")}
          </label>
          </>
          )}
        </div>
        {cheDo === "kho" ? (
          <TonTheoKho tim={tim} />
        ) : (
        <>
        <p className="muted small" style={{ marginBottom: 8 }}>
          {t("Tồn = hàng đã nhận vào kho − hàng đã xuất (kể cả đang chuyển). Hàng nhập mua chỉ vào tồn sau khi Kế toán duyệt.")}
        </p>
        <div className="task-table-wrapper">
          <table className="task-table">
            <thead>
              <tr>
                <th style={{ width: "13%" }}>{t("Mã")}</th>
                <th>{t("Tên vật tư")}</th>
                <th style={{ width: "15%" }}>{t("Nhóm")}</th>
                <th style={{ width: "8%" }}>{t("ĐVT")}</th>
                <th style={{ width: "9%", textAlign: "right" }}>{t("Tồn")}</th>
                <th style={{ width: "12%", textAlign: "right" }}>{t("Giá trị tồn")}</th>
                <th style={{ width: "12%", textAlign: "right" }}>{khoId ? t("Đang chuyển đến") : t("Số kho còn hàng")}</th>
                <th style={{ width: "9%", textAlign: "right" }}>{t("Phiếu")}</th>
              </tr>
            </thead>
            <tbody>
              {rows === null && (
                <tr>
                  <td colSpan={8} className="task-empty">
                    {t("Đang tải…")}
                  </td>
                </tr>
              )}
              {rows !== null && hienThi.length === 0 && (
                <tr>
                  <td colSpan={8} className="task-empty">
                    {t("Không có vật tư khớp bộ lọc.")}
                  </td>
                </tr>
              )}
              {tTon.dongTrang.map((r) => (
                <tr key={r.id}>
                  <td data-label={t("Mã")}>{r.id}</td>
                  <td data-label={t("Tên vật tư")} className="strong">
                    {r.ten_vt}
                  </td>
                  <td data-label={t("Nhóm")} className="text-secondary">
                    {r.ten_nhom ?? "-"}
                  </td>
                  <td data-label={t("ĐVT")}>{r.don_vi_tinh ?? "-"}</td>
                  <td data-label={t("Tồn")} style={{ textAlign: "right" }} className={r.ton < 0 ? "text-red strong" : "strong"}>
                    {fmtSo(r.ton, 2)}
                    {!khoId && (r.so_kho_am ?? 0) > 0 && <div className="small text-red">{r.so_kho_am} {t("kho âm")}</div>}
                  </td>
                  <td data-label={t("Giá trị tồn")} style={{ textAlign: "right" }}>
                    {r.ton > 0 && r.don_gia_tham_khao ? fmtSo(r.ton * r.don_gia_tham_khao) : "-"}
                  </td>
                  <td data-label={khoId ? t("Đang chuyển đến") : t("Số kho còn hàng")} style={{ textAlign: "right" }}>
                    {khoId ? (r.dang_chuyen_den ? fmtSo(r.dang_chuyen_den, 2) : "-") : fmtSo(r.so_kho_con_hang ?? 0)}
                  </td>
                  <td data-label={t("Phiếu")} style={{ textAlign: "right" }}>
                    <div className="row-actions">
                      {khoChon ? (
                        <button className="btn btn-outline btn-sm" onClick={() => setTheKho(r)} title={t("Thẻ kho: nhập / xuất từng phiếu, tồn lũy kế")}>
                          {t("Thẻ kho")}
                        </button>
                      ) : (
                        <button className="btn btn-outline btn-sm" onClick={() => setCheDo("kho")} title={t("Xem tồn từng kho")}>
                          {t("Theo kho")}
                        </button>
                      )}
                      {r.ton < 0 && duocDieuChinh && (
                        <button className="btn btn-outline btn-sm" onClick={() => setDieuChinh([r.id])}>
                          {t("Điều chỉnh")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PhanTrang trang={tTon.trang} tong={tTon.tong} onDoi={tTon.setTrang} donVi={t("vật tư")} />
        </>
        )}
      </div>
      {theKho && khoChon && <TheKhoModal khoId={khoChon.id} tenKho={khoChon.ten_kho} vt={theKho} onClose={() => setTheKho(null)} />}
      {dieuChinh && khoChon && (
        <DieuChinhTonModal
          khoId={khoChon.id}
          congTyId={khoChon.cong_ty_id ?? null}
          tenKho={khoChon.ten_kho}
          ds={(rows ?? []).map((r) => ({ id: r.id, ten_vt: r.ten_vt, don_vi_tinh: r.don_vi_tinh, ton: r.ton }))}
          chonSan={dieuChinh}
          onClose={() => setDieuChinh(null)}
        />
      )}
    </div>
  );
}
