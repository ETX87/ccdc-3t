import { t } from "../lib/i18n";
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({
  title,
  onClose,
  children,
  size = "md",
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  size?: "md" | "lg" | "xl";
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-box ${size === "lg" ? "modal-lg" : size === "xl" ? "modal-xl" : ""}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t("Đóng")}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
