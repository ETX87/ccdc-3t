import { t } from "../lib/i18n";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Download } from "lucide-react";
import { Modal } from "./Modal";
import { dangChayNhuApp, laIos, useCaiDatApp } from "../lib/caiDatApp";

// Nut "Cai dat ung dung" o cuoi menu sidebar (tren dien thoai mo qua nut Menu cua thanh duoi). An khi
// dang chay nhu app da cai. Chrome/Edge: bam la hien hop thoai cai dat that; iOS hoac trinh duyet chua
// san sang prompt: hien huong dan them vao man hinh chinh thu cong. Modal render qua portal: nut nam
// trong sidebar - tren dien thoai sidebar la drawer co transform, position: fixed se bi bo trong drawer.
export function CaiDatAppButton({ onDone }: { onDone?: () => void }) {
  const { coPrompt, caiDat } = useCaiDatApp();
  const [huongDan, setHuongDan] = useState(false);

  if (dangChayNhuApp()) return null;

  async function bam() {
    if (coPrompt) {
      await caiDat();
      onDone?.();
    } else {
      setHuongDan(true);
    }
  }

  const ios = laIos();
  return (
    <>
      <button type="button" className="sidebar-nav-item" onClick={bam}>
        <div className="nav-item-left">
          <Download size={17} className="nav-icon" />
          <span className="nav-label">{t("Cài đặt ứng dụng")}</span>
        </div>
      </button>
      {huongDan &&
        createPortal(
          <Modal title={t("Cài đặt ứng dụng lên điện thoại")} onClose={() => setHuongDan(false)}>
            <div className="cai-dat-huong-dan">
              <p className="muted">{t("Sau khi cài, app mở toàn màn hình như ứng dụng thường, không còn thanh địa chỉ trình duyệt.")}</p>
              <div className={`cai-dat-buoc ${ios ? "active" : ""}`}>
                <div className="strong">iPhone / iPad (Safari)</div>
                <div>{t("1. Bấm nút Chia sẻ (ô vuông có mũi tên lên) ở thanh trình duyệt.")}</div>
                <div>{t("2. Chọn “Thêm vào MH chính” (Add to Home Screen) → Thêm.")}</div>
              </div>
              <div className={`cai-dat-buoc ${!ios ? "active" : ""}`}>
                <div className="strong">{t("Android (Chrome) / máy tính")}</div>
                <div>{t("1. Bấm menu ⋮ ở góc trên bên phải trình duyệt.")}</div>
                <div>{t("2. Chọn “Cài đặt ứng dụng” hoặc “Thêm vào màn hình chính”.")}</div>
              </div>
            </div>
          </Modal>,
          document.body,
        )}
    </>
  );
}
