import { EN } from "./i18n/en";
import { ID } from "./i18n/id";

// Da ngon ngu VI / EN / ID (Indonesia). Khoa = chuoi tieng Viet goc (kieu gettext): t("Tổng quan").
// Thieu ban dich -> hien tieng Viet. Chuoi tieng Viet do server tra ve (loai viec, trang thai...) cung di qua
// t() -> cung tu dien. Doi ngon ngu = luu localStorage + TAI LAI TRANG, nen goi t() o cap module (hang so
// nhan) van dung ngon ngu (module nay khong phu thuoc gi -> luon duoc nap truoc moi module goi t()).
// Kiem tra chuoi thieu ban dich: python scripts/i18n_kiem_tra.py
export type Lang = "vi" | "en" | "id";

export const LANGS: { code: Lang; label: string; ten: string }[] = [
  { code: "vi", label: "VI", ten: "Tiếng Việt" },
  { code: "en", label: "EN", ten: "English" },
  { code: "id", label: "ID", ten: "Bahasa Indonesia" },
];

const KEY = "ccdc_lang";

function docLang(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "vi" || v === "en" || v === "id") return v;
  } catch {
    /* private mode */
  }
  return "vi";
}

export const lang: Lang = docLang();
const DICT: Record<string, string> = lang === "en" ? EN : lang === "id" ? ID : {};

if (typeof document !== "undefined") document.documentElement.lang = lang;

export function setLang(l: Lang) {
  if (l === lang) return;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* bo qua */
  }
  window.location.reload();
}

/** Dich 1 chuoi tieng Viet; {ten} trong chuoi duoc thay bang params.ten. */
export function t(vi: string, params?: Record<string, string | number | null | undefined>): string {
  let s = (vi && DICT[vi]) || vi;
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (params[k] == null ? m : String(params[k])));
  return s;
}

// Mau co tham so ({n}, {ten}...) cua chuoi server (lib/i18n/server.ts) -> regex, de dich chuoi server da dien so.
let MAU: { re: RegExp; ten: string[]; vi: string }[] | null = null;
function mau() {
  if (!MAU) {
    MAU = Object.keys(DICT)
      .filter((k) => k.includes("{"))
      .map((vi) => {
        const ten: string[] = [];
        const re = new RegExp(
          "^" + vi.split(/(\{\w+\})/).map((p) => (/^\{\w+\}$/.test(p) ? (ten.push(p.slice(1, -1)), "(.+?)") : p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("") + "$",
          "s",
        );
        return { re, ten, vi };
      });
  }
  return MAU;
}

/** Dich chuoi tieng Viet do SERVER tra ve: khop nguyen van, hoac khop mau co tham so. Null/rong -> giu nguyen. */
export function tS(s: string | null | undefined): string {
  if (!s || lang === "vi") return s ?? "";
  if (DICT[s]) return DICT[s];
  for (const m of mau()) {
    const k = m.re.exec(s);
    // Tham so cung co the la chuoi server (vd "{loai} bị từ chối" voi loai = "Báo hỏng") -> dich tiep.
    if (k) return t(m.vi, Object.fromEntries(m.ten.map((n, i) => [n, tS(k[i + 1])])));
  }
  return s;
}

/** Locale cho Intl (dinh dang so, ngay). */
export const LOCALE = lang === "en" ? "en-US" : lang === "id" ? "id-ID" : "vi-VN";

/** Chuoi goc tieng Viet + moi ban dich (vd nhan dien tieu de cot file Excel do nguoi dung o ngon ngu khac tao). */
export function moiNgonNgu(vi: string): string[] {
  return [vi, EN[vi], ID[vi]].filter((x): x is string => !!x);
}
