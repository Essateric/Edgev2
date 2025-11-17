// src/main.jsx (or index.jsx)

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App.jsx";
import "./index.css";

import { AuthProvider } from "./contexts/AuthContext.jsx";
import { BookingProvider } from "./contexts/BookingContext.jsx";
import { initAuthAudit } from "./auth/initAuthAudit.jsx";

// Dev logs
console.log("ENV URL =", import.meta.env.VITE_SUPABASE_URL);
console.log(
  "ENV KEY =",
  Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY) ? "HAS_KEY" : "MISSING"
);

// OPTIONAL: request tracing hook (unchanged)
if (import.meta.env.DEV) {
  (function () {
    const _fetch = window.fetch;
    window.fetch = function (input, init) {
      const url = typeof input === "string" ? input : input?.url;
      if (url?.includes("/rest/v1/staff") && url.includes("auth_id=")) {
        console.warn("[TRACE] staff.auth_id query:", url);
        console.warn(new Error("who-called-auth_id").stack);
      }
      return _fetch.call(this, input, init);
    };
  })();
}

// ✅ Call once at startup (guard against HMR/StrictMode double init)
if (!window.__authAuditInit) {
  window.__authAuditInit = true;
  initAuthAudit();
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* ✅ Router OUTSIDE, providers INSIDE → useNavigate works in AuthContext */}
    <BrowserRouter>
      <AuthProvider>
        <BookingProvider>
          <App />
        </BookingProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
