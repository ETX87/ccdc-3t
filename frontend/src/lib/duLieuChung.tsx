import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../api/client";

// Nguon du lieu "viec can lam" dung chung cho: so do tren menu, chuong thong bao, bang Viec can xu ly
// (Tong quan) va man Viec can lam - 1 lan tai, tu lam moi moi 60 giay + khi quay lai tab trinh duyet +
// ngay sau moi thao tac (goi reload()).

export interface ViecRow {
  key: string;
  tab: "cho-duyet" | "cap-phat" | "ban-giao" | "khac";
  loai: string;
  loai_phieu: "chuyen_kho" | "giao_nhan" | "xu_ly" | "tai_san" | "kiem_ke";
  id: string;
  ma_phieu: string | null;
  noi_dung: string;
  don_vi_nguoi_tao: string;
  thoi_gian: string;
  trang_thai: string;
  qua_han: boolean;
  hanh_dong:
    | "ke_toan_duyet_ck"
    | "ke_toan_duyet_gn"
    | "ke_toan_duyet_xl"
    | "nhan_kho"
    | "xac_nhan_gn"
    | "xac_nhan_cp"
    | "hoan_tat_xl"
    | "xu_ly_hong"
    | "mo_kiem_ke"
    | "xem_ck"
    | "xem_xl";
  so_luong?: number;
}

export interface ViecCanLam {
  cap_nhat_luc: string;
  rows: ViecRow[];
  tabs: Record<"tat-ca" | "cho-duyet" | "cap-phat" | "ban-giao" | "khac", number>;
  qua_han: number;
  menu_badges: Record<string, number>;
}

interface DuLieuChung {
  viec: ViecCanLam | null;
  loi: boolean;
  badges: Record<string, number>;
  reload: () => Promise<void>;
}

const Ctx = createContext<DuLieuChung | null>(null);

export function DuLieuChungProvider({ children }: { children: ReactNode }) {
  const [viec, setViec] = useState<ViecCanLam | null>(null);
  const [loi, setLoi] = useState(false);
  const dangTai = useRef(false);

  const reload = useCallback(async () => {
    if (dangTai.current) return;
    dangTai.current = true;
    try {
      setViec(await api.get<ViecCanLam>("/dashboard/viec-can-lam"));
      setLoi(false);
    } catch {
      setLoi(true);
    } finally {
      dangTai.current = false;
    }
  }, []);

  useEffect(() => {
    reload();
    // 2026-11-06: chi tu tai lai khi tab dang hien - tab an/de qua dem van goi moi 60s (~230M rows read/ngay tren D1).
    // Quay lai tab -> onVis tai ngay.
    const t = window.setInterval(() => document.visibilityState === "visible" && reload(), 60_000);
    const onVis = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [reload]);

  return <Ctx.Provider value={{ viec, loi, badges: viec?.menu_badges ?? {}, reload }}>{children}</Ctx.Provider>;
}

export function useDuLieuChung() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDuLieuChung phai dung trong DuLieuChungProvider");
  return ctx;
}
