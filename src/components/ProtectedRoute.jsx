import { useAuth } from "../contexts/AuthContext.jsx";
import { Navigate } from "react-router-dom";
import { hasAnyRole } from "../utils/roleUtils";

/**
 * Wraps content to restrict access by auth and role(s).
 * @param {React.ReactNode} children
 * @param {string} [requiredRole] - single role (backwards compatible)
 * @param {string[]} [requiredRoles] - multiple allowed roles (any-of)
 */
export default function ProtectedRoute({ children, requiredRole, requiredRoles }) {
  const { currentUser, authLoading } = useAuth();

  if (authLoading) return null;

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // Admin can see everything
  const userRole = String(currentUser.permission || "").trim().toLowerCase();
  if (userRole === "admin") return children;

  // If requiredRoles provided, allow any of them
  if (Array.isArray(requiredRoles) && requiredRoles.length) {
    const ok = hasAnyRole(currentUser, requiredRoles);
    if (!ok) return <Navigate to="/" replace />;
    return children;
  }

  // Backwards compatible: single requiredRole
  if (requiredRole) {
    const ok = hasAnyRole(currentUser, [requiredRole]);
    if (!ok) return <Navigate to="/" replace />;
  }

  return children;
}
