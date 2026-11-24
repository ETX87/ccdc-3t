import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./auth/AuthContext";
import { App } from "./App";
import "./styles.css";
import { CuaSoThongTin } from "./components/CuaSoThongTin";
import "./lib/caiDatApp"; // bat som beforeinstallprompt + dang ky service worker (PWA)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
      <CuaSoThongTin />
    </AuthProvider>
  </StrictMode>,
);
