import { useAuth } from "../contexts/AuthContext.jsx";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children, requiredRole }) {
  const { currentUser, authLoading } = useAuth();

  if (authLoading) return null;

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  const userRole = currentUser.permission?.toLowerCase(); // 🔥 FIXED
  const neededRole = requiredRole?.toLowerCase();

  if (neededRole && userRole !== neededRole) {
    if (userRole !== "admin") {
      return <Navigate to="/" replace />;
    }
  }

  return children;
}
