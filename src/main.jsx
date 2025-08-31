// main.jsx or index.jsx

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

import { BrowserRouter } from "react-router-dom";

import { AuthProvider } from "./contexts/AuthContext.jsx";
import { BookingProvider } from "./contexts/BookingContext.jsx";

// main.jsx (optional permanent dev hook)
if (import.meta.env.DEV) {
  (function () {
    const _fetch = window.fetch;
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input?.url;
      if (url?.includes('/rest/v1/staff') && url.includes('auth_id=')) {
        console.warn('[TRACE] staff.auth_id query:', url);
        console.warn(new Error('who-called-auth_id').stack);
      }
      return _fetch.call(this, input, init);
    };
  })();
}


ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <BookingProvider>
          <App />
        </BookingProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
