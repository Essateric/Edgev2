export const normalizeRole = (role) =>
  String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " "); // supports "senior_stylist" / "senior-stylist" too

export const hasAnyRole = (user, allowedRoles = []) => {
  const userRole = normalizeRole(user?.permission);
  const allowed = allowedRoles.map(normalizeRole);
  return allowed.includes(userRole);
};
