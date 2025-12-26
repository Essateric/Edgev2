const PENDING_KEY = "pending_audit_events_v1";

function readPending() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
  } catch {
    return [];
  }
}

function writePending(list) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-100))); // keep last 100
}

export function queueAuditEvent(event) {
  const list = readPending();
  list.push(event);
  writePending(list);
}

export async function flushQueuedAuditEvents(supabase) {
  const list = readPending();
  if (!list.length) return;

  const { error } = await supabase.from("audit_events").insert(list);
  if (!error) localStorage.removeItem(PENDING_KEY);
}
