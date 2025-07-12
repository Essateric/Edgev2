// main.jsx or index.jsx

import React from "react";
import ReactDOM from "react-dom/client";
import App from "../App.jsx";
import "./index.css";

import { BrowserRouter } from "react-router-dom";

import { AuthProvider } from "./contexts/AuthContext.jsx";
import { BookingProvider } from "./contexts/BookingContext.jsx";

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
