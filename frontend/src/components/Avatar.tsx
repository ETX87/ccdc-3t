import { useState } from "react";

// Anh Google cua nguoi dung (luu luc dang nhap); khong co / loi tai -> chu cai dau tren nen teal.
export function Avatar({ ten, anh, size = 38 }: { ten: string; anh?: string | null; size?: number }) {
  const [loi, setLoi] = useState(false);
  const chu = ten
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  if (anh && !loi) {
    return (
      <img
        src={anh}
        alt={ten}
        className="user-avatar-img"
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
        onError={() => setLoi(true)}
      />
    );
  }
  return (
    <span className="avatar-chu" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-label={ten}>
      {chu || "?"}
    </span>
  );
}
