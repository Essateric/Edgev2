import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard";
import CalendarPage from "./pages/CalendarPage.jsx";
import ManageClients from "./pages/ManageClients.jsx";
import ManageServices from "./pages/ManageServices.jsx";
import ManageStaff from "./pages/ManageStaff.jsx";
import Settings from "./pages/Settings.jsx";
import StaffLayout from "./layouts/StaffLayout.jsx";
import { Toaster } from "react-hot-toast";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import SetPin from "./pages/SetPin.jsx";
import PageLoader from "./components/PageLoader";


function App() {
  const { currentUser, pageLoading, authLoading } = useAuth();

  console.log("Current User:", currentUser);
  console.log("Role:", currentUser?.permission);

  // 🔥 Global loader during page or auth loading
  if (pageLoading || authLoading) {
    return <PageLoader />;
  }

  return (
    <>
      <Toaster position="top-right" reverseOrder={false} />

      <Routes>
        {!currentUser ? (
          <>
            {/* Not logged in: go to login page */}
            <Route path="*" element={<Login />} />
            <Route path="/login" element={<Login />} />
            <Route path="/set-pin" element={<SetPin />} />
          </>
        ) : (
          <>
            <Route element={<StaffLayout />}>
              {/* Pages all staff can see */}
              <Route path="/" element={<CalendarPage />} />
              <Route path="/dashboard" element={<Dashboard />} />

              {/* 🔐 Admin-only pages */}
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

              {/* Catch all unmatched paths */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </>
        )}
      </Routes>
    </>
  );
}

export default App;
