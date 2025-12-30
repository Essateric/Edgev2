export const normalizeRole = (role) =>
  String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " "); // "senior_stylist" -> "senior stylist"

export const hasAnyRole = (user, allowedRoles = []) => {
  const userRole = normalizeRole(user?.permission);
  const allowed = allowedRoles.map(normalizeRole);
  return allowed.includes(userRole);
};

// ✅ Admin-equivalent roles (can do everything admin can)
export const ADMIN_LIKE_ROLES = ["admin", "senior stylist"];

export const isAdminLike = (user) => hasAnyRole(user, ADMIN_LIKE_ROLES);
