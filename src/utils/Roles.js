// src/utils/roles.js
export const roleRank = { staff: 1, manager: 2, admin: 3 };
export const hasAtLeastRole = (userRole, required) =>
  (roleRank[userRole?.toLowerCase()] ?? 0) >= (roleRank[required?.toLowerCase()] ?? 0);
