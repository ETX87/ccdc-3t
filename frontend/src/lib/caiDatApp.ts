import { useEffect, useState } from "react";

// Cai dat app vao man hinh chinh (PWA, 2026-09-30 - port tu linh-kien-app hooks/usePwaInstall.ts).
// `beforeinstallprompt` chi ban 1 LAN cho ca vong doi tab (Android/desktop Chrome, Edge) -> phai bat
// o cap module truoc khi component nao mount. iOS Safari khong co API tu cai -> hien huong dan tay.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let hoanPrompt: BeforeInstallPromptEvent | null = null;
let ngheDs: Array<(v: boolean) => void> = [];

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    hoanPrompt = e as BeforeInstallPromptEvent;
    ngheDs.forEach((l) => l(true));
  });
  window.addEventListener("appinstalled", () => {
    hoanPrompt = null;
    ngheDs.forEach((l) => l(false));
  });
  // Chi dang ky service worker o ban build (vite dev khong can, tranh cache lan HMR).
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => undefined));
  }
}

export function dangChayNhuApp(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function laIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function useCaiDatApp() {
  const [coPrompt, setCoPrompt] = useState(!!hoanPrompt);

  useEffect(() => {
    ngheDs.push(setCoPrompt);
    return () => {
      ngheDs = ngheDs.filter((l) => l !== setCoPrompt);
    };
  }, []);

  async function caiDat(): Promise<"accepted" | "dismissed" | "unavailable"> {
    if (!hoanPrompt) return "unavailable";
    const p = hoanPrompt;
    hoanPrompt = null;
    setCoPrompt(false);
    await p.prompt();
    return (await p.userChoice).outcome;
  }

  return { coPrompt, caiDat };
}
