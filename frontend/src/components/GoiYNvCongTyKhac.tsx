import { t } from "../lib/i18n";
import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { api } from "../api/client";
import { setCongTy } from "../lib/congTy";
import { thongBaoLoi } from "../lib/nhan";
import { baoThayDoi } from "../lib/suKien";

// Goi y khi tim nhan vien KHONG thay trong cong ty dang xem (2026-10-28): ho so khop o cong ty khac
// (GET /nhan-vien/cong-ty-khac) + thao tac: them kiem nhiem cong ty dang tim (HCNS) / doi cong ty dang xem.

interface GoiY {
  ma_nv: string;
  ten_nv: string;
  bo_phan: string | null;
  chuc_vu: string | null;
  dang_lam_viec: number;
  cong_ty: { id: number; ma: string; ten: string; chinh: boolean }[];
  xem_duoc: number[];
  them_duoc: { id: number; ma: string }[];
}

export function GoiYNvCongTyKhac({ search, congTyId, gon, onDaThem }: { search: string; congTyId?: number | null; gon?: boolean; onDaThem?: () => void }) {
  const [rows, setRows] = useState<GoiY[] | null>(null);
  const [dangThem, setDangThem] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loi, setLoi] = useState<string | null>(null);

  useEffect(() => {
    const q = search.trim();
    setRows(null);
    setMsg(null);
    if (q.length < 2) return;
    // Doi go xong moi tim (o tim kiem / o chon trong form).
    const h = setTimeout(() => {
      const qs = new URLSearchParams({ search: q, ...(congTyId ? { cong_ty_id: String(congTyId) } : {}) });
      api
        .get<{ rows: GoiY[] }>(`/nhan-vien/cong-ty-khac?${qs}`)
        .then((r) => setRows(r.rows))
        .catch(() => setRows([]));
    }, 400);
    return () => clearTimeout(h);
  }, [search, congTyId]);

  async function themKiemNhiem(n: GoiY, ct: { id: number; ma: string }) {
    setDangThem(n.ma_nv);
    setLoi(null);
    try {
      await api.post(`/nhan-vien/${encodeURIComponent(n.ma_nv)}/them-kiem-nhiem`, { cong_ty_id: ct.id });
      setMsg(t("Đã thêm {ten} kiêm nhiệm công ty {ct}.", { ten: n.ten_nv, ct: ct.ma }));
      baoThayDoi();
      onDaThem?.();
    } catch (e) {
      setLoi(thongBaoLoi(e));
    } finally {
      setDangThem(null);
    }
  }

  if (msg) return <div className="alert alert-success" style={{ margin: gon ? 6 : "10px 0" }}>{msg}</div>;
  if (!rows?.length) return null;
  // Chan blur o chon (SearchSelect dong danh sach khi mat focus) de bam duoc nut trong goi y.
  const giuFocus = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div className={gon ? "" : "card"} style={{ margin: gon ? 0 : "10px 0", padding: gon ? 8 : 14, fontSize: 13 }} onMouseDown={giuFocus}>
      <div className="muted small" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <Building2 size={14} /> {t("Không có trong công ty đang xem - tìm thấy ở công ty khác:")}
      </div>
      {loi && <div className="alert alert-error">{loi}</div>}
      {rows.map((n) => (
        <div key={n.ma_nv} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "6px 0", borderTop: "1px solid #F1F5F9" }}>
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            <span className="strong">{n.ten_nv}</span> <span className="muted">({n.ma_nv})</span>
            {!n.dang_lam_viec && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>{t("Đã nghỉ")}</span>}
            <div className="muted small">
              {n.cong_ty.map((c) => (c.chinh ? c.ma : t("{ma} (kiêm nhiệm)", { ma: c.ma }))).join(", ")}
              {n.bo_phan ? ` · ${n.bo_phan}` : ""}
              {n.chuc_vu ? ` · ${n.chuc_vu}` : ""}
            </div>
          </div>
          {n.them_duoc.map((ct) => (
            <button key={ct.id} type="button" className="btn btn-primary btn-sm" disabled={dangThem !== null} onClick={() => themKiemNhiem(n, ct)}>
              {t("Thêm kiêm nhiệm {ct}", { ct: ct.ma })}
            </button>
          ))}
          {!gon &&
            n.xem_duoc.slice(0, 1).map((id) => (
              <button key={id} type="button" className="btn btn-outline btn-sm" onClick={() => setCongTy(String(id))}>
                {t("Xem ở công ty {ct}", { ct: n.cong_ty.find((c) => c.id === id)?.ma ?? "" })}
              </button>
            ))}
          {!n.them_duoc.length && n.dang_lam_viec === 1 && (
            <span className="muted small">{t("Nhờ HCNS thêm kiêm nhiệm công ty này để chọn được.")}</span>
          )}
        </div>
      ))}
    </div>
  );
}
