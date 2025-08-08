import { useAuth } from "../contexts/AuthContext.jsx";
import { Navigate } from "react-router-dom";

/**
 * Wraps content to restrict access by auth and (optionally) by role.
 * @param {ReactNode} children - The page to protect
 * @param {string} [requiredRole] - Optional role required for access
 */
export default function ProtectedRoute({ children, requiredRole }) {
  const { session?.user, authLoading } = useAuth();

  // While loading, show nothing (or a spinner)
  if (authLoading) return null;

  // Not logged in at all (online or offline)? Redirect to login
  if (!session?.user) {
    return <Navigate to="/login" replace />;
  }

  const userRole = session?.user.permission?.toLowerCase(); // 🔥 Pulls from permission
  const neededRole = requiredRole?.toLowerCase(); // 🔥 Safer matching

  // Block if required role is set and user doesn't match
  if (neededRole && userRole !== neededRole) {
    // Allow 'admin' to access everything
    if (userRole !== "admin") {
      return <Navigate to="/" replace />;
    }
  }

  return children;
}
