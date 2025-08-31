// FRONTEND (Vite/React) ✅
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// -------------------- DEBUG + SAFETY NET --------------------
if (import.meta.env.DEV) {
  // patch .from() so we can intercept builder methods synchronously
  const _from = supabase.from.bind(supabase);
  supabase.from = (table) => {
    const builder = _from(table);

    // keep original fns
    const _eq = builder.eq?.bind(builder);
    const _or = builder.or?.bind(builder);
    const _filter = builder.filter?.bind(builder);

    // intercept .eq('auth_id', ...)
    if (_eq) {
      builder.eq = (col, val) => {
        if (table === 'staff' && col === 'auth_id') {
          console.warn('[TRACE][supabase.from().eq] staff.auth_id used. Rewriting to uid.\n', new Error().stack);
          // auto-fix to stop 400s
          return _eq('uid', val);
        }
        return _eq(col, val);
      };
    }

    // intercept .or("auth_id.eq....")
    if (_or) {
      builder.or = (filter) => {
        if (table === 'staff' && typeof filter === 'string' && /(^|,)auth_id\.eq\./.test(filter)) {
          console.warn('[TRACE][supabase.from().or] staff filter contains auth_id. Rewriting.\n', filter, '\n', new Error().stack);
          const fixed = filter.replace(/(^|,)auth_id\.eq\./g, '$1uid.eq.');
          return _or(fixed);
        }
        return _or(filter);
      };
    }

    // catch any custom .filter('auth_id', 'eq', ...)
    if (_filter) {
      builder.filter = (col, op, val) => {
        if (table === 'staff' && col === 'auth_id') {
          console.warn('[TRACE][supabase.from().filter] staff.auth_id used. Rewriting to uid.\n', new Error().stack);
          return _filter('uid', op, val);
        }
        return _filter(col, op, val);
      };
    }

    return builder;
  };
}
// ------------------ END DEBUG + SAFETY NET ------------------