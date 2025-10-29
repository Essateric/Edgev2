// main.jsx or index.jsx

console.log('ENV URL =', import.meta.env.VITE_SUPABASE_URL);
console.log('ENV KEY =', Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY) ? 'HAS_KEY' : 'MISSING');
initAuthAudit()

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// ⬇️ New imports from react-router-dom
import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
} from "react-router-dom";

import { AuthProvider } from "./contexts/AuthContext.jsx";
import { BookingProvider } from "./contexts/BookingContext.jsx";

// 🔐 auth audit init (client-side logging of sign-in/out)
import { initAuthAudit } from "./auth/initAuthAudit.jsx";

// --- optional dev hook (unchanged) ---
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

// ✅ Router that delegates everything to your current <App />
// Your <App /> can continue to render <Routes> and your existing pages.
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/*" element={<App />} />
  )
);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* Keep providers exactly as before */}
    <AuthProvider>
      <BookingProvider>
        <RouterProvider
          router={router}
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        />
      </BookingProvider>
    </AuthProvider>
  </React.StrictMode>
);
