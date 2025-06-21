// src/components/ProtectedRoute.jsx
// import { useAuth } from "../contexts/AuthContext.jsx";
// import { Navigate } from "react-router-dom";

// export default function ProtectedRoute({ children, requiredRole }) {
//   const { currentUser } = useAuth();

//   if (!currentUser) {
//     return <Navigate to="/login" replace />;
//   }

//   if (requiredRole && currentUser.role !== requiredRole) {
//     return <Navigate to="/" replace />;
//   }

//   return children;
// }

import { useAuth } from "./contexts/AuthContext";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }) {
  const { currentUser, authLoading } = useAuth();
  if (authLoading) return null; // Or a spinner
  if (!currentUser) return <Navigate to="/login" />;
  return children;
}
