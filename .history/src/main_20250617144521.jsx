// main.jsx or index.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app.jsx";
import "./index.css";

import {
  BrowserRouter,
  RouterProvider,
} from "react-router-dom";

import { AuthProvider } from "./contexts/AuthContext.jsx";
import { BookingProvider } from "./contexts/BookingContext.jsx";

// Define routes
const routes = [
  {
    path: "*", // ← Allows nested routes to match deeper paths
    element: <App />,
  },
];

// Create router WITHOUT v7 future flags to silence warnings
const router = BrowserRouter(routes);

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
)