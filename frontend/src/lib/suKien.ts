import { useEffect } from "react";

// Kenh bao "du lieu vua thay doi" giua cac thanh phan doc lap (popup chi tiet duyet/nhan phieu ->
// man hinh dang mo tai lai danh sach, so do menu cap nhat).
const TEN = "ccdc:du-lieu-thay-doi";

export function baoThayDoi() {
  window.dispatchEvent(new Event(TEN));
}

export function useKhiThayDoi(cb: () => void) {
  useEffect(() => {
    window.addEventListener(TEN, cb);
    return () => window.removeEventListener(TEN, cb);
  }, [cb]);
}
