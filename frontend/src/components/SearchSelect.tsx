import { useMemo, useState } from "react";

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
}: {
  options: SearchSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 30);
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)).slice(0, 30);
  }, [options, query]);

  const selected = options.find((o) => o.value === value);

  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        placeholder={placeholder ?? "Tìm kiếm..."}
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
            maxHeight: 220,
            overflow: "auto",
            zIndex: 10,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
        >
          {filtered.length === 0 && <div style={{ padding: 8, fontSize: 13, color: "#8393ac" }}>Không tìm thấy</div>}
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
        </div>
      )}
    </div>
  );
}
