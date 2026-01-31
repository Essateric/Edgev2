// src/lib/scheduleBlockLocks.js
import { logEvent } from "./logEvent";

const SCHEDULE_BLOCK_SELECT = "*, schedule_task_types ( id, name, category, color )";

export async function setScheduleBlockLock({ supabase, ids, isLocked, reason }) {
  if (!supabase) throw new Error("Supabase client required");

  const normalizedIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (!normalizedIds.length) throw new Error("Missing schedule block ids");

  const rpcPayload = {
    p_ids: normalizedIds,
    p_is_locked: !!isLocked,
    p_reason: reason || null,
  };

  let lockErr = null;
  let lockedRows = null;

  const primaryRpc = await supabase.rpc("set_schedule_blocks_lock", rpcPayload);
  lockErr = primaryRpc.error;
  lockedRows = primaryRpc.data;

  if (lockErr && /set_schedule_blocks_lock/i.test(lockErr.message || "")) {
    const fallbackRpc = await supabase.rpc("set_schedule_block_lock", rpcPayload);
    lockErr = fallbackRpc.error;
    lockedRows = fallbackRpc.data;
  }

  if (lockErr) throw lockErr;

  let rows = Array.isArray(lockedRows) && lockedRows.length ? lockedRows : null;

  if (!rows) {
    const { data: refreshed, error: refreshErr } = await supabase
      .from("schedule_blocks")
      .select(SCHEDULE_BLOCK_SELECT)
      .in("id", normalizedIds);

    if (refreshErr) throw refreshErr;
    rows = refreshed || [];
  }

  const action = isLocked ? "schedule_block_locked" : "schedule_block_unlocked";
  try {
    await logEvent({
      entityType: "schedule_block",
      entityId: normalizedIds[0] || null,
      action,
      reason: reason || null,
      details: {
        ids: normalizedIds,
        is_locked: !!isLocked,
      },
      source: "app",
      supabaseClient: supabase,
    });
  } catch (err) {
    console.warn("[Audit] schedule block lock log failed", err?.message || err);
  }

  return rows;
}