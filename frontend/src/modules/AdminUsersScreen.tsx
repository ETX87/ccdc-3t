import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, HardDrive, Lock, Search, ShieldCheck, UserCheck, UserPlus, UserX } from "lucide-react";
import { api } from "../api/client";
import type { TrangThaiDuyet, VaiTro } from "../types";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { FilterTabs } from "../components/FilterTabs";
import { StatusBadge } from "../components/StatusBadge";
import { fmtNgayGio, fmtSo } from "../lib/format";
import { fmtKichThuoc } from "../lib/dinhKem";
import { useNav } from "../lib/navigation";
import { baoThayDoi, useKhiThayDoi } from "../lib/suKien";
import { tenVaiTro, thongBaoLoi, VAI_TRO } from "../lib/nhan";
import { PhanTrang, useTrangKhach } from "../components/PhanTrang";

interface UserRow {
  email: string;
  ten: string | null;
  vai_tro: VaiTro | null;
  trang_thai_duyet: TrangThaiDuyet;
  bi_khoa: boolean;
  created_at: string;
  anh_dai_dien: string | null;
  ma_nv: string | null;
  ten_nv: string | null;
  bo_phan: string | null;
  kho_thu_kho: string | null;
}
type Tab = "cho-duyet" | "da-duyet" | "tu-choi" | "bi-khoa" | "tat-ca";
interface ThayDoi {
  user: UserRow;
  body: { trang_thai_duyet?: TrangThaiDuyet; vai_tro?: VaiTro | null; bi_khoa?: boolean };
  moTa: string;
}

const TRANG_THAI_LABEL: Record<TrangThaiDuyet, { label: string; tone: "warning" | "success" | "danger" }> = {
  "Cho duyet": { label: "Chờ duyệt", tone: "warning" },
  "Da duyet": { label: "Đã duyệt", tone: "success" },
  "Tu choi": { label: "Từ chối", tone: "danger" },
};
const MO_TA_VAI_TRO: Record<string, string> = {
  "": "Xem tài sản của mình, xác nhận nhận hàng, báo hỏng",
  "Quan ly": "Quản lý nhóm cấp dưới + kho quản lý của mình",
  HCNS: "Danh mục, kho, lập nhập mua, đề xuất xử lý tài sản",
  "Ke toan": "Duyệt nhập mua / báo hỏng / thanh lý / tiêu hủy",
  Admin: "Toàn quyền, phân quyền tài khoản",
};

function chuDau(s: string) {
  // Chi lay tu bat dau bang chu cai (bo "(local", "-", so...) - tranh chu dau kieu "(B".
  const tu = s.replace(/@.*/, "").split(/[\s._-]+/).filter((w) => /^\p{L}/u.test(w));
  return tu.slice(-2).map((w) => w[0].toUpperCase()).join("") || "?";
}

// Tai khoan & phan quyen (Admin): duyet / tu choi tai khoan dang nhap Google lan dau, phan vai tro,
// khoa / mo khoa. Moi thay doi quyen deu qua hop xac nhan. Tai khoan BOOTSTRAP_ADMIN server tu chan.
export function AdminUsersScreen() {
  const { navigate } = useNav();
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [tab, setTab] = useState<Tab>("cho-duyet");
  const [tim, setTim] = useState("");
  const [vaiTroLoc, setVaiTroLoc] = useState("tat-ca");
  const [thayDoi, setThayDoi] = useState<ThayDoi | null>(null);
  const [busy, setBusy] = useState(false);
  const [loiModal, setLoiModal] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const [capNhatLuc, setCapNhatLuc] = useState<string | null>(null);

  const load = useCallback(async () => {
    setDangTai(true);
    setLoi(null);
    try {
      const res = await api.get<{ rows: UserRow[] }>("/admin/users?tab=tat-ca");
      setRows(res.rows);
      setCapNhatLuc(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace("T", " "));
    } catch (e) {
      setLoi(thongBaoLoi(e, "Không tải được danh sách tài khoản."));
      setRows([]);
    } finally {
      setDangTai(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useKhiThayDoi(load);

  const r0 = rows ?? [];
  const dem = {
    "cho-duyet": r0.filter((u) => u.trang_thai_duyet === "Cho duyet").length,
    "da-duyet": r0.filter((u) => u.trang_thai_duyet === "Da duyet" && !u.bi_khoa).length,
    "tu-choi": r0.filter((u) => u.trang_thai_duyet === "Tu choi").length,
    "bi-khoa": r0.filter((u) => u.bi_khoa).length,
    "tat-ca": r0.length,
  };
  const chuaLienKet = r0.filter((u) => u.trang_thai_duyet === "Da duyet" && !u.ma_nv && !u.email.endsWith("@he-thong.local")).length;

  const ds = useMemo(() => {
    const t = tim.trim().toLowerCase();
    return r0.filter((u) => {
      if (tab === "cho-duyet" && u.trang_thai_duyet !== "Cho duyet") return false;
      if (tab === "da-duyet" && (u.trang_thai_duyet !== "Da duyet" || u.bi_khoa)) return false;
      if (tab === "tu-choi" && u.trang_thai_duyet !== "Tu choi") return false;
      if (tab === "bi-khoa" && !u.bi_khoa) return false;
      if (vaiTroLoc !== "tat-ca" && (u.vai_tro ?? "") !== vaiTroLoc) return false;
      return !t || `${u.email} ${u.ten ?? ""} ${u.ten_nv ?? ""} ${u.ma_nv ?? ""}`.toLowerCase().includes(t);
    });
  }, [r0, tab, tim, vaiTroLoc]);
  const tUser = useTrangKhach(ds, [tab, tim, vaiTroLoc]);

  async function apDung() {
    if (!thayDoi) return;
    setBusy(true);
    setLoiModal(null);
    try {
      await api.patch(`/admin/users/${encodeURIComponent(thayDoi.user.email)}`, thayDoi.body);
      setMsg(`${thayDoi.moTa} - ${thayDoi.user.email}.`);
      setThayDoi(null);
      baoThayDoi();
      await load();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setLoiModal(code === "CANNOT_MODIFY_BOOTSTRAP_ADMIN" ? "Không thể sửa tài khoản quản trị gốc của hệ thống." : thongBaoLoi(e));
    } finally {
      setBusy(false);
    }
  }

  const hoi = (user: UserRow, body: ThayDoi["body"], moTa: string) => {
    setLoiModal(null);
    setThayDoi({ user, body, moTa });
  };

  return (
    <div className="dashboard-container">
      <PageHeader
        title="Tài khoản & phân quyền"
        filters={
          <label className="header-dropdown select-dropdown">
            <select value={vaiTroLoc} onChange={(e) => setVaiTroLoc(e.target.value)} aria-label="Vai trò">
              <option value="tat-ca">Mọi vai trò</option>
              <option value="">Nhân viên</option>
              {Object.entries(VAI_TRO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <ChevronDown size={13} className="dropdown-arrow" />
          </label>
        }
        actions={
          <button className="btn btn-outline" onClick={() => navigate("kho", { tab: "cau-hinh" })}>
            <ShieldCheck size={14} /> Gán thủ kho
          </button>
        }
        capNhatLuc={capNhatLuc}
        onRefresh={load}
        dangTai={dangTai}
      />
      {loi && <div className="alert alert-error">{loi}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}

      <div className="kpi-grid kpi-grid-4">
        <KpiCard
          tone={dem["cho-duyet"] ? "yellow" : "cyan"}
          icon={<UserPlus size={20} className="text-white" />}
          watermark={<UserPlus size={52} />}
          label="Chờ duyệt"
          value={fmtSo(dem["cho-duyet"])}
          trend={<div className="kpi-trend"><span className="trend-sub">Đăng nhập Google lần đầu</span></div>}
          onClick={() => setTab("cho-duyet")}
        />
        <KpiCard
          tone="blue-light"
          icon={<UserCheck size={20} className="text-white" />}
          watermark={<UserCheck size={52} />}
          label="Đang hoạt động"
          value={fmtSo(dem["da-duyet"])}
          trend={
            <div className="kpi-trend">
              <span className="trend-sub">
                {fmtSo(r0.filter((u) => u.trang_thai_duyet === "Da duyet" && !u.bi_khoa && u.vai_tro).length)} có vai trò quản trị / quản lý
              </span>
            </div>
          }
          onClick={() => setTab("da-duyet")}
        />
        <KpiCard
          tone={chuaLienKet ? "purple" : "blue"}
          icon={<UserX size={20} className="text-white" />}
          watermark={<UserX size={52} />}
          label="Chưa liên kết nhân viên"
          value={fmtSo(chuaLienKet)}
          trend={<div className="kpi-trend"><span className="trend-sub">Nhập email ở màn Nhân viên để liên kết</span></div>}
          onClick={() => navigate("nhan-vien")}
        />
        <KpiCard
          tone={dem["bi-khoa"] ? "red" : "blue"}
          icon={<Lock size={20} className="text-white" />}
          watermark={<Lock size={52} />}
          label="Bị khoá / từ chối"
          value={fmtSo(dem["bi-khoa"] + dem["tu-choi"])}
          trend={
            <div className="kpi-trend">
              <span className="trend-sub">
                {fmtSo(dem["bi-khoa"])} khoá · {fmtSo(dem["tu-choi"])} từ chối
              </span>
            </div>
          }
          onClick={() => setTab("bi-khoa")}
        />
      </div>

      <KetNoiDrive />

      <div className="content-card task-card-full">
        <div className="card-header">
          <FilterTabs<Tab>
            value={tab}
            onChange={setTab}
            tabs={[
              { key: "cho-duyet", label: "Chờ duyệt", count: dem["cho-duyet"] },
              { key: "da-duyet", label: "Đang hoạt động", count: dem["da-duyet"] },
              { key: "bi-khoa", label: "Bị khoá", count: dem["bi-khoa"] },
              { key: "tu-choi", label: "Từ chối", count: dem["tu-choi"] },
              { key: "tat-ca", label: "Tất cả", count: dem["tat-ca"] },
            ]}
          />
          <div className="topbar-search filter-search">
            <Search size={15} className="search-icon" />
            <input className="search-input" placeholder="Tìm tên, email, mã NV..." value={tim} onChange={(e) => setTim(e.target.value)} />
          </div>
        </div>
        <div className="task-table-wrapper">
          <table className="task-table">
            <thead>
              <tr>
                <th>Tài khoản</th>
                <th style={{ width: "20%" }}>Hồ sơ nhân viên</th>
                <th style={{ width: "16%" }}>Vai trò</th>
                <th style={{ width: "15%" }}>Thủ kho</th>
                <th style={{ width: "11%", textAlign: "center" }}>Trạng thái</th>
                <th style={{ width: "17%", textAlign: "right" }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {rows === null && (
                <tr>
                  <td colSpan={6} className="task-empty">
                    Đang tải…
                  </td>
                </tr>
              )}
              {rows !== null && ds.length === 0 && (
                <tr>
                  <td colSpan={6} className="task-empty">
                    {tab === "cho-duyet" ? "Không có tài khoản nào chờ duyệt." : "Không có tài khoản phù hợp."}
                  </td>
                </tr>
              )}
              {tUser.dongTrang.map((u) => {
                const st = TRANG_THAI_LABEL[u.trang_thai_duyet];
                const daDuyet = u.trang_thai_duyet === "Da duyet";
                return (
                  <tr key={u.email}>
                    <td data-label="Tài khoản">
                      <div className="icon-text">
                        {u.anh_dai_dien ? (
                          <img className="avatar-chu" src={u.anh_dai_dien} alt="" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="avatar-chu">{chuDau(u.ten || u.email)}</span>
                        )}
                        <div className="cell-stack">
                          <span className="strong">{u.ten || "-"}</span>
                          <span className="small text-secondary">
                            {u.email} · tạo {fmtNgayGio(u.created_at).slice(0, 10)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td data-label="Hồ sơ NV">
                      {u.ma_nv ? (
                        <div className="cell-stack">
                          <span>{u.ten_nv}</span>
                          <span className="small text-secondary">
                            {u.ma_nv}
                            {u.bo_phan ? ` · ${u.bo_phan}` : ""}
                          </span>
                        </div>
                      ) : (
                        <span className="muted">Chưa liên kết</span>
                      )}
                    </td>
                    <td data-label="Vai trò">
                      {daDuyet ? (
                        <select
                          value={u.vai_tro ?? ""}
                          aria-label="Vai trò"
                          title={MO_TA_VAI_TRO[u.vai_tro ?? ""]}
                          onChange={(e) => {
                            const v = (e.target.value || null) as VaiTro | null;
                            hoi(u, { vai_tro: v }, `Đổi vai trò thành ${tenVaiTro(v)}`);
                          }}
                        >
                          <option value="">Nhân viên</option>
                          {Object.entries(VAI_TRO).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      ) : (
                        tenVaiTro(u.vai_tro)
                      )}
                    </td>
                    <td data-label="Thủ kho" className="text-secondary small">
                      {u.kho_thu_kho ?? "-"}
                    </td>
                    <td data-label="Trạng thái" style={{ textAlign: "center" }}>
                      <div className="cell-stack" style={{ alignItems: "center" }}>
                        <StatusBadge label={st.label} tone={st.tone} />
                        {u.bi_khoa && <StatusBadge label="Đã khoá" tone="danger" />}
                      </div>
                    </td>
                    <td data-label="Thao tác" style={{ textAlign: "right" }}>
                      <div className="row-actions">
                        {!daDuyet && (
                          <button className="btn btn-primary btn-sm" onClick={() => hoi(u, { trang_thai_duyet: "Da duyet" }, "Duyệt tài khoản")}>
                            Duyệt
                          </button>
                        )}
                        {u.trang_thai_duyet === "Cho duyet" && (
                          <button className="btn btn-outline btn-sm danger-outline" onClick={() => hoi(u, { trang_thai_duyet: "Tu choi" }, "Từ chối tài khoản")}>
                            Từ chối
                          </button>
                        )}
                        {daDuyet && (
                          <button
                            className={`btn btn-outline btn-sm${u.bi_khoa ? "" : " danger-outline"}`}
                            onClick={() => hoi(u, { bi_khoa: !u.bi_khoa }, u.bi_khoa ? "Mở khoá tài khoản" : "Khoá tài khoản")}
                          >
                            {u.bi_khoa ? "Mở khoá" : "Khoá"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PhanTrang trang={tUser.trang} tong={tUser.tong} onDoi={tUser.setTrang} donVi="tài khoản" />
      </div>

      {thayDoi && (
        <Modal title={thayDoi.moTa} onClose={() => setThayDoi(null)}>
          <p>
            {thayDoi.moTa} <b>{thayDoi.user.ten || thayDoi.user.email}</b> ({thayDoi.user.email})?
          </p>
          {thayDoi.body.vai_tro !== undefined && (
            <p className="muted small">
              {tenVaiTro(thayDoi.user.vai_tro)} → <b>{tenVaiTro(thayDoi.body.vai_tro)}</b>: {MO_TA_VAI_TRO[thayDoi.body.vai_tro ?? ""]}.
            </p>
          )}
          {thayDoi.body.bi_khoa === true && <p className="muted small">Người này sẽ không đăng nhập được cho tới khi mở khoá.</p>}
          {thayDoi.body.trang_thai_duyet === "Da duyet" && <p className="muted small">Mặc định vai trò Nhân viên - đổi vai trò sau khi duyệt nếu cần.</p>}
          {loiModal && <div className="alert alert-error">{loiModal}</div>}
          <div className="modal-actions">
            <button className="btn" onClick={() => setThayDoi(null)}>
              Huỷ
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={apDung}>
              {busy ? "Đang lưu..." : "Xác nhận"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Ket noi Google Drive (1 tai khoan Google that) luu hoa don / chung tu / anh bang chung - backend routes/settings.ts.
function KetNoiDrive() {
  const [st, setSt] = useState<{
    connected: boolean;
    google_email?: string;
    authorized_by?: string | null;
    authorized_at?: string;
    so_tep: number;
    dung_luong: number;
  } | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  useEffect(() => {
    api
      .get<NonNullable<typeof st>>("/settings/google-drive/status")
      .then(setSt)
      .catch((e) => setLoi(thongBaoLoi(e, "Không đọc được trạng thái Google Drive.")));
  }, []);
  return (
    <div className="content-card" style={{ marginBottom: 14 }}>
      <div className="card-header" style={{ marginBottom: 6 }}>
        <div className="card-title-wrap">
          <HardDrive size={16} className="card-title-icon text-teal" />
          <span className="card-title">Lưu trữ hóa đơn, chứng từ & ảnh (Google Drive)</span>
          {st && <StatusBadge label={st.connected ? "Đã kết nối" : "Chưa kết nối"} tone={st.connected ? "success" : "warning"} />}
        </div>
        {st && (
          <a className="btn btn-outline btn-sm" href="/api/settings/google-drive/authorize">
            {st.connected ? "Kết nối lại / đổi tài khoản" : "Kết nối Google Drive"}
          </a>
        )}
      </div>
      {loi && <div className="alert alert-error">{loi}</div>}
      {st && (
        <div className="muted" style={{ fontSize: 12.5 }}>
          {st.connected ? (
            <>
              Tài khoản <b>{st.google_email}</b> · kết nối bởi {st.authorized_by ?? "—"} lúc {fmtNgayGio(st.authorized_at ?? null)} · {fmtSo(st.so_tep)} tệp (
              {fmtKichThuoc(st.dung_luong)}).
            </>
          ) : (
            "Chưa kết nối - người dùng chưa tải được hóa đơn, chứng từ, ảnh lên phiếu. Bấm \"Kết nối Google Drive\" và chọn tài khoản Google của công ty để lưu tệp."
          )}
        </div>
      )}
    </div>
  );
}
