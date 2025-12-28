import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import baseSupabase from "../../supabaseClient";

import Modal from "../Modal";
import Button from "../Button";
import ClientHistoryFullScreen from "../../pages/ClientHistory";
import { useAuth } from "../../contexts/AuthContext";

/**
 * Props:
 * - isOpen, onClose
 * - clientId (required)  ✅ should be clients.id (uuid)
 * - bookingId (optional) ✅ should be bookings.id (uuid) OR sometimes a legacy group id (bookings.booking_id text)
 * - bookingGroupId (optional) ✅ explicit legacy group id (bookings.booking_id text)
 */
export default function ClientNotesModal({
  isOpen,
  onClose,
  clientEmail,
  clientId,
  bookingId = null,
  bookingGroupId = null,
  modalZIndex = 60,
}) {
  const [client, setClient] = useState(null);

  // Email editing
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState("");

  // Notes
  const [notes, setNotes] = useState([]);
  const [noteContent, setNoteContent] = useState("");

  // History (bookings)
  const [history, setHistory] = useState([]);
  const [providerMap, setProviderMap] = useState({}); // { staffId: "Name" }
  const [bookingMetaByRowId, setBookingMetaByRowId] = useState({}); // { bookingRowId: { when, title } }
  const [bookingMetaByGroupId, setBookingMetaByGroupId] = useState({}); // { bookingGroupId(text): { when, title } }
  const [repeatSeriesId, setRepeatSeriesId] = useState(null);

  const [showFullHistory, setShowFullHistory] = useState(false);

  // Current stylist display name (author of notes)
  const [staffName, setStaffName] = useState("Stylist");

  // Pagination
  const HISTORY_PAGE_SIZE = 10;
  const NOTES_PAGE_SIZE = 4;
  const [historyPage, setHistoryPage] = useState(1);
  const [notesPage, setNotesPage] = useState(1);

  // 🔹 current signed-in user (PIN auth etc)
  const { currentUser, supabaseClient, authLoading } = useAuth();

  // ✅ use token-backed client when available
  const db = supabaseClient || baseSupabase;
  const notesDb = supabaseClient || baseSupabase;

  const [notesSessionReady, setNotesSessionReady] = useState(false);
  const notesClientReady = notesSessionReady && !authLoading;

  // Internal: resolved IDs (fixes “wrong id passed in” issues)
  const [effectiveClientId, setEffectiveClientId] = useState(null);
  const [effectiveBookingRowId, setEffectiveBookingRowId] = useState(null);
  const [effectiveBookingGroupId, setEffectiveBookingGroupId] = useState(null);

  // -------- helpers --------
  const isValidEmail = (s) =>
    !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());

  const isUuid = (v) =>
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v
    );

  // Prefer your PIN/currentUser identity if present, otherwise fall back to Supabase auth user
  const getCurrentStaffIdentity = async () => {
    try {
      if (currentUser?.id || currentUser?.email || currentUser?.name) {
        return {
          staffId: currentUser?.id || null,
          authId: null,
          name:
            currentUser?.name ||
            (currentUser?.email ? currentUser.email.split("@")[0] : "Stylist"),
          email: currentUser?.email || null,
          permission: currentUser?.permission || null,
        };
      }

      const { data: { user } = {} } = await db.auth.getUser();
      if (!user) {
        return {
          staffId: null,
          authId: null,
          name: "Stylist",
          email: null,
          permission: null,
        };
      }

      if (user.email) {
        const { data } = await db
          .from("staff")
          .select("id, name, email, permission")
          .eq("email", user.email)
          .maybeSingle();

        if (data) {
          return {
            staffId: data.id || null,
            authId: user.id,
            name:
              data.name ||
              data.email ||
              (user.email ? user.email.split("@")[0] : "Stylist"),
            email: data.email || user.email || null,
            permission: data.permission || null,
          };
        }
      }

      return {
        staffId: null,
        authId: user.id,
        name:
          user.user_metadata?.name ||
          (user.email ? user.email.split("@")[0] : "Stylist"),
        email: user.email || null,
        permission: null,
      };
    } catch {
      return {
        staffId: null,
        authId: null,
        name: "Stylist",
        email: null,
        permission: null,
      };
    }
  };

  const resolveCurrentStaffName = async () => {
    const who = await getCurrentStaffIdentity();
    return who.name || "Stylist";
  };

  // --- Notes session readiness (hydrate from PIN token if needed) ---
  useEffect(() => {
    if (!notesDb || authLoading) return;

    let cancelled = false;

    const run = async () => {
      setNotesSessionReady(false);

      try {
        const { data, error } = await notesDb.auth.getSession();
        if (cancelled) return;

        if (!error && data?.session) {
          setNotesSessionReady(true);
          return;
        }

        if (currentUser?.token && currentUser?.refresh_token) {
          const { error: setErr } = await notesDb.auth.setSession({
            access_token: currentUser.token,
            refresh_token: currentUser.refresh_token,
          });

          if (cancelled) return;

          if (!setErr) {
            const { data: afterSet } = await notesDb.auth.getSession();
            if (!cancelled) setNotesSessionReady(!!afterSet?.session);
            return;
          }
        }

        if (!cancelled) setNotesSessionReady(false);
      } catch {
        if (!cancelled) setNotesSessionReady(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [notesDb, authLoading, currentUser?.token, currentUser?.refresh_token]);

  // --- Notes loader (robust when bookingGroupId is not uuid) ---
  const loadNotes = useCallback(
    async ({ cid, bookingRowId, bookingGroupId: groupId }) => {
      if (!notesClientReady) {
        setNotes([]);
        return;
      }

      const makeFilters = ({ includeGroup }) => {
        const f = [];
        if (cid) f.push(`client_id.eq.${cid}`);
        if (bookingRowId) f.push(`booking_id.eq.${bookingRowId}`);
        if (includeGroup && groupId) f.push(`booking_id.eq.${groupId}`);
        return f;
      };

      let filters = makeFilters({ includeGroup: true });

      if (!filters.length) {
        setNotes([]);
        return;
      }

      const runQuery = async (orString) => {
        return await notesDb
          .from("client_notes")
          .select("id, client_id, note_content, created_by, created_at, booking_id")
          .or(orString)
          .order("created_at", { ascending: false });
      };

      let res = await runQuery(filters.join(","));

      // If booking_id column is UUID and groupId is text, Supabase can error.
      // Retry without the group filter so we still show client / row-based notes.
      if (
        res?.error &&
        groupId &&
        !isUuid(groupId) &&
        /invalid input syntax for type uuid/i.test(res.error.message || "")
      ) {
        filters = makeFilters({ includeGroup: false });
        if (filters.length) {
          res = await runQuery(filters.join(","));
        }
      }

      if (res.error) {
        console.error("Error fetching notes:", res.error.message);
        setNotes([]);
        return;
      }

      const unique = [];
      const seen = new Set();
      for (const n of res.data || []) {
        if (n?.id && !seen.has(n.id)) {
          seen.add(n.id);
          unique.push(n);
        }
      }
      setNotes(unique);
    },
    [notesClientReady, notesDb]
  );

  // -------- resolve correct client + booking ids on open --------
  useEffect(() => {
    if (!isOpen) return;

    let active = true;

    // reset “stale UI” when reopening
    setIsEditingEmail(false);
    setEmailError("");
    setSavingEmail(false);
    setShowFullHistory(false);

    // reset resolved ids on open
    setEffectiveClientId(null);
    setEffectiveBookingRowId(null);
    setEffectiveBookingGroupId(null);
    setRepeatSeriesId(null);

    (async () => {
      let resolvedClientId = isUuid(clientId) ? clientId : null;
      let resolvedBookingRowId = isUuid(bookingId) ? bookingId : null;

      // Start with an explicit group id if provided, otherwise infer from bookingId when it's non-uuid
      let resolvedGroupId =
        (bookingGroupId && String(bookingGroupId).trim()) ||
        (!isUuid(bookingId) && bookingId ? String(bookingId).trim() : null);

      if (bookingId) {
        if (isUuid(bookingId)) {
          // Case A: bookingId is a booking row uuid
          const { data, error } = await db
            .from("bookings")
            .select("id, client_id, repeat_series_id, booking_id")
            .eq("id", bookingId)
            .maybeSingle();

          if (!error && data?.id) {
            resolvedBookingRowId = data.id;
            if (!resolvedClientId && data.client_id) resolvedClientId = data.client_id;
            if (data.repeat_series_id) setRepeatSeriesId(data.repeat_series_id);
            if (data.booking_id && !resolvedGroupId) {
              resolvedGroupId = String(data.booking_id).trim();
            }
          }
        } else {
          // Case B: bookingId is a booking group id (bookings.booking_id text)
          const group = String(bookingId).trim();
          if (!resolvedGroupId) resolvedGroupId = group;

          const { data, error } = await db
            .from("bookings")
            .select("id, client_id, repeat_series_id, booking_id")
            .eq("booking_id", group)
            .order("start", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!error && data?.id) {
            resolvedBookingRowId = data.id;
            if (!resolvedClientId && data.client_id) resolvedClientId = data.client_id;
            if (data.repeat_series_id) setRepeatSeriesId(data.repeat_series_id);
            if (data.booking_id && !resolvedGroupId) {
              resolvedGroupId = String(data.booking_id).trim();
            }
          }
        }
      }

      if (!active) return;

      setEffectiveClientId(resolvedClientId || null);
      setEffectiveBookingRowId(resolvedBookingRowId || null);
      setEffectiveBookingGroupId(resolvedGroupId || null);

      if (!resolvedClientId) {
        console.warn("[ClientNotesModal] No resolved client id:", {
          clientId,
          bookingId,
          bookingGroupId,
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [isOpen, clientId, bookingId, bookingGroupId, db]);

  // Client + stylist name on open (uses effectiveClientId)
  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    (async () => {
      if (!effectiveClientId) {
        if (!active) return;
        setClient(null);
        setEmailInput(clientEmail || "");
        return;
      }

      const { data, error } = await db
        .from("clients")
        .select("id, first_name, last_name, email")
        .eq("id", effectiveClientId)
        .maybeSingle();

      if (!active) return;

      if (!error && data) {
        setClient(data);
        setEmailInput(data?.email || clientEmail || "");
      } else if (error) {
        console.error("Fetch client failed:", error.message, {
          effectiveClientId,
          clientId,
          bookingId,
        });
        setClient(null);
        setEmailInput(clientEmail || "");
      } else {
        setClient(null);
        setEmailInput(clientEmail || "");
      }
    })();

    (async () => {
      const name = await resolveCurrentStaffName();
      if (active && name) setStaffName(name);
    })();

    return () => {
      active = false;
    };
  }, [isOpen, effectiveClientId, clientId, bookingId, clientEmail, db]);

  // Notes on open
  useEffect(() => {
    if (!isOpen) return;

    // fetch notes if we have ANY useful identifier
    if (effectiveClientId || effectiveBookingRowId || effectiveBookingGroupId) {
      loadNotes({
        cid: effectiveClientId,
        bookingRowId: effectiveBookingRowId,
        bookingGroupId: effectiveBookingGroupId,
      });
      setNotesPage(1);
    } else {
      setNotes([]);
    }
  }, [
    isOpen,
    effectiveClientId,
    effectiveBookingRowId,
    effectiveBookingGroupId,
    notesClientReady,
    loadNotes,
  ]);

  // --- Load history (bookings) when opened ---
  const loadHistory = useCallback(async () => {
    if (!isOpen || !effectiveClientId) return;

    const filters = [];
    filters.push(`client_id.eq.${effectiveClientId}`);

    // If we have a group id, include it (optional, helps context in some edge cases)
    if (effectiveBookingGroupId) {
      filters.push(`booking_id.eq.${effectiveBookingGroupId}`);
    }

    if (effectiveBookingRowId) {
      filters.push(`id.eq.${effectiveBookingRowId}`);
    }

    const { data, error } = await db
      .from("bookings")
      .select("id, booking_id, start, title, category, resource_id")
      .or(filters.join(","))
      .order("start", { ascending: false })
      .order("id", { ascending: true });

    if (error) {
      console.error("History fetch failed:", error.message);
      setHistory([]);
      setBookingMetaByRowId({});
      setBookingMetaByGroupId({});
      return;
    }

    const rows = data || [];

    const seen = new Set();
    const unique = [];
    for (const b of rows) {
      const d = new Date(b.start);
      const startIso = isNaN(d) ? "" : d.toISOString();
      const k = [b.resource_id || "", startIso, b.title || ""].join("|");
      if (!seen.has(k)) {
        seen.add(k);
        unique.push(b);
      }
    }

    setHistory(unique);
    setHistoryPage(1);

    // Provider map
    const ids = Array.from(new Set(unique.map((b) => b.resource_id).filter(Boolean)));
    if (ids.length) {
      const { data: staffRows, error: staffErr } = await db
        .from("staff")
        .select("id, name, permission, email")
        .in("id", ids);

      if (!staffErr) {
        const map = {};
        (staffRows || []).forEach((s) => {
          map[s.id] = s.name || s.email || s.permission || "—";
        });
        setProviderMap(map);
      }
    }

    // Booking metadata for notes context
    const byRow = {};
    const byGroup = {};
    unique.forEach((b) => {
      const when = isNaN(new Date(b.start))
        ? "—"
        : format(new Date(b.start), "dd MMM yyyy");
      const meta = {
        when,
        title: (b.category ? `${b.category}: ` : "") + (b.title || ""),
      };
      byRow[b.id] = meta;
      if (b.booking_id) byGroup[b.booking_id] = meta;
    });

    setBookingMetaByRowId(byRow);
    setBookingMetaByGroupId(byGroup);
  }, [db, effectiveBookingRowId, effectiveBookingGroupId, effectiveClientId, isOpen]);

  useEffect(() => {
    let active = true;
    (async () => {
      await loadHistory();
      if (!active) return;
    })();
    return () => {
      active = false;
    };
  }, [loadHistory]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleBookingsChanged = () => {
      void loadHistory();
    };

    window.addEventListener("bookings:changed", handleBookingsChanged);
    return () => {
      window.removeEventListener("bookings:changed", handleBookingsChanged);
    };
  }, [isOpen, loadHistory]);

  // -------- pagination helpers --------
  const paginatedHistory = useMemo(() => {
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
    return history.slice(start, start + HISTORY_PAGE_SIZE);
  }, [history, historyPage]);

  const paginatedNotes = useMemo(() => {
    const start = (notesPage - 1) * NOTES_PAGE_SIZE;
    return notes.slice(start, start + NOTES_PAGE_SIZE);
  }, [notes, notesPage]);

  const pageInfo = (page, total, size) => {
    if (!total) return "0–0 of 0";
    const start = (page - 1) * size + 1;
    const end = Math.min(page * size, total);
    return `${start}–${end} of ${total}`;
  };

  // -------- actions --------
  const handleAddNote = async () => {
    const text = noteContent.trim();
    if (!text) return;

    if (!notesClientReady) {
      alert("Notes are not ready yet. Please sign in again or reopen the modal.");
      return;
    }

    if (!effectiveClientId) {
      alert("Couldn't find the client for this booking. Please refresh and try again.");
      return;
    }

    const who = await getCurrentStaffIdentity();
    const authorName = who.name || staffName || "Stylist";

    // Only write booking_id if we have a real booking row uuid
    const safeBookingRowId =
      (effectiveBookingRowId && isUuid(effectiveBookingRowId) && effectiveBookingRowId) ||
      (bookingId && isUuid(bookingId) && bookingId) ||
      null;

    const payload = {
      client_id: effectiveClientId,
      note_content: text,
      created_by: authorName,
      booking_id: safeBookingRowId,
    };

    const { error } = await notesDb.from("client_notes").insert([payload]);
    if (error) {
      console.error("Add note failed:", error?.message || error);
      alert("Couldn't save note. " + (error?.message || ""));
      return;
    }

    setNoteContent("");
    await loadNotes({
      cid: effectiveClientId,
      bookingRowId: effectiveBookingRowId,
      bookingGroupId: effectiveBookingGroupId,
    });
    setNotesPage(1);
  };

  const emailIsInvalid = !!emailInput && !isValidEmail(emailInput);

  const handleSaveEmail = async () => {
    if (!effectiveClientId) return;

    const val = (emailInput || "").trim();
    setEmailError("");
    if (!isValidEmail(val)) {
      setEmailError("Enter a valid email address (e.g. alex@example.com)");
      return;
    }

    try {
      setSavingEmail(true);
      const { data, error } = await db
        .from("clients")
        .update({ email: val || null })
        .eq("id", effectiveClientId)
        .select("id, first_name, last_name, email")
        .maybeSingle();

      if (error) throw error;

      setClient(data || null);
      setIsEditingEmail(false);
    } catch (e) {
      console.error("Email update failed:", e.message);
      setEmailError(e.message || "Failed to save");
    } finally {
      setSavingEmail(false);
    }
  };

  // -------- render --------
  const fullName = useMemo(() => {
    if (!client) return "Client details";
    return (
      `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim() ||
      "Client details"
    );
  }, [client]);

  // ✅ always show a value even if clients fetch fails
  const emailToShow = useMemo(() => {
    return String(client?.email || clientEmail || "").trim();
  }, [client?.email, clientEmail]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Client Details"
      className="w-full max-w-[640px]"
      zIndex={modalZIndex}
    >
      <div className="space-y-4 text-gray-800">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold">{fullName}</h3>

          {effectiveClientId ? (
            <button
              className="text-xs text-blue-600 underline"
              onClick={() => setShowFullHistory(true)}
              type="button"
            >
              Full history
            </button>
          ) : null}
        </div>

        {/* EMAIL */}
        <div>
          <p className="text-sm font-semibold mb-1">Email</p>

          {!isEditingEmail ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="flex-1">
                {emailToShow ? (
                  <a className="underline" href={`mailto:${emailToShow}`}>
                    {emailToShow}
                  </a>
                ) : (
                  <span className="text-gray-500">No email</span>
                )}
              </span>
              <button
                className="text-blue-600 underline"
                onClick={() => setIsEditingEmail(true)}
                type="button"
              >
                Edit
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  className={`flex-1 border rounded px-2 py-1 text-sm ${
                    emailIsInvalid ? "border-red-500" : ""
                  }`}
                  placeholder="name@example.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  aria-invalid={emailIsInvalid}
                />
                <Button
                  onClick={handleSaveEmail}
                  disabled={savingEmail || emailIsInvalid}
                  className="text-sm"
                >
                  {savingEmail ? "Saving..." : "Save"}
                </Button>
                <Button
                  onClick={() => {
                    setIsEditingEmail(false);
                    setEmailInput(client?.email || clientEmail || "");
                    setEmailError("");
                  }}
                  className="text-sm"
                >
                  Cancel
                </Button>
              </div>
              {(emailError || emailIsInvalid) && (
                <p className="text-xs text-red-600">
                  {emailError || "Enter a valid email address (e.g. alex@example.com)"}
                </p>
              )}
            </div>
          )}
        </div>

        {/* HISTORY TABLE */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold">Service History</p>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-600">
                {pageInfo(historyPage, history.length, HISTORY_PAGE_SIZE)}
              </span>
              <div className="flex gap-1">
                <button
                  className="px-2 py-1 border rounded disabled:opacity-40"
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  disabled={historyPage === 1}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="px-2 py-1 border rounded disabled:opacity-40"
                  onClick={() =>
                    setHistoryPage((p) =>
                      p * HISTORY_PAGE_SIZE >= history.length ? p : p + 1
                    )
                  }
                  disabled={historyPage * HISTORY_PAGE_SIZE >= history.length}
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {history.length === 0 ? (
            <p className="text-sm text-gray-500">No history for this client yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-2 font-semibold w-[170px]">
                      Date & time
                    </th>
                    <th className="text-left py-2 pr-2 font-semibold w-[140px]">
                      Service provider
                    </th>
                    <th className="text-left py-2 pr-0 font-semibold">Service</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedHistory.map((h) => {
                    const d = new Date(h.start);
                    const dateTime = isNaN(d)
                      ? "—"
                      : `${format(d, "dd MMM yyyy")} · ${format(d, "HH:mm")}`;
                    const provider = providerMap[h.resource_id] || "—";
                    const service =
                      (h.category ? `${h.category}: ` : "") + (h.title || "");
                    return (
                      <tr key={h.id} className="border-b align-top">
                        <td className="py-2 pr-2 whitespace-nowrap">{dateTime}</td>
                        <td className="py-2 pr-2 whitespace-nowrap">{provider}</td>
                        <td className="py-2 pr-0">{service || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ADD NOTE */}
        <div className="flex gap-2">
          <input
            className="border flex-1 px-2 py-1 rounded bg-white text-gray-900 placeholder-gray-500"
            placeholder={
              notesClientReady ? "Enter note..." : "Notes not ready (sign in needed)"
            }
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            disabled={!notesClientReady}
          />
          <Button onClick={handleAddNote} disabled={!notesClientReady}>
            Add Note
          </Button>
        </div>

        {/* NOTES LIST (paginated, 4 per page) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold">Notes</p>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-600">
                {pageInfo(notesPage, notes.length, NOTES_PAGE_SIZE)}
              </span>
              <div className="flex gap-1">
                <button
                  className="px-2 py-1 border rounded disabled:opacity-40"
                  onClick={() => setNotesPage((p) => Math.max(1, p - 1))}
                  disabled={notesPage === 1}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="px-2 py-1 border rounded disabled:opacity-40"
                  onClick={() =>
                    setNotesPage((p) =>
                      p * NOTES_PAGE_SIZE >= notes.length ? p : p + 1
                    )
                  }
                  disabled={notesPage * NOTES_PAGE_SIZE >= notes.length}
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-auto bg-white p-1 rounded">
            {paginatedNotes.map((note) => {
              const key = note.booking_id ? String(note.booking_id) : "";
              const meta =
                (key && bookingMetaByRowId[key]) ||
                (key && bookingMetaByGroupId[key]) ||
                null;

              return (
                <div
                  key={note.id}
                  className="border rounded p-2 text-sm bg-white text-gray-900"
                >
                  <div>{note.note_content}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(note.created_at).toLocaleString()} by{" "}
                    {note.created_by || "Unknown"}
                    {meta ? (
                      <>
                        {" "}
                        ·{" "}
                        <span className="italic">
                          for {meta.title} on {meta.when}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {notes.length === 0 && (
              <div className="text-sm text-gray-500 bg-white border rounded p-2">
                No notes for this client yet.
              </div>
            )}
          </div>
        </div>

        {/* Optional full history view */}
        {showFullHistory && (
          <div className="border rounded p-2 bg-white">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">Full History</p>
              <button
                className="text-xs text-blue-600 underline"
                type="button"
                onClick={() => setShowFullHistory(false)}
              >
                Close
              </button>
            </div>
            <ClientHistoryFullScreen />
          </div>
        )}
      </div>
    </Modal>
  );
}
