import { t } from "../lib/i18n";
import { useMemo, useState, type ReactNode } from "react";
import { boDau } from "./ChonLoc";

export interface SearchSelectOption {
  value: string;
  label: string;
}

// Combobox tim-kiem don gian: go loc, chon 1 gia tri tu danh sach - dung cho chon nhan vien/CCDC
// thu cong (MVP khong co quet QR, xem ke hoach).
export function SearchSelect({
  options,
  value,
  onChange,
  placeholder,
  khiRong,
}: {
  options: SearchSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Noi dung them cuoi danh sach khi go >= 2 ky tu (vd goi y nhan vien o cong ty khac). */
  khiRong?: (query: string) => ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    // Khong phan biet dau: go "bui duy" ra "Bùi Duy ...".
    const q = boDau(query.trim());
    if (!q) return options.slice(0, 30);
    return options.filter((o) => boDau(o.label).includes(q) || boDau(o.value).includes(q)).slice(0, 30);
  }, [options, query]);

  const selected = options.find((o) => o.value === value);

  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        placeholder={placeholder ?? t("Tìm kiếm...")}
        value={open ? query : (selected?.label ?? "")}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            maxHeight: khiRong ? 320 : 220,
            overflow: "auto",
            zIndex: 10,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
        >
          {filtered.length === 0 && <div style={{ padding: 8, fontSize: 13, color: "#8393ac" }}>{t("Không tìm thấy")}</div>}
          {filtered.map((o) => (
            <div
              key={o.value}
              style={{ padding: "8px 10px", fontSize: 13, cursor: "pointer" }}
              onMouseDown={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </div>
          ))}
          {khiRong && query.trim().length >= 2 && khiRong(query)}
        </div>
      )}
    </div>
  );
}
