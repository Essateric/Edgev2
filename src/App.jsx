// src/App.jsx
import PublicBookingPage from "./onlinebookings/PublicBookingPage.jsx";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext.jsx";
import Login from "./pages/Login.jsx";
import AuditLogs from "./pages/AuditLogs.jsx";
import CalendarPage from "./pages/CalendarPage.jsx";
import ManageClients from "./pages/ManageClients.jsx";
import ManageServices from "./pages/ManageServices.jsx";
import ManageStaff from "./pages/ManageStaff.jsx";
import Settings from "./pages/Settings.jsx";
import StaffLayout from "./layouts/StaffLayout.jsx";
import { Toaster } from "react-hot-toast";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import SetPin from "./pages/SetPin.jsx";
import PageLoader from "./components/PageLoader.jsx";

function App() {
  const { currentUser, pageLoading, authLoading } = useAuth();
  const location = useLocation();

  const path = location.pathname;

  // ✅ Public routes should never be blocked by auth restore (support trailing slash/query)
  const isPublicRoute =
    path.startsWith("/book") || path.startsWith("/onlinebookings");

  // ✅ Treat "/" as part of the login flow when logged out
  // (because your unauth catch-all was rendering <Login /> at "/")
  const isAuthRoute =
    path === "/login" || path === "/set-pin" || (!currentUser && path === "/");

  const shouldBlock =
    pageLoading || (authLoading && !currentUser && !isAuthRoute && !isPublicRoute);

  console.log("[APPDBG]", {
    pageLoading,
    authLoading,
    currentUser,
    path,
    isAuthRoute,
    isPublicRoute,
    shouldBlock,
  });

  if (shouldBlock) {
    return (
      <div className="p-6">
        <PageLoader />
        <pre className="mt-4 p-3 bg-gray-100 text-xs rounded">
          {JSON.stringify(
            { pageLoading, authLoading, hasUser: !!currentUser, path },
            null,
            2
          )}
        </pre>
      </div>
    );
  }

    // If already authenticated and on an auth-only route, send to calendar
  if (currentUser && isAuthRoute && !isPublicRoute) {
    return <Navigate to="/calendar" replace />;
  }

  return (
    <>
      <Toaster position="top-right" reverseOrder={false} />

      <Routes>
         {/* Always send base path to PIN/login so landing on the root shows the keypad */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        {/* ✅ Public routes */}
        <Route path="/book" element={<PublicBookingPage />} />
        <Route path="/onlinebookings" element={<PublicBookingPage />} />

        {/* 🔒 Auth-gated routes */}
        {!currentUser ? (
          <>
              <Route path="/login" element={<Login />} />
            <Route path="/set-pin" element={<SetPin />} />

            {/* keep this catch-all AFTER the public routes */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        ) : (
          <>
            <Route element={<StaffLayout />}>
             {/* Send root to calendar when already authenticated */}
              <Route path="/" element={<Navigate to="/calendar" replace />} />
              <Route path="/audit" element={<AuditLogs />} />
              <Route path="/dashboard" element={<Navigate to="/audit" replace />} />
              
              <Route path="/calendar" element={<CalendarPage />} />

              <Route
                path="/manage-clients"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <ManageClients />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <ManageStaff />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/manage-services"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <ManageServices />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <Settings />
                  </ProtectedRoute>
                }
              />
           <Route path="*" element={<Navigate to="/calendar" replace />} />
            </Route>
          </>
        )}
      </Routes>
    </>
  );
}

export default App;
