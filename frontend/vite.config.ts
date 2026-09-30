import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Port RIENG voi cac app khac trong he QLBH 3T (dvbh 5173/8787, linh-kien-app 5174/8788,
// gui-bao-hanh-linh-kien 5175/8789, vi-pham-app 5176/8790) - dung 5177/8791.
export default defineConfig(({ mode }) => {
  // Cong worker cho proxy /api: mac dinh 8791 (npm run dev:worker); doi qua bien moi truong
  // CCDC_API_PORT hoac file frontend/.env.development.local (khong commit) khi chay worker cong khac.
  const apiPort = process.env.CCDC_API_PORT ?? loadEnv(mode, process.cwd(), "").CCDC_API_PORT ?? "8791";
  return {
    plugins: [react()],
    server: {
      port: 5177,
      proxy: {
        "/api": {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: "dist",
    },
  };
});
