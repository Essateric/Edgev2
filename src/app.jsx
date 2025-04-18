import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard";
import CalendarPage from "./pages/CalendarPage.jsx";
import ManageClients from "./pages/ManageClients.jsx";
import ManageServices from "./pages/ManageServices.jsx";
import ManageStaff from "./pages/ManageStaff.jsx";
import Settings from "./pages/Settings.jsx"; // ← include this if you're using it
import StaffLayout from "./layouts/StaffLayout.jsx";
import { Toaster } from "react-hot-toast";

function App() {
  const { currentUser } = useAuth();

  return (
    <Toaster position="top-right" reverseOrder={false} />,
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
          <Route path="/dashboard" element={<Dashboard />} />
            <Route index element={<CalendarPage />} />
            <Route path="manage-clients" element={<ManageClients />} />
            <Route path="staff" element={<ManageStaff />} />
            <Route path="manage-services" element={<ManageServices />} />
            <Route path="settings" element={<Settings />} />

            {/* Only catch unmatched paths inside layout */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </>
      )}
    </Routes>
  );
}

export default App;
