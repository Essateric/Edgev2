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
import ProtectedRoute from "./components/ProtectedRoute.jsx"; // Make sure you have this file
import SetPin from "./pages/SetPin.jsx";


function App() {
  const { currentUser } = useAuth();

  return (
    <>
      <Toaster position="top-right" reverseOrder={false} />
      <Routes>
        {!currentUser ? (
          <>
            {/* Not logged in: go to login page */}
            <Route path="*" element={<Login />} />
          </>
        ) : (
          <>
            {/* Logged in: use StaffLayout wrapper */}
            <Route element={<StaffLayout />}>
              {/* Calendar and Dashboard are visible to ALL STAFF */}
              <Route path="/" element={<CalendarPage />} />
              <Route path="/dashboard" element={<Dashboard />} />
   <Route path="/login" element={<Login />} />
        <Route path="/set-pin" element={<SetPin />} />


              {/* Only Admin can see these pages */}
              <Route path="/manage-clients" element={
                <ProtectedRoute requiredRole="Admin">
                  <ManageClients />
                </ProtectedRoute>
              } />
              
              <Route path="/staff" element={
                <ProtectedRoute requiredRole="Admin">
                  <ManageStaff />
                </ProtectedRoute>
              } />
              
              <Route path="/manage-services" element={
                <ProtectedRoute requiredRole="Admin">
                  <ManageServices />
                </ProtectedRoute>
              } />
              
              <Route path="/settings" element={
                <ProtectedRoute requiredRole="Admin">
                  <Settings />
                </ProtectedRoute>
              } />

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
