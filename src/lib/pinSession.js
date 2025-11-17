// src/lib/pinSession.js
import supabase from "../supabaseClient";

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    promise.then(v => { clearTimeout(t); resolve(v); })
           .catch(e => { clearTimeout(t); reject(e); });
  });
}

export async function fetchEdgePinSession(edgeUrl, pin) {
  console.log("[AUTH] calling Edge Function /login-with-pin");
  const res = await fetch(edgeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: String(pin) }),
  });

  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(result?.error || "PIN login failed");
    if (result?.code) err.code = result.code;
    console.error("[AUTH] edge error:", result);
    throw err;
  }
  return result;
}

/**
 * Set tokens, then *optionally* confirm with a quick getSession.
 * Never hang here — proceed if read-back is slow.
 */
export async function setSessionFromEdgeResult(edgeResult) {
  const at = edgeResult?.access_token;
  const rt = edgeResult?.refresh_token;
  if (!at || !rt) {
    console.error("[AUTH] edge returned no tokens", edgeResult);
    throw new Error("Server did not return tokens");
  }

  console.log("[AUTH] setSession calling supabase.auth.setSession()");
  const { data, error } = await supabase.auth.setSession({
    access_token: at,
    refresh_token: rt,
  });
  if (error) {
    console.error("[AUTH] setSession error", error);
    throw error;
  }

  // Prefer what setSession returned
  let session = data?.session ?? null;

  // Quick read-back with timeout (don’t block the flow)
  try {
    const after = await withTimeout(
      supabase.auth.getSession(),
      800, // <= keep short
      "getSession"
    );
    if (after?.data?.session) {
      session = after.data.session;
    }
  } catch (e) {
    console.warn("[AUTH] getSession after set timed out; proceeding", e?.message || e);
  }

  return session;
}

export async function buildUserData(session, edgeMeta, findStaffIdForUser) {
  const staffId = await findStaffIdForUser(session.user);
  return {
    id: session.user.id,
    email: session.user.email,
    name: edgeMeta?.name ?? session.user.email,
    permission: String(edgeMeta?.permission ?? "staff").toLowerCase(),
    token: session.access_token ?? null,
    offline: false,
    staff_id: staffId ?? null,
  };
}
