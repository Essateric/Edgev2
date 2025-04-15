import React from 'react';
import { Routes, Route, Navigate } from "react-router-dom"; // ✅ Make sure this is here
import CalendarPage from "./pages/CalendarPage.jsx";

import Login from './pages/Login.jsx';
import ManageStaff from './pages/ManageStaff.jsx';
import ManageServices from './pages/ManageServices.jsx';
import ManageCustomers from './pages/ManageCustomers.jsx';
import { useAuth } from './contexts/AuthContext.jsx';

function App() {
  const { currentUser } = useAuth();

  return (
    <Routes>
      {!currentUser ? (
        <Route path="*" element={<Login />} />
      ) : (
        <>
          <Route path="/" element={<CalendarPage />} />
          <Route path="/manage-staff" element={<ManageStaff />} />
          <Route path="/manage-services" element={<ManageServices />} />
          <Route path="/manage-customers" element={<ManageCustomers />} />
          <Route path="*" element={<Navigate to="/" />} />
        </>
      )}
    </Routes>
  );
}

export default App;
