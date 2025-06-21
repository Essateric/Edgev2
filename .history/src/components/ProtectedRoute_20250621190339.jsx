// src/components/ProtectedRoute.jsx

import { useAuth } from "../contexts/AuthContext"; // Adjust path if needed!
import { Navigate } from "react-router-dom";

/**
 * Wrap pages to block unauthenticated users and (optionally) restrict by role.
 * 
 * @param {ReactNode} children - Content to protect
 * @param {string} [requiredRole] - Role required to access (optional)
 */
export default function ProtectedRoute({ children, requiredRole }) {
  const { currentUser, authLoading } = useAuth();

  // Show nothing (or a spinner) while auth status is loading
  if (authLoading) return null;

  // Not logged in? Redirect to login
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // If a requiredRole is specified, block if user doesn't match
  if (requiredRole && currentUser.role !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  // Otherwise, render children
  return children;
}
