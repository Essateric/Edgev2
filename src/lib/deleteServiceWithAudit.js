// src/lib/deleteServiceWithAudit.js
import { isAdminLike } from "../utils/roleUtils";

/**
 * Deletes a service and writes an audit_events row.
 * - Intended for ADMIN only (UI check + RLS should enforce too).
 * - Uses ON DELETE CASCADE to remove staff_services rows.
 */

export async function confirmAndDeleteServiceWithAudit({
  supabase,
  service, // expects at least { id, name, category, base_price, base_duration }
  currentUser,
  staffId, // optional override (if you already pass it around)
  reason = "Deleted by admin or senior stylist in ManageServices",
}) {
  if (!supabase) throw new Error("Supabase client is required");
  if (!service?.id) throw new Error("Service is required");

  // Prompt
  const ok = window.confirm(
    `Delete "${service.name}"?\n\nThis will remove it from the list and also remove any stylist assignments linked to it.`
  );
  if (!ok) {
    const err = new Error("CANCELLED");
    err.code = "CANCELLED";
    throw err;
  }

  // Actor info
  const actorEmail = currentUser?.email || currentUser?.user?.email || null;
  const actorId = currentUser?.id || currentUser?.user?.id || null;
  const effectiveStaffId = staffId || actorId;

  // Load staff record (for permission + nicer audit fields)
  let me = null;
  if (effectiveStaffId) {
    const { data, error } = await supabase
      .from("staff")
      .select("id,name,permission,email")
      .eq("id", effectiveStaffId)
      .maybeSingle();

    if (error) {
      // not fatal, but we lose permission check + staff_name fields
      console.warn("[DeleteService] failed to load staff record:", error);
    } else {
      me = data || null;
    }
  }

  // Front-end permission guard (RLS must still enforce)
 const isAdmin = isAdminLike(me);
  if (me?.permission && !isAdmin) {
    throw new Error("Only admins and senior stylists can delete services.");
  }

  // Count assignments that will be cascade-deleted (optional, but useful in audit)
  let cascadeCount = null;
  try {
    const { count, error: countErr } = await supabase
      .from("staff_services")
      .select("id", { count: "exact", head: true })
      .eq("service_id", service.id);

    if (!countErr) cascadeCount = count ?? 0;
  } catch (e) {
    console.warn("[DeleteService] failed counting staff_services:", e);
  }

  // Delete the service
  const { error: delErr } = await supabase
    .from("services")
    .delete()
    .eq("id", service.id);

  if (delErr) {
    // If delete failed, do not audit (because nothing happened)
    throw delErr;
  }

  // Insert audit row (this is the missing bit)
  const auditPayload = {
    actor_id: actorId,
    actor_email: actorEmail,
    source: "app",
    entity_type: "service",
    entity_id: service.id,
    action: "service_deleted",
    reason,
    details: {
      service: {
        id: service.id,
        name: service.name,
        category: service.category,
        base_price: service.base_price,
        base_duration: service.base_duration,
      },
      cascade_deleted_staff_services_count: cascadeCount,
      note: "Deleted via ManageServices UI",
    },
    staff_id: me?.id || effectiveStaffId || actorId,
    staff_name: me?.name || null,
    staff_email: me?.email || actorEmail,
  };

  const { data: auditRow, error: auditErr } = await supabase
    .from("audit_events")
    .insert([auditPayload])
    .select("id")
    .maybeSingle();

  if (auditErr) {
    // Important: delete already happened — surface this so you notice it.
    console.warn("[Audit] insert failed:", auditErr);
    throw new Error(
      "Service deleted, but failed to write audit log. Check RLS/payload for audit_events."
    );
  }

  return {
    deletedServiceId: service.id,
    auditId: auditRow?.id || null,
    cascadeDeletedStaffServicesCount: cascadeCount,
  };
}
