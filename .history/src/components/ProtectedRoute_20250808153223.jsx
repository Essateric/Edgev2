import { useAuth } from "../contexts/AuthContext.jsx";
import { Navigate } from "react-router-dom";

/**
 * Wraps content to restrict access by auth and (optionally) by role.
 * @param {React.ReactNode} children - The page to protect
 * @param {string} [requiredRole] - Optional role required for access
 */
export default function ProtectedRoute({ children, requiredRole }) {
  const { currentUser, authLoading } = useAuth(); // ✅ use currentUser

  // While loading, show nothing (or a spinner)
  if (authLoading) return null;

  // Not logged in? Redirect to login
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // Role check (optional)
  const userRole = currentUser.permission?.toLowerCase();
  const neededRole = requiredRole?.toLowerCase();

  if (neededRole && userRole !== neededRole) {
    // Allow admin to see everything
    if (userRole !== "admin") {
      return <Navigate to="/" replace />;
    }
  }

  return children;
}
