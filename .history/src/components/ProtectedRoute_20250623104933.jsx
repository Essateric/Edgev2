// src/components/ProtectedRoute.jsx

import { useAuth } from "../contexts/AuthProvider"; // use correct path
import { Navigate } from "react-router-dom";

/**
 * Wraps content to restrict access by auth and (optionally) by role.
 * @param {ReactNode} children - The page to protect
 * @param {string} [requiredRole] - Optional role required for access
 */
export default function ProtectedRoute({ children, requiredRole }) {
  const { currentUser, authLoading } = useAuth();

  // While loading, show nothing (or a spinner)
  if (authLoading) return null;

  // Not logged in at all (online or offline)? Redirect to login
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // Block if required role is set and user doesn't match
  if (requiredRole && currentUser.role !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  // Optionally, if you want to block certain actions for offline users, check:
  // if (currentUser.offline && restrictedForOffline) { ... }

  return children;
}
