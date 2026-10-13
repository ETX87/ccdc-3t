import { t } from "../lib/i18n";
import { Children, isValidElement, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Search } from "lucide-react";

// O chon dung chung thay <select> (2026-10-13, user: "o lua chon > 5 muc phai co tim kiem nhanh").
// Viet y nhu <select>: <ChonLoc value onChange={(e) => set(e.target.value)}><option value="">…</option>…</ChonLoc>.
//   - <= 5 lua chon: render <select> goc (giu nguyen giao dien / ban phim di dong).
//   - > 5 lua chon: nut hien lua chon dang chon + bang noi (portal ra body - khong bi modal / bang cat) co o tim
//     kiem (khong dau, khong phan biet hoa thuong), phim len/xuong/Enter/Esc.
// Class / style / aria-label truyen vao ap len nut, CSS .chon-loc mo phong lai kieu select o tung ngu canh.

const NGUONG_TIM = 5;

interface LuaChon {
  value: string;
  label: string;
  disabled: boolean;
}

/** Bo dau tieng Viet + chu thuong - de go "ha noi" tim ra "Hà Nội". */
export function boDau(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .toLowerCase();
}

function chu(n: ReactNode): string {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(chu).join("");
  if (isValidElement<{ children?: ReactNode }>(n)) return chu(n.props.children);
  return "";
}

function docLuaChon(children: ReactNode, out: LuaChon[] = []): LuaChon[] {
  Children.forEach(children, (c) => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(c)) return;
    if (c.type === "option") {
      const label = chu(c.props.children);
      out.push({ value: c.props.value != null ? String(c.props.value) : label, label, disabled: !!c.props.disabled });
    } else if (c.props.children) docLuaChon(c.props.children, out);
  });
  return out;
}

export interface ChonLocProps {
  value?: string | number;
  onChange?: (e: { target: { value: string } }) => void;
  children?: ReactNode;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  title?: string;
  id?: string;
  required?: boolean;
  autoFocus?: boolean;
  "aria-label"?: string;
}

export function ChonLoc(props: ChonLocProps) {
  const { value, onChange, children, disabled, className, style, title, id, required, autoFocus } = props;
  const ds = useMemo(() => docLuaChon(children), [children]);
  if (ds.length <= NGUONG_TIM) {
    return (
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={className}
        style={style}
        title={title}
        id={id}
        required={required}
        autoFocus={autoFocus}
        aria-label={props["aria-label"]}
      >
        {children}
      </select>
    );
  }
  return <ChonCoTim {...props} ds={ds} />;
}

function ChonCoTim({ value, onChange, disabled, className, style, title, id, autoFocus, ds, ...rest }: ChonLocProps & { ds: LuaChon[] }) {
  const [mo, setMo] = useState(false);
  const [tim, setTim] = useState("");
  const [chiSo, setChiSo] = useState(0);
  const [viTri, setViTri] = useState<{ top: number; left: number; width: number; len: boolean } | null>(null);
  const nutRef = useRef<HTMLButtonElement>(null);
  const bangRef = useRef<HTMLDivElement>(null);
  const v = value == null ? "" : String(value);
  const dangChon = ds.find((o) => o.value === v);

  const loc = useMemo(() => {
    const q = boDau(tim.trim());
    return q ? ds.filter((o) => boDau(o.label).includes(q) || boDau(o.value).includes(q)) : ds;
  }, [ds, tim]);

  function tinhViTri() {
    const r = nutRef.current?.getBoundingClientRect();
    if (!r) return;
    const cao = Math.min(340, 52 + ds.length * 34);
    const len = r.bottom + cao > window.innerHeight - 8 && r.top > cao;
    setViTri({ top: len ? r.top - cao - 4 : r.bottom + 4, left: Math.min(r.left, window.innerWidth - Math.max(r.width, 240) - 8), width: Math.max(r.width, 240), len });
  }

  function moBang() {
    if (disabled) return;
    tinhViTri();
    setTim("");
    setChiSo(Math.max(0, ds.findIndex((o) => o.value === v)));
    setMo(true);
  }
  function dong(traFocus = true) {
    setMo(false);
    if (traFocus) nutRef.current?.focus();
  }
  function chon(o: LuaChon) {
    if (o.disabled) return;
    if (o.value !== v) onChange?.({ target: { value: o.value } });
    dong();
  }

  useLayoutEffect(() => {
    if (!mo) return;
    const ngoai = (e: MouseEvent) => {
      const n = e.target as Node;
      if (!bangRef.current?.contains(n) && !nutRef.current?.contains(n)) dong(false);
    };
    const cuon = (e: Event) => {
      if (!bangRef.current?.contains(e.target as Node)) tinhViTri();
    };
    document.addEventListener("mousedown", ngoai);
    window.addEventListener("scroll", cuon, true);
    window.addEventListener("resize", tinhViTri);
    return () => {
      document.removeEventListener("mousedown", ngoai);
      window.removeEventListener("scroll", cuon, true);
      window.removeEventListener("resize", tinhViTri);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mo]);

  useEffect(() => {
    if (mo) bangRef.current?.querySelector(`[data-i="${chiSo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [chiSo, mo]);

  function phim(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const buoc = e.key === "ArrowDown" ? 1 : -1;
      setChiSo((i) => Math.min(loc.length - 1, Math.max(0, i + buoc)));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (loc[chiSo]) chon(loc[chiSo]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      dong();
    } else if (e.key === "Tab") dong(false);
  }

  return (
    <>
      <button
        ref={nutRef}
        type="button"
        id={id}
        className={`chon-loc${className ? ` ${className}` : ""}${mo ? " chon-loc-mo" : ""}`}
        style={style}
        title={title ?? dangChon?.label}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={rest["aria-label"]}
        aria-haspopup="listbox"
        aria-expanded={mo}
        onClick={(e) => {
          e.preventDefault();
          if (mo) dong();
          else moBang();
        }}
        onKeyDown={(e) => {
          if (!mo && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            moBang();
          }
        }}
      >
        <span className="chon-loc-nhan">{dangChon?.label ?? ""}</span>
      </button>
      {mo &&
        viTri &&
        createPortal(
          <div ref={bangRef} className="chon-loc-bang" style={{ top: viTri.top, left: viTri.left, width: viTri.width }} role="listbox" onKeyDown={phim}>
            <div className="chon-loc-tim">
              <Search size={14} className="chon-loc-tim-icon" />
              <input
                autoFocus
                value={tim}
                onChange={(e) => {
                  setTim(e.target.value);
                  setChiSo(0);
                }}
                placeholder={t("Gõ để tìm nhanh…")}
                aria-label={t("Tìm trong danh sách")}
              />
              <span className="chon-loc-dem">{loc.length}</span>
            </div>
            <div className="chon-loc-ds">
              {loc.length === 0 && <div className="chon-loc-rong">{t("Không tìm thấy")}</div>}
              {loc.map((o, i) => (
                <div
                  key={`${o.value}-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={o.value === v}
                  className={`chon-loc-muc${i === chiSo ? " dang-tro" : ""}${o.value === v ? " da-chon" : ""}${o.disabled ? " vo-hieu" : ""}`}
                  onMouseEnter={() => setChiSo(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    chon(o);
                  }}
                >
                  <span>{o.label || " "}</span>
                  {o.value === v && <Check size={13} />}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
