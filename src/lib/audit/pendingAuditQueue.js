// src/lib/audit/pendingAuditQueue.js
const PENDING_AUDIT_KEY = "pending_audit_events_v1";

function loadPending() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_AUDIT_KEY) || "[]");
  } catch {
    return [];
  }
}

function savePending(list, cap = 100) {
  localStorage.setItem(PENDING_AUDIT_KEY, JSON.stringify(list.slice(-cap)));
}

export function queueAuditEvent(event, cap = 100) {
  const list = loadPending();
  list.push(event);
  savePending(list, cap);
}

export async function flushQueuedAuditEvents(supabase) {
  const list = loadPending();
  if (!list.length) return;

  const { error } = await supabase.from("audit_events").insert(list);
  if (!error) localStorage.removeItem(PENDING_AUDIT_KEY);
}
