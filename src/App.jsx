// App.jsx (top)
import PublicBookingPage from "./onlinebookings/PublicBookingPage.jsx";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
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
  if (pageLoading || authLoading) return <PageLoader />;

  return (
    <>
      <Toaster position="top-right" reverseOrder={false} />

      <Routes>
        {/* ✅ Public routes (accessible with or without login) */}
        <Route path="/book" element={<PublicBookingPage />} />
        <Route path="/onlinebookings" element={<PublicBookingPage />} />

        {/* 🔒 Auth-gated routes */}
        {!currentUser ? (
          <>
            <Route path="/login" element={<Login />} />
            <Route path="/set-pin" element={<SetPin />} />
            {/* keep this catch-all AFTER the public routes */}
            <Route path="*" element={<Login />} />
          </>
        ) : (
          <>
            {/* Put staff layout ONLY around private pages */}
            <Route element={<StaffLayout />}>
              <Route path="/" element={<CalendarPage />} />
              <Route path="/dashboard" element={<Dashboard />} />

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
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </>
        )}
      </Routes>
    </>
  );
}


export default App;
