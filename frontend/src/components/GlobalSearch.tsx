import { t } from "../lib/i18n";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useNav } from "../lib/navigation";
import { duocMoTab } from "../lib/menu";
import { LOAI_GIAO_NHAN, LOAI_PHIEU_CK, LOAI_XU_LY, TRANG_THAI_TS } from "../lib/nhan";
import { useChiTiet, type LoaiPhieu } from "./ChiTiet";

// O tim kiem topbar: go >= 2 ky tu -> /api/dashboard/tim-kiem (loc theo quyen o server) -> ket qua nhom
// theo loai; bam de mo chi tiet (tai san, phieu) hoac chuyen man kem bo loc (vat tu, nhan vien).

interface KetQua {
  tai_san: { id: string; ten: string; trang_thai: string; vi_tri: string | null }[];
  vat_tu: { id: string; ten: string; don_vi_tinh: string | null }[];
  nhan_vien: { id: string; ten: string; bo_phan: string | null }[];
  phieu: { id: string; ma_phieu: string | null; loai: string; loai_phieu: LoaiPhieu; created_at: string }[];
}

const TEN_LOAI_PHIEU = (p: KetQua["phieu"][number]) =>
  p.loai_phieu === "chuyen_kho" ? LOAI_PHIEU_CK[p.loai] : p.loai_phieu === "giao_nhan" ? LOAI_GIAO_NHAN[p.loai] : LOAI_XU_LY[p.loai];

export function GlobalSearch() {
  const auth = useAuth();
  const { navigate } = useNav();
  const { moPhieu, moTaiSan, moVatTu } = useChiTiet();
  const [q, setQ] = useState("");
  const [kq, setKq] = useState<KetQua | null>(null);
  const [open, setOpen] = useState(false);
  const [dangTai, setDangTai] = useState(false);
  const [moRong, setMoRong] = useState(false); // man hinh nho: o tim kiem thu thanh bieu tuong
  const lanGoi = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const tu = q.trim();
    if (tu.length < 2) {
      setKq(null);
      return;
    }
    const lan = ++lanGoi.current;
    setDangTai(true);
    const timer = window.setTimeout(() => {
      api
        .get<KetQua>(`/dashboard/tim-kiem?q=${encodeURIComponent(tu)}`)
        .then((r) => lan === lanGoi.current && setKq(r))
        .catch(() => lan === lanGoi.current && setKq({ tai_san: [], vat_tu: [], nhan_vien: [], phieu: [] }))
        .finally(() => lan === lanGoi.current && setDangTai(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    if (moRong) inputRef.current?.focus();
  }, [moRong]);

  if (auth.status !== "authenticated") return null;
  const user = auth.user;

  function dong() {
    setOpen(false);
    setQ("");
    setMoRong(false);
  }

  const tong = kq ? kq.tai_san.length + kq.vat_tu.length + kq.nhan_vien.length + kq.phieu.length : 0;
  const moNhanVien = duocMoTab(user, "nhan-vien") ? "nhan-vien" : duocMoTab(user, "bao-cao") ? "bao-cao" : null;

  return (
    <div className={`topbar-search-wrap ${moRong ? "expanded" : ""}`}>
      <button type="button" className="topbar-search-toggle" aria-label={t("Tìm kiếm")} onClick={() => setMoRong(true)}>
        <Search size={19} />
      </button>
      <div className="topbar-search">
        <Search size={16} className="search-icon" />
        <input
          ref={inputRef}
          type="text"
          placeholder={t("Tìm kiếm tài sản, phiếu, nhân viên...")}
          className="search-input"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === "Escape" && dong()}
        />
        {(q || moRong) && (
          <button type="button" className="search-clear" aria-label={t("Xoá")} onClick={dong}>
            <X size={15} />
          </button>
        )}
      </div>

      {open && q.trim().length >= 2 && (
        <>
          <div className="dropdown-backdrop" onClick={() => setOpen(false)} />
          <div className="search-results">
            {dangTai && !kq && <div className="search-empty">{t("Đang tìm…")}</div>}
            {kq && tong === 0 && !dangTai && <div className="search-empty">{t("Không tìm thấy kết quả cho")} "{q.trim()}".</div>}
            {kq && kq.tai_san.length > 0 && (
              <div className="search-group">
                <div className="search-group-title">{t("Tài sản")}</div>
                {kq.tai_san.map((ts) => (
                  <button
                    key={ts.id}
                    type="button"
                    className="search-item"
                    onClick={() => {
                      dong();
                      moTaiSan(ts.id);
                    }}
                  >
                    <span className="search-item-code">{ts.id}</span>
                    <span className="search-item-main">{ts.ten}</span>
                    <span className="search-item-sub">
                      {TRANG_THAI_TS[ts.trang_thai]?.label ?? ts.trang_thai}
                      {ts.vi_tri ? ` · ${ts.vi_tri}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {kq && kq.phieu.length > 0 && (
              <div className="search-group">
                <div className="search-group-title">{t("Phiếu")}</div>
                {kq.phieu.map((p) => (
                  <button
                    key={`${p.loai_phieu}:${p.id}`}
                    type="button"
                    className="search-item"
                    onClick={() => {
                      dong();
                      moPhieu(p.loai_phieu, p.id);
                    }}
                  >
                    <span className="search-item-code">{p.ma_phieu ?? p.id.slice(0, 8)}</span>
                    <span className="search-item-main">{TEN_LOAI_PHIEU(p) ?? p.loai}</span>
                  </button>
                ))}
              </div>
            )}
            {kq && kq.vat_tu.length > 0 && (duocMoTab(user, "cap-phat") || !!user?.xem_ton) && (
              <div className="search-group">
                <div className="search-group-title">{t("Vật tư tiêu hao")}</div>
                {kq.vat_tu.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className="search-item"
                    onClick={() => {
                      dong();
                      moVatTu(v.id);
                    }}
                  >
                    <span className="search-item-code">{v.id}</span>
                    <span className="search-item-main">{v.ten}</span>
                    <span className="search-item-sub">{t("Tồn kho, lịch sử")}</span>
                  </button>
                ))}
              </div>
            )}
            {kq && kq.nhan_vien.length > 0 && moNhanVien && (
              <div className="search-group">
                <div className="search-group-title">{t("Nhân viên")}</div>
                {kq.nhan_vien.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className="search-item"
                    onClick={() => {
                      dong();
                      if (moNhanVien === "nhan-vien") navigate("nhan-vien", { q: n.id });
                      else navigate("bao-cao", { tab: "theo-nhan-vien", q: n.id });
                    }}
                  >
                    <span className="search-item-code">{n.id}</span>
                    <span className="search-item-main">{n.ten}</span>
                    {n.bo_phan && <span className="search-item-sub">{n.bo_phan}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
