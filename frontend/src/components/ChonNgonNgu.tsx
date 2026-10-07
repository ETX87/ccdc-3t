import { ChevronDown, Globe } from "lucide-react";
import { LANGS, lang, setLang, t, type Lang } from "../lib/i18n";

/** O chon ngon ngu VI / EN / ID - doi la tai lai trang (xem lib/i18n.ts). */
export function ChonNgonNgu({ className = "" }: { className?: string }) {
  return (
    <label className={`header-dropdown select-dropdown chon-ngon-ngu ${className}`} title={`${t("Ngôn ngữ")}: ${LANGS.find((l) => l.code === lang)?.ten}`}>
      <Globe size={14} className="dropdown-icon" />
      <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t("Ngôn ngữ")}>
        {LANGS.map((l) => (
          <option key={l.code} value={l.code} title={l.ten}>
            {l.label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} className="dropdown-arrow" />
    </label>
  );
}
