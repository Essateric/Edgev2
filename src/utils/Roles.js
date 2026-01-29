// src/utils/Roles.js

export const ROLE_RANK = {
  reception: 1,
  apprentice: 2,
  "junior stylist": 2, // alias
  stylist: 3,
  "colour specialist": 4,
  "senior stylist": 5,
  manager: 6,
  admin: 7,
  "business owner": 8,
};

export const normalizeRole = (v) =>
  String(v ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

export const getRoleRank = (role) => ROLE_RANK[normalizeRole(role)] ?? 0;

export const hasAtLeastRole = (userRole, required) =>
  getRoleRank(userRole) >= getRoleRank(required);

/** Create/assign role: allowed if target role is <= actor role */
export const canCreateRole = (actorRole, targetRole) => {
  const a = normalizeRole(actorRole);
  const t = normalizeRole(targetRole);

  const ar = getRoleRank(a);
  const tr = getRoleRank(t);
  if (!ar || !tr) return false;

  // special rule for colour specialist
  if (a === "colour specialist") {
    const allowed = new Set([
      "colour specialist",
      "junior stylist",
      "apprentice",
      "stylist",
      "reception",
    ]);
    return allowed.has(t);
  }

  return tr <= ar;
};

/** Manage (edit/deactivate/pin/etc): allowed if target is strictly below actor */
export const canManageRole = (actorRole, targetRole) => {
  const a = normalizeRole(actorRole);
  const t = normalizeRole(targetRole);

  const ar = getRoleRank(a);
  const tr = getRoleRank(t);
  if (!ar || !tr) return false;

  // colour specialist cannot manage above (strictly below only)
  if (a === "colour specialist") {
    const allowed = new Set(["junior stylist", "apprentice", "stylist", "reception"]);
    return allowed.has(t);
  }

  return tr < ar;
};
