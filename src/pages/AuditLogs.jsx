import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase as defaultSupabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import PageLoader from "../components/PageLoader.jsx";

const ALLOWED_ROLES = ["admin", "business owner", "manager"];

const PAGE_SIZES = [25, 50, 100, 200];



const ACTIVITY_GROUPS = [
  {
    title: "Bookings",
    items: [
      { key: "booking_created", label: "Booking created" },
      { key: "booking_updated", label: "Booking edited" },
      { key: "booking_moved", label: "Booking moved" },
      { key: "booking_deleted", label: "Booking deleted" },
      { key: "booking_cancelled", label: "Booking cancelled" },
      { key: "booking_confirmed", label: "Booking confirmed" },
    ],
  },
  {
    title: "Login / Sessions",
    items: [
      { key: "login", label: "User logged in" },
      { key: "logout", label: "User logged out" },
      { key: "session_started", label: "Session started" },
      { key: "session_ended", label: "Session ended" },
    ],
  },
    {
    title: "Services",
    items: [{   key: "service_created", label: "Service created" },
      { key: "service_deleted", label: "Service deleted" },
      { key: "staff_services_saved", label: "Staff services updated" },],
  },
];

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatDateTime(isoString) {
  if (!isoString) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(isoString));
  } catch {
    return new Date(isoString).toLocaleString();
  }
}

function buildSummary(row) {
  const action = row?.action || "—";
  const entityType = row?.entity_type || "—";
  const details = row?.details;

  // --- Service events (friendly) ---
  if (action === "service_deleted") {
    const name = details?.service?.name || "a service";
    const cat = details?.service?.category ? ` (${details.service.category})` : "";
    return `Deleted service: ${name}${cat}`;
  }

  if (action === "service_created") {
    const name = details?.service?.name || "a service";
    const cat = details?.service?.category ? ` (${details.service.category})` : "";
    return `Added service: ${name}${cat}`;
  }

  if (action === "staff_services_saved") {
    const serviceName = details?.service_name || "service";
    const up = Number(details?.upsert_count || 0);
    const del = Number(details?.delete_count || 0);
    return `Updated staff assignments for ${serviceName} (${up} saved, ${del} removed)`;
  }

  // --- Booking events (your existing logic) ---
  if (details && typeof details === "object") {
    const fromStart = details?.from_start || details?.previous_start;
    const toStart = details?.to_start || details?.new_start;

    if (action === "booking_moved" && (fromStart || toStart)) {
      return `Moved: ${fromStart ? formatDateTime(fromStart) : "—"} → ${
        toStart ? formatDateTime(toStart) : "—"
      }`;
    }

    if (action === "booking_cancelled" && details?.reason) {
      return `Cancelled: ${details.reason}`;
    }

    if (details?.message) return String(details.message);
  }

  return `${entityType} • ${action}`;
}

function formatMoneyGBP(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}

function formatDurationMins(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `${n} mins`;
}

function buildHumanStatement(row) {
  const when = formatDateTime(row?.created_at);

  const actorName =
    row?.actor_label || row?.staff_name || row?.actor_email || "Someone";
  const actorRole = row?.actor_role ? String(row.actor_role).toLowerCase() : "";

  const who = actorRole ? `${actorName} (${actorRole})` : actorName;

  if (row?.action === "service_deleted") {
    const s = row?.details?.service || {};
    const name = s?.name || "a service";
    const cat = s?.category || null;
    const price = formatMoneyGBP(s?.base_price);
    const duration = formatDurationMins(s?.base_duration);
    const removedCount = row?.details?.cascade_deleted_staff_services_count ?? null;

    const bits = [];
    if (cat) bits.push(`category ${cat}`);
    if (price) bits.push(`base price ${price}`);
    if (duration) bits.push(`duration ${duration}`);
    if (removedCount !== null && removedCount !== undefined)
      bits.push(`${removedCount} staff assignment(s) removed`);

    const extra = bits.length ? ` (${bits.join(", ")})` : "";

    return {
      title: `${who} deleted the “${name}” service from Services.${extra}`,
      when,
    };
  }

  if (row?.action === "service_created") {
    const s = row?.details?.service || {};
    const name = s?.name || "a service";
    const cat = s?.category || null;
    const price = formatMoneyGBP(s?.base_price);
    const duration = formatDurationMins(s?.base_duration);

    const bits = [];
    if (cat) bits.push(`category ${cat}`);
    if (price) bits.push(`base price ${price}`);
    if (duration) bits.push(`duration ${duration}`);
    const extra = bits.length ? ` (${bits.join(", ")})` : "";

    return {
      title: `${who} added the “${name}” service to Services.${extra}`,
      when,
    };
  }

  return {
    title: buildSummary(row),
    when,
  };
}


function useDebouncedValue(value, delayMs = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function isUuid(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    str || ""
  );
}

export default function AuditLog() {
  const { currentUser, supabaseClient } = useAuth();
  const [staffById, setStaffById] = useState({});


  const supabase = supabaseClient || defaultSupabase;
  const role = (currentUser?.permission || "").toLowerCase();
  const hasAccess = ALLOWED_ROLES.includes(role);

  const [rows, setRows] = useState([]);
  const [errText, setErrText] = useState("");

  // ✅ Split loading states (prevents flicker)
  const [initialLoading, setInitialLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
    const initialLoadRef = useRef(true);

  const [selectedRow, setSelectedRow] = useState(null);

  // Filters
  const [sortDir, setSortDir] = useState("desc");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const [actorQuery, setActorQuery] = useState("");
  const [entityQuery, setEntityQuery] = useState("");
  const [detailsQuery, setDetailsQuery] = useState("");

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [sourcePublic, setSourcePublic] = useState(true);
  const [sourceAuth, setSourceAuth] = useState(true);

  const allActivityKeys = useMemo(
    () => ACTIVITY_GROUPS.flatMap((g) => g.items.map((i) => i.key)),
    []
  );

  const [selectedActions, setSelectedActions] = useState(
    () => new Set(allActivityKeys)
  );

  const selectedActionsArr = useMemo(
    () => Array.from(selectedActions).sort(),
    [selectedActions]
  );

  // ✅ IMPORTANT: memoise the filters object so it’s stable between renders
  const filters = useMemo(
    () => ({
      sortDir,
      pageSize,
      page,
      actorQuery,
      entityQuery,
      detailsQuery,
      dateFrom,
      dateTo,
      sourcePublic,
      sourceAuth,
      selectedActions: selectedActionsArr,
    }),
    [
      sortDir,
      pageSize,
      page,
      actorQuery,
      entityQuery,
      detailsQuery,
      dateFrom,
      dateTo,
      sourcePublic,
      sourceAuth,
      selectedActionsArr,
    ]
  );

  const debouncedFilters = useDebouncedValue(filters, 350);

  const toggleAction = (key) => {
    setPage(0);
    setSelectedActions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const setAllActions = (checked) => {
    setPage(0);
    setSelectedActions(() => (checked ? new Set(allActivityKeys) : new Set()));
  };

  const clearFilters = () => {
    setSortDir("desc");
    setPageSize(50);
    setPage(0);
    setActorQuery("");
    setEntityQuery("");
    setDetailsQuery("");
    setDateFrom("");
    setDateTo("");
    setSourcePublic(true);
    setSourceAuth(true);
    setSelectedActions(new Set(allActivityKeys));
  };

  // Prevent older requests overwriting newer ones
  const reqIdRef = useRef(0);

  const fetchAudit = useCallback(async () => {
    if (!hasAccess) return;

    const myReqId = ++reqIdRef.current;

    setErrText("");
   // ✅ only show big loader on first load (avoid double-fetch loops)
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      setInitialLoading(true);
      setIsFetching(false);
    } else {
      setIsFetching(true);
    }

    try {
      const {
        sortDir: sDir,
        pageSize: pSize,
        page: p,
        actorQuery: aQ,
        entityQuery: eQ,
        detailsQuery: dQ,
        dateFrom: dFrom,
        dateTo: dTo,
        sourcePublic: srcPublic,
        sourceAuth: srcAuth,
        selectedActions: actions,
      } = debouncedFilters;

      const fromIndex = p * pSize;
      const toIndex = fromIndex + pSize - 1;

      const sources = [];
      if (srcPublic) sources.push("public");
   if (srcAuth) sources.push("app", "authenticated");

      // If user unchecks everything, show nothing (clean UX)
      if (!actions?.length || sources.length === 0) {
        if (myReqId === reqIdRef.current) {
          setRows([]);
          setTotalCount(0);
        }
        return;
      }

      let q = supabase
        .from("audit_events")
        .select("*", { count: "exact" })
        .in("action", actions)
        .order("created_at", { ascending: sDir === "asc" })
        .range(fromIndex, toIndex);

   q = q.in("source", sources);


      if (aQ?.trim()) {
        const needle = aQ.trim();
        if (needle.includes("@")) {
          q = q.ilike("actor_email", `%${needle}%`);
        } else if (isUuid(needle)) {
          q = q.eq("actor_id", needle);
        } else {
          q = q.ilike("actor_email", `%${needle}%`);
        }
      }

      if (eQ?.trim()) {
        const needle = eQ.trim();
        if (isUuid(needle)) {
          q = q.or(`entity_id.eq.${needle},booking_id.eq.${needle}`);
        } else {
          // partial uuid search isn’t really useful; keep it safe
          q = q.ilike("entity_type", `%${needle}%`);
        }
      }

      if (dFrom) {
        q = q.gte("created_at", new Date(`${dFrom}T00:00:00`).toISOString());
      }
      if (dTo) {
        q = q.lte("created_at", new Date(`${dTo}T23:59:59`).toISOString());
      }

      // NOTE: this may fail depending on your jsonb setup.
      // If it errors, best fix is adding a searchable text column (details_text).
      if (dQ?.trim()) {
        const needle = dQ.trim();
        q = q.or(`details::text.ilike.%${needle}%`);
      }

      const { data, error, count } = await q;
      if (error) throw error;

   try {
  const ids = Array.from(
    new Set((data || []).map((r) => r.staff_id || r.actor_id).filter(Boolean))
  );

  if (ids.length) {
    const { data: staffRows, error: staffErr } = await supabase
      .from("staff")
      .select("id,name,permission,email")
      .in("id", ids);

    if (!staffErr) {
      const map = {};
      for (const s of staffRows || []) map[s.id] = s;

      if (myReqId === reqIdRef.current) setStaffById(map);
    }
  }
} catch (e) {
  console.warn("[Audit] staff lookup failed", e);
}

// Only apply if this is the latest request
if (myReqId === reqIdRef.current) {
  setRows(data || []);
  setTotalCount(count || 0);
}
    } catch (err) {
      console.error("[Audit] fetch failed", err);
      if (myReqId === reqIdRef.current) {
        setErrText(err?.message || "Failed to load audit logs");
      }
    } finally {
      if (myReqId === reqIdRef.current) {
        setInitialLoading(false);
        setIsFetching(false);
      }
    }
}, [debouncedFilters, hasAccess, supabase]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const formattedRows = useMemo(() => {
    return (rows || []).map((row) => {
      const detailsObj = row?.details;
      const detailsText =
        typeof detailsObj === "object" && detailsObj !== null
          ? safeJsonStringify(detailsObj)
          : row?.details || "—";
const staffRec = staffById[row.staff_id] || staffById[row.actor_id];
const roleLabel = staffRec?.permission ? String(staffRec.permission) : "";

const actorLabel =
  staffRec?.name ||
  row?.staff_name ||
  roleLabel ||
  (row?.source === "public" ? "Public client" : row?.actor_email || "Unknown");


      return {
  ...row,
  created_at_label: formatDateTime(row?.created_at),
  actor_label: actorLabel,
  actor_role: roleLabel || "—",
  summary: buildSummary(row),
  details_text: detailsText,
};    });
  }, [rows]);

  const totalPages = useMemo(() => {
    if (!totalCount) return 1;
    return Math.max(1, Math.ceil(totalCount / pageSize));
  }, [totalCount, pageSize]);

  if (!hasAccess) {
    return (
      <div className="p-6">
        <div className="p-4 bg-red-50 text-red-700 rounded">
          You do not have permission to view the audit log.
        </div>
      </div>
    );
  }

  if (initialLoading) {
    return (
      <div className="p-6">
        <PageLoader />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Audit</h1>
          <p className="text-sm text-gray-600">
            Filter, search, and sort activity events.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isFetching && (
            <div className="text-sm text-gray-600 px-3 py-2 border border-gray-200 rounded bg-white">
              Updating…
            </div>
          )}

          <button
            onClick={clearFilters}
            className="px-3 py-2 rounded border border-gray-200 hover:bg-gray-50"
            disabled={isFetching}
          >
            Clear filters
          </button>

          <button
            onClick={fetchAudit}
            className="px-3 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50"
            disabled={isFetching}
          >
            Refresh
          </button>
        </div>
      </div>

      {errText && (
        <div className="p-3 bg-red-50 text-red-700 rounded">{errText}</div>
      )}

      {/* Filters */}
      <div className="border border-gray-200 rounded bg-white shadow-sm">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="font-semibold">Filters</div>
          <div className="text-xs text-gray-500">
            Showing {formattedRows.length} of {totalCount} result(s)
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Search */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Actor</label>
              <input
                value={actorQuery}
                onChange={(e) => {
                  setPage(0);
                  setActorQuery(e.target.value);
                }}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded"
                placeholder="Search email or user id…"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Entity</label>
              <input
                value={entityQuery}
                onChange={(e) => {
                  setPage(0);
                  setEntityQuery(e.target.value);
                }}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded"
                placeholder="Search booking id / entity type…"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">
                Search in details
              </label>
              <input
                value={detailsQuery}
                onChange={(e) => {
                  setPage(0);
                  setDetailsQuery(e.target.value);
                }}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded"
                placeholder="e.g. reason, old time, new time…"
              />
            </div>
          </div>

          {/* Date / sort / source */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Date from</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setPage(0);
                    setDateFrom(e.target.value);
                  }}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Date to</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setPage(0);
                    setDateTo(e.target.value);
                  }}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Sort</label>
                <select
                  value={sortDir}
                  onChange={(e) => {
                    setPage(0);
                    setSortDir(e.target.value);
                  }}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded bg-white"
                >
                  <option value="desc">Newest first</option>
                  <option value="asc">Oldest first</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Page size</label>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPage(0);
                    setPageSize(Number(e.target.value));
                  }}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded bg-white"
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Source</label>
              <div className="mt-2 flex flex-wrap gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={sourcePublic}
                    onChange={(e) => {
                      setPage(0);
                      setSourcePublic(e.target.checked);
                    }}
                  />
                  Public / Online
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={sourceAuth}
                    onChange={(e) => {
                      setPage(0);
                      setSourceAuth(e.target.checked);
                    }}
                  />
                  Staff / Authenticated
                </label>
              </div>
            </div>
          </div>

          {/* Activities */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Activities</label>
              <div className="flex items-center gap-2 text-xs">
                <button
                  className="px-2 py-1 border border-gray-200 rounded hover:bg-gray-50"
                  onClick={() => setAllActions(true)}
                  disabled={isFetching}
                >
                  Select all
                </button>
                <button
                  className="px-2 py-1 border border-gray-200 rounded hover:bg-gray-50"
                  onClick={() => setAllActions(false)}
                  disabled={isFetching}
                >
                  Select none
                </button>
              </div>
            </div>

            <div className="max-h-56 overflow-auto border border-gray-100 rounded p-3">
              <div className="space-y-4">
                {ACTIVITY_GROUPS.map((group) => (
                  <div key={group.title}>
                    <div className="text-xs font-semibold text-gray-600 mb-2">
                      {group.title}
                    </div>
                    <div className="space-y-2">
                      {group.items.map((item) => (
                        <label
                          key={item.key}
                          className="flex items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={selectedActions.has(item.key)}
                            onChange={() => toggleAction(item.key)}
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-xs text-gray-500">
              These must match your <span className="font-mono">audit_events.action</span> values.
            </div>
          </div>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-gray-100 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Page {page + 1} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-2 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50"
              disabled={isFetching || page <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Prev
            </button>
            <button
              className="px-3 py-2 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50"
              disabled={isFetching || page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Results (no full-screen loader anymore) */}
      <div className={`overflow-auto border border-gray-200 rounded shadow-sm bg-white ${isFetching ? "opacity-80" : ""}`}>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-left sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 font-semibold text-gray-700">When</th>
              <th className="px-3 py-2 font-semibold text-gray-700">Activity</th>
              <th className="px-3 py-2 font-semibold text-gray-700">Actor</th>
              <th className="px-3 py-2 font-semibold text-gray-700">Summary</th>
              <th className="px-3 py-2 font-semibold text-gray-700"></th>
            </tr>
          </thead>
          <tbody>
            {formattedRows.map((row) => (
              <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap">{row.created_at_label}</td>

                <td className="px-3 py-2">
                  <span className="inline-flex items-center px-2 py-1 rounded bg-gray-100 text-gray-800 text-xs">
                    {row.action || "—"}
                  </span>
                </td>

                <td className="px-3 py-2">
                 <div className="font-semibold">{row.actor_label}</div>
<div className="text-xs text-gray-500">{row.actor_role}</div>
                </td>

                      <td className="px-3 py-2 text-gray-700">{row.summary}</td>

                <td className="px-3 py-2">
                  <button
                    className="px-3 py-2 rounded border border-gray-200 hover:bg-white"
                    onClick={() => setSelectedRow(row)}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}

            {!formattedRows.length && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                  No audit events found for these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Details panel */}
      {selectedRow && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setSelectedRow(null)}
          />
          <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl border-l border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-100 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Event details</div>
                <div className="text-xs text-gray-500">
                  {formatDateTime(selectedRow.created_at)} • {selectedRow.action || "—"}
                </div>
              </div>

              <button
                className="px-3 py-2 bg-black text-white rounded hover:bg-gray-800"
                onClick={() => setSelectedRow(null)}
              >
                Close
              </button>
            </div>

        <div className="p-3 border border-gray-100 rounded bg-white">
  <div className="text-xs font-semibold text-gray-600 mb-2">Details</div>

  
{(() => {
  const msg = buildHumanStatement(selectedRow);
  return (
    <div className="mb-3">
      <div className="text-sm text-gray-900 font-medium">{msg.title}</div>
      <div className="text-xs text-gray-500 mt-1">{msg.when}</div>
    </div>
  );
})()}


  {/* Raw JSON (still available) */}
  <details className="border border-gray-100 rounded bg-gray-50">
    <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-gray-700">
      View raw data
    </summary>
    <pre className="whitespace-pre-wrap text-xs p-3 overflow-auto">
      {selectedRow.details_text || "—"}
    </pre>
  </details>
</div>

          </div>
        </div>
      )}
    </div>
  );
}
