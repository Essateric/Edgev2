// supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Use a custom storage key so multiple apps/tabs don't collide
const STORAGE_KEY = "edgehd_auth_v1";

// ---- Singleton: reuse the same client across HMR/imports
const existing =
  typeof window !== "undefined" ? window.__supabase__ : undefined;

const client =
  existing ??
  createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      persistSession: true,
      storageKey: STORAGE_KEY,
    },
  });

// Expose on window so future imports reuse it, and for console debugging
if (typeof window !== "undefined") {
  window.__supabase__ = client;
  if (import.meta.env.DEV) {
    // for quick testing in the dev console
    window.supabase = client;
  }
}

/* -------------------- DEBUG + SAFETY NET (DEV ONLY) -------------------- */
/* Patch .from() once to rewrite accidental staff.auth_id → UID lookups */
if (import.meta.env.DEV && !client.__fromPatched) {
  const TARGET_TABLE = "staff";
  const BAD_COL = "auth_id";
  const GOOD_COL = "UID"; // <-- your actual column name (case-sensitive)

  const originalFrom = client.from.bind(client);

  client.from = (table) => {
    const builder = originalFrom(table);

    // keep originals
    const _eq = builder.eq?.bind(builder);
    const _or = builder.or?.bind(builder);
    const _filter = builder.filter?.bind(builder);

    // intercept .eq('auth_id', ...)
    if (_eq) {
      builder.eq = (col, val) => {
        if (table === TARGET_TABLE && col === BAD_COL) {
          console.warn(
            "[TRACE][supabase.from().eq] staff.auth_id used. Rewriting to",
            GOOD_COL,
            "\n",
            new Error().stack
          );
          return _eq(GOOD_COL, val);
        }
        return _eq(col, val);
      };
    }

    // intercept .or("auth_id.eq....")
    if (_or) {
      builder.or = (filter) => {
        if (
          table === TARGET_TABLE &&
          typeof filter === "string" &&
          /(^|,)auth_id\.eq\./.test(filter)
        ) {
          console.warn(
            "[TRACE][supabase.from().or] staff filter contains auth_id. Rewriting.\n",
            filter,
            "\n",
            new Error().stack
          );
          const fixed = filter.replace(
            /(^|,)auth_id\.eq\./g,
            `$1${GOOD_COL}.eq.`
          );
          return _or(fixed);
        }
        return _or(filter);
      };
    }

    // intercept .filter('auth_id', 'eq', ...)
    if (_filter) {
      builder.filter = (col, op, val) => {
        if (table === TARGET_TABLE && col === BAD_COL) {
          console.warn(
            "[TRACE][supabase.from().filter] staff.auth_id used. Rewriting to",
            GOOD_COL,
            "\n",
            new Error().stack
          );
          return _filter(GOOD_COL, op, val);
        }
        return _filter(col, op, val);
      };
    }

    return builder;
  };

  // mark as patched so HMR doesn't double wrap
  client.__fromPatched = true;
}
/* ------------------ END DEBUG + SAFETY NET ------------------ */

export const supabase = client;
