import { useEffect, useRef, useState } from "react";
import { QrCode } from "lucide-react";
import { Modal } from "./Modal";
import { useChiTiet } from "./ChiTiet";

// Quet tem QR tai san (tem in tu "In tem QR" chua dung ma tai san). Camera sau qua getUserMedia (can
// HTTPS - workers.dev OK, localhost OK). Giai ma: BarcodeDetector (Chrome/Android/Edge) -> fallback jsQR
// (iOS Safari, Firefox). Luon co o nhap ma tay (khong co camera / tem mo).

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/** Tem cua app chi chua ma TS; chap nhan them URL co ?ma=/id cuoi duong dan (tem in tu he thong khac). */
function layMa(raw: string): string {
  const t = raw.trim();
  try {
    const u = new URL(t);
    return u.searchParams.get("ma") ?? u.searchParams.get("id") ?? decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? t);
  } catch {
    return t;
  }
}

export function QrScannerModal({ onClose, onResult }: { onClose: () => void; onResult: (ma: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangQuet, setDangQuet] = useState(false);
  const [maTay, setMaTay] = useState("");
  const xong = useRef(false);
  const cbRef = useRef(onResult);
  cbRef.current = onResult;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let huy = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    async function batDau() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setLoi("Trình duyệt không hỗ trợ camera - nhập mã tài sản bên dưới.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch (e) {
        const ten = (e as DOMException)?.name;
        setLoi(
          ten === "NotAllowedError"
            ? "Chưa cấp quyền camera - cho phép camera trong cài đặt trình duyệt, hoặc nhập mã bên dưới."
            : "Không mở được camera - nhập mã tài sản bên dưới.",
        );
        return;
      }
      if (huy) return stream.getTracks().forEach((t) => t.stop());
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      setDangQuet(true);

      const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      let detector: Detector | null = null;
      if (BD) {
        try {
          detector = new BD({ formats: ["qr_code"] });
        } catch {
          detector = null;
        }
      }
      const jsQR = detector ? null : (await import("jsqr")).default;

      const vong = async () => {
        if (huy || xong.current) return;
        if (video.readyState >= 2 && video.videoWidth) {
          let giaTri: string | null = null;
          if (detector) {
            const kq = await detector.detect(video).catch(() => []);
            giaTri = kq[0]?.rawValue ?? null;
          } else if (jsQR && ctx) {
            const w = Math.min(video.videoWidth, 640);
            const h = Math.round((video.videoHeight * w) / video.videoWidth);
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(video, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            giaTri = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" })?.data ?? null;
          }
          if (giaTri) {
            xong.current = true;
            if ("vibrate" in navigator) navigator.vibrate(80);
            cbRef.current(layMa(giaTri));
            return;
          }
        }
        raf = requestAnimationFrame(vong);
      };
      raf = requestAnimationFrame(vong);
    }
    batDau();
    return () => {
      huy = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <Modal title="Quét mã QR tài sản" onClose={onClose}>
      <div className="qr-video-box">
        <video ref={videoRef} className="qr-video" playsInline muted />
        {dangQuet && <div className="qr-frame" aria-hidden="true" />}
        {!dangQuet && !loi && <div className="qr-video-note">Đang mở camera…</div>}
      </div>
      {loi && <div className="alert alert-warning" style={{ marginTop: 10 }}>{loi}</div>}
      {dangQuet && <p className="muted small" style={{ marginTop: 8 }}>Đưa tem QR vào giữa khung - hệ thống tự nhận.</p>}
      <form
        className="qr-manual"
        onSubmit={(e) => {
          e.preventDefault();
          if (maTay.trim()) onResult(layMa(maTay));
        }}
      >
        <input type="text" placeholder="Hoặc nhập mã tài sản (vd TS3T-000123)" value={maTay} onChange={(e) => setMaTay(e.target.value)} />
        <button type="submit" className="btn btn-primary" disabled={!maTay.trim()}>
          Mở
        </button>
      </form>
    </Modal>
  );
}

export function QrScanButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const { moTaiSan } = useChiTiet();
  return (
    <>
      <button type="button" className={compact ? "bottom-nav-item" : "btn-scan-qr"} onClick={() => setOpen(true)}>
        <QrCode size={compact ? 20 : 16} />
        <span>Quét QR</span>
      </button>
      {open && (
        <QrScannerModal
          onClose={() => setOpen(false)}
          onResult={(ma) => {
            setOpen(false);
            moTaiSan(ma);
          }}
        />
      )}
    </>
  );
}
