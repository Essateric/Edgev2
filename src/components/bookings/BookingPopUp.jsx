import { useEffect, useMemo, useState } from "react";
import Modal from "../Modal";
import Button from "../Button";
import { format } from "date-fns";
import ClientNotesModal from "../clients/ClientNotesModal";
import { useAuth } from "../../contexts/AuthContext";
import { useSaveClientDOB } from "../hooks/useSaveClientDOB";
import { v4 as uuidv4 } from "uuid";
import SaveBookingsLog from "./SaveBookingsLog";

/* ---------- Money helpers ---------- */
const toNumber = (v) => {
  if (v == null) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const cleaned = String(v).replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};
const formatGBP = (v) => `£${toNumber(v).toFixed(2)}`;

/* ---------- Date helpers ---------- */
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const setHMS = (d, h, m, s = 0, ms = 0) => { const x = new Date(d); x.setHours(h, m, s, ms); return x; };
const clampDayInMonth = (y, m, day) => Math.min(day, daysInMonth(y, m));
const addMonthsPreserveDay = (base, add, dayOverride = null) => {
  const y = base.getFullYear(); const m = base.getMonth(); const d = dayOverride ?? base.getDate();
  const targetY = y + Math.floor((m + add) / 12); const targetM = (m + add) % 12;
  const dd = clampDayInMonth(targetY, targetM, d);
  const res = new Date(base); res.setFullYear(targetY, targetM, dd); return res;
};
const addYearsPreserveDay = (base, years) => {
  const y = base.getFullYear() + years; const m = base.getMonth();
  const d = clampDayInMonth(y, m, base.getDate()); const res = new Date(base);
  res.setFullYear(y, m, d); return res;
};

/* Hide processing rows from list/totals */
const isProcessingRow = (row) => {
  const cat = String(row?.category || "").toLowerCase();
  const title = String(row?.title || "").toLowerCase();
  return cat === "processing" || title.includes("processing time");
};

/* Timezone-safe helpers for timestamp w/o TZ storage (local wall-clock) */
const toLocalSQL = (d) => format(d, "yyyy-MM-dd HH:mm:ss");
const asLocalDate = (v) => {
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const s = v.includes("T") ? v : v.replace(" ", "T");
    return new Date(s);
  }
  return new Date(v);
};

/* ---------- Staff lookup helper (robust; avoids 400s on unknown columns) ---------- */
async function fetchStaffForCurrentUser(supabase) {
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) return null;
  const user = authData.user;

  const tryBy = async (column, value) => {
    try {
      const { data, error } = await supabase
        .from("staff")
        .select("id, name, email, permission")
        .eq(column, value)
        .maybeSingle();
      if (error || !data) return null;
      return data;
    } catch {
      return null;
    }
  };

  return (
    (await tryBy("auth_user_id", user.id)) ||
    (await tryBy("UID", user.id)) ||
    (await tryBy("uid", user.id)) ||
    (await tryBy("email", user.email))
  );
}

export default function BookingPopUp({
  isOpen,
  booking,
  onClose,
  onEdit,
  onDeleteSuccess,
  stylistList = [],
  clients = [],
}) {
  const [showActions, setShowActions] = useState(false);
  const [relatedBookings, setRelatedBookings] = useState([]);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [isEditingDob, setIsEditingDob] = useState(false);

  // Notes for this booking/client
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);

  // Optional: resolved current staff (to pass down to notes modal)
  const [currentStaff, setCurrentStaff] = useState(null);

  // Load client if missing from props
  const [clientRow, setClientRow] = useState(null);
  const [clientLoading, setClientLoading] = useState(false);
  const [clientError, setClientError] = useState("");

  // Repeat modal state
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [repeatPattern, setRepeatPattern] = useState("weekly");
  const [repeatCount, setRepeatCount] = useState(6);
  const [repeatDayOfMonth, setRepeatDayOfMonth] = useState(
    booking?.start ? asLocalDate(booking.start).getDate() : 1
  );

  const { supabaseClient } = useAuth();

  // Saves clients.dob (DATE)
  const { dobInput, setDobInput, savingDOB, dobError, saveDOB } =
    useSaveClientDOB();

  // Try from props first
  const clientFromList = clients.find((c) => c.id === booking?.client_id);
  const client = clientFromList || clientRow || null;

  // Fetch client if not provided via props
  useEffect(() => {
    let active = true;
    (async () => {
      setClientError("");
      if (!isOpen || !booking?.client_id) return;
      if (clientFromList) { setClientRow(null); return; }
      try {
        setClientLoading(true);
        const { data, error } = await supabaseClient
          .from("clients")
          .select("id, first_name, last_name, email, mobile, dob")
          .eq("id", booking.client_id)
          .maybeSingle();
        if (!active) return;
        if (error) throw error;
        setClientRow(data || null);
      } catch (e) {
        if (active) setClientError(e?.message || "Failed to load client.");
      } finally {
        if (active) setClientLoading(false);
      }
    })();
    return () => { active = false; };
  }, [isOpen, booking?.client_id, clientFromList, supabaseClient]);

  // Resolve current staff (robust; avoids /staff?uid=... 400s)
  useEffect(() => {
    let on = true;
    (async () => {
      if (!isOpen || !supabaseClient) return;
      const staff = await fetchStaffForCurrentUser(supabaseClient);
      if (on) setCurrentStaff(staff);
    })();
    return () => { on = false; };
  }, [isOpen, supabaseClient]);

  // Debug user (kept)
  useEffect(() => {
    let mounted = true;
    const checkUser = async () => {
      const { data: user, error } = await supabaseClient.auth.getUser();
      if (!mounted) return;
      if (error) console.error("❌ Supabase auth error:", error);
    };
    if (supabaseClient) checkUser();
    return () => { mounted = false; };
  }, [supabaseClient]);

  // Services for the booking group
  useEffect(() => {
    let active = true;
    const fetchRelatedBookings = async () => {
      if (!booking?.booking_id) return;
      const { data, error } = await supabaseClient
        .from("bookings")
        .select("*")
        .eq("booking_id", booking.booking_id);
      if (!active) return;
      if (error) console.error("Error fetching related bookings:", error);
      else setRelatedBookings(data || []);
    };
    if (supabaseClient && booking?.booking_id) fetchRelatedBookings();
    return () => { active = false; };
  }, [supabaseClient, booking?.booking_id]);

  // Load notes when popup opens and we know the client and related rows
  useEffect(() => {
    let on = true;
    (async () => {
      if (!isOpen || !client || !supabaseClient) return;
      setNotesLoading(true);
      try {
        // Fetch all notes for this client
        const { data, error } = await supabaseClient
          .from("client_notes")
          .select("id, client_id, booking_id, note_content, created_at, created_by")
          .eq("client_id", client.id)
          .order("created_at", { ascending: false });
        if (error) throw error;

        // If we know the booking group, prefer notes tied to any row in it.
        const groupIds = new Set((relatedBookings || []).map(r => r.id));
        const filtered = (data || []).filter(n => {
          // show notes explicitly attached to any row in this booking group
          if (n.booking_id && groupIds.has(n.booking_id)) return true;
          // also show general client notes (no booking_id)
          if (!n.booking_id) return true;
          return false;
        });
        if (on) setNotes(filtered);
      } catch (e) {
        console.error("[notes] fetch failed:", e?.message || e);
        if (on) setNotes([]);
      } finally {
        if (on) setNotesLoading(false);
      }
    })();
    return () => { on = false; };
  }, [isOpen, client, supabaseClient, relatedBookings]);

  // Seed DOB input when client ready
  useEffect(() => {
    if (!client) return;
    if (client?.dob) {
      const v = String(client.dob);
      setDobInput(v.includes("T") ? v.split("T")[0] : v);
    } else {
      setDobInput("");
    }
  }, [client, setDobInput]);

  /* ---------- Memos ---------- */
  const sortedAllServices = useMemo(() => {
    if (!Array.isArray(relatedBookings) || relatedBookings.length === 0) return [];
    return [...relatedBookings].sort((a, b) => asLocalDate(a.start) - asLocalDate(b.start));
  }, [relatedBookings]);

  const displayServices = useMemo(
    () => sortedAllServices.filter((s) => !isProcessingRow(s)),
    [sortedAllServices]
  );

  const blueprint = useMemo(() => {
    if (!sortedAllServices.length) return null;
    const baseStart = asLocalDate(sortedAllServices[0].start);
    const baseHour = baseStart.getHours();
    const baseMin = baseStart.getMinutes();
    const items = sortedAllServices.map((s) => {
      const sStart = asLocalDate(s.start);
      const sEnd = asLocalDate(s.end);
      const offsetMin = Math.round((sStart - baseStart) / 60000);
      const duration = Math.round((sEnd - sStart) / 60000);
      return {
        title: s.title,
        category: s.category || null,
        price: s.price ?? null,
        duration,
        offsetMin,
      };
    });
    return { baseStart, baseHour, baseMin, items };
  }, [sortedAllServices]);

  /* ---------- Render guards ---------- */
  if (!isOpen || !booking) return null;

  if (!client && clientLoading) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} className="w-full max-w-[440px]">
        <div className="p-4 text-sm text-gray-700">Loading client…</div>
      </Modal>
    );
  }

  if (!client && !clientLoading) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} className="w-full max-w-[440px]">
        <div className="p-4">
          <h2 className="text-lg font-bold text-rose-600">Client not found</h2>
          {clientError && <p className="text-sm text-red-600 mt-1">{clientError}</p>}
          <div className="mt-3">
            <Button onClick={onClose} className="bg-orange-500 text-white">Close</Button>
          </div>
        </div>
      </Modal>
    );
  }

  const clientName = `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim() || "Client";
  const clientPhone = client.mobile || "N/A";
  const displayDob = dobInput ? format(new Date(`${dobInput}T00:00:00`), "do MMM") : "DOB not set";
  const serviceTotal = displayServices.reduce((sum, s) => sum + toNumber(s.price), 0);
  const stylist = stylistList.find((s) => s.id === booking.resource_id);

  // ONLINE BADGE: show if current row or any group row is public
  const isOnline =
    booking?.source === "public" ||
    (Array.isArray(relatedBookings) && relatedBookings.some(r => r.source === "public"));

  const handleCancelBooking = async () => {
    const confirmDelete = window.confirm("Are you sure you want to cancel this booking?");
    if (!confirmDelete) return;
    try {
      const { error } = await supabaseClient.from("bookings").delete().eq("id", booking.id);
      if (error) { console.error("Failed to delete booking:", error); alert("Something went wrong."); }
      else { onDeleteSuccess?.(booking.id); onClose(); }
    } catch (err) {
      console.error("Failed to cancel booking:", err);
      alert("Something went wrong. Please try again.");
    }
  };

  const handleSaveDOBClick = async () => {
    if (!dobInput) { alert("Please pick a date before saving!"); return; }
    const res = await saveDOB({ clientId: client.id, dob: dobInput });
    if (res.ok) { alert("DOB updated!"); setIsEditingDob(false); }
    else { alert("Supabase error: " + (res.error?.message || "Failed to save DOB")); }
  };

  /* ---------- Optional: safe note insert you can pass to ClientNotesModal ---------- */
  const handleAddNoteSafe = async ({ clientId, noteText, bookingId }) => {
    const text = (noteText || "").trim();
    if (!text) return { ok: false, error: { message: "Empty note" } };

    const { data: authData } = await supabaseClient.auth.getUser();
    const staff = currentStaff; // already resolved above

    const payload = {
      client_id: clientId,
      note_content: text,
      booking_id: bookingId ?? null,
      created_by: staff?.name || staff?.email || authData?.user?.email || "unknown"
    };

    const { data, error } = await supabaseClient
      .from("client_notes")
      .insert(payload)
      .select()
      .single();

    if (error) return { ok: false, error };
    return { ok: true, data };
  };

  /* ---------- Repeat logic ---------- */
  const patternLabel = (p) => {
    switch (p) {
      case "weekly": return "Weekly";
      case "fortnightly": return "Fortnightly";
      case "monthly": return "Monthly";
      case "yearly": return "Yearly";
      case "monthly_nth_day": return `Monthly (day ${repeatDayOfMonth})`;
      default: return p;
    }
  };

  const generateOccurrenceBase = (index) => {
    const base = blueprint?.baseStart ?? asLocalDate(booking.start);
    const h = blueprint?.baseHour ?? asLocalDate(booking.start).getHours();
    const m = blueprint?.baseMin ?? asLocalDate(booking.start).getMinutes();
    switch (repeatPattern) {
      case "weekly": return setHMS(addDays(base, 7 * (index + 1)), h, m);
      case "fortnightly": return setHMS(addDays(base, 14 * (index + 1)), h, m);
      case "monthly": return setHMS(addMonthsPreserveDay(base, index + 1), h, m);
      case "yearly": return setHMS(addYearsPreserveDay(base, index + 1), h, m);
      case "monthly_nth_day": {
        const nextMonth = addMonthsPreserveDay(base, index + 1, repeatDayOfMonth);
        return setHMS(nextMonth, h, m);
      }
      default: return setHMS(addDays(base, 7 * (index + 1)), h, m);
    }
  };

  const createRepeatSet = async () => {
    if (!blueprint || !stylist) { alert("Missing service blueprint or stylist."); return; }
    const created = []; const skipped = [];
    for (let i = 0; i < Math.max(1, Number(repeatCount) || 0); i++) {
      const occBase = generateOccurrenceBase(i);

      // overlap check (start < newEnd AND end > newStart)
      let conflict = false;
      for (const item of blueprint.items) {
        const sStart = new Date(occBase.getTime() + item.offsetMin * 60000);
        const sEnd = new Date(sStart.getTime() + item.duration * 60000);
        const { data: overlaps, error: overlapErr } = await supabaseClient
          .from("bookings").select("id")
          .eq("resource_id", booking.resource_id)
          .lt("start", toLocalSQL(sEnd))
          .gt("end", toLocalSQL(sStart));
        if (overlapErr || (overlaps?.length)) { conflict = true; break; }
      }
      if (conflict) { skipped.push(occBase); continue; }

      // create rows (local wall-clock SQL strings)
      const newBookingId = uuidv4();
      const rows = blueprint.items.map((item) => {
        const sStart = new Date(occBase.getTime() + item.offsetMin * 60000);
        const sEnd = new Date(sStart.getTime() + item.duration * 60000);
        return {
          booking_id: newBookingId,
          client_id: booking.client_id,
          client_name: booking.client_name,
          resource_id: booking.resource_id,
          start: toLocalSQL(sStart),
          end: toLocalSQL(sEnd),
          title: item.title,
          price: item.price,
          duration: item.duration,
          category: item.category,
          status: "confirmed",
          // optionally: source: 'calendar' (kept implicit; trigger can set this)
        };
      });

      const { data: inserted, error: insErr } = await supabaseClient
        .from("bookings").insert(rows).select("*");
      if (insErr) { skipped.push(occBase); continue; }
      created.push({ when: occBase, rows: inserted });

      try {
        const firstItem = blueprint.items[0];
        await SaveBookingsLog({
          action: "created",
          booking_id: newBookingId,
          client_id: booking.client_id,
          client_name: booking.client_name,
          stylist_id: booking.resource_id,
          stylist_name: stylist?.title || stylist?.name || "Unknown",
          service: {
            name: firstItem.title, category: firstItem.category,
            price: firstItem.price, duration: firstItem.duration,
          },
          start: rows[0].start, end: rows[0].end,
          logged_by: null, reason: `Repeat Booking: ${patternLabel(repeatPattern)}`,
          before_snapshot: null, after_snapshot: rows[0],
        });
      } catch (e) { /* non-fatal if log write fails */ }
    }
    setRepeatOpen(false);
    const msg = [
      `${created.length} repeat ${created.length === 1 ? "booking" : "bookings"} created.`,
      skipped.length ? `${skipped.length} skipped due to conflicts.` : "",
    ].filter(Boolean).join(" ");
    alert(msg || "Done.");
    window.dispatchEvent(new CustomEvent("bookings:changed", { detail: { type: "repeat-created" } }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} hideCloseIcon className="w-full max-w-[440px]">
      {/* HEADER / CLIENT INFO */}
      <div className="flex justify-between items-start mb-2">
        <div>
          <h2 className="text-lg font-bold text-rose-600">{clientName}</h2>
          <p className="text-sm text-gray-700">📞 {clientPhone}</p>

          {isOnline && (
            <span className="inline-block mt-1 text-[11px] px-2 py-0.5 rounded bg-emerald-600/15 text-emerald-700 border border-emerald-700/30">
              Online
            </span>
          )}

          <div className="text-sm text-gray-700 flex items-center gap-2 mt-1">
            🎂{" "}
            {isEditingDob ? (
              <>
                <input
                  type="date"
                  value={dobInput || ""}
                  onChange={(e) => setDobInput(e.target.value)}
                  className="border p-1 text-sm"
                />
                <Button onClick={handleSaveDOBClick} className="text-xs" disabled={!dobInput || savingDOB}>
                  {savingDOB ? "Saving..." : "Save"}
                </Button>
                <Button onClick={() => setIsEditingDob(false)} className="text-xs">Cancel</Button>
              </>
            ) : (
              <>
                <span>{displayDob}</span>
                <button onClick={() => setIsEditingDob(true)} className="text-xs text-blue-600 underline">
                  Edit
                </button>
              </>
            )}
          </div>
          {dobError && <p className="text-xs text-red-600 mt-1">{dobError}</p>}
        </div>

        <Button onClick={() => setShowNotesModal(true)} className="text-sm">
          View Details
        </Button>
      </div>

      {/* SERVICES */}
      <div className="mt-4">
        <p className="text-md font-semibold text-gray-800 mb-1">Services</p>
        {displayServices.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No services found.</p>
        ) : (
          <div className="space-y-1">
            {displayServices.map((service, index) => {
              const startTime = asLocalDate(service.start);
              const formattedTime = !isNaN(startTime) ? format(startTime, "HH:mm") : "--:--";
              return (
                <div key={index} className="flex flex-col text-sm text-gray-700 border-b py-1">
                  <div className="flex justify-between items-center">
                    <span className="w-1/4">{formattedTime}</span>
                    <span className="w-2/4 font-medium">
                      {service.category || "Uncategorised"}: {service.title || ""}
                    </span>
                    <span className="w-1/4 text-right">{formatGBP(service.price)}</span>
                  </div>
                  {service.notes && (
                    <div className="text-xs text-gray-500 italic mt-1">Notes: {service.notes}</div>
                  )}
                </div>
              );
            })}
            <div className="flex justify-between items-center pt-2 border-t mt-2 text-sm text-gray-800">
              <span className="w-3/4 text-right font-semibold">Total</span>
              <span className="w-1/4 text-right font-semibold text-gray-900">
                {formatGBP(serviceTotal)}
              </span>
            </div>
          </div>
        )}
      </div>
     {/* BUTTON ROW */}
      <div className="mt-4 flex flex-wrap gap-2 items-center">
        <span className="text-sm text-green-700 font-semibold">Confirmed</span>

        <button className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded">Arrived</button>
        <button className="bg-gray-500 text-white px-3 py-1 rounded">Checkout</button>

        <button onClick={() => setRepeatOpen(true)} className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded">
          Repeat bookings
        </button>

        <button onClick={() => setShowActions(true)} className="bg-gray-200 text-gray-800 px-3 py-1 rounded">
          &#x2022;&#x2022;&#x2022;
        </button>
        <button onClick={onClose} className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 rounded">
          Close
        </button>
      </div>

      {/* ACTIONS POPOVER */}
      {showActions && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 w-full max-w-xs shadow-md space-y-2">
            <button className="block w-full text-left hover:bg-gray-100 p-2 rounded">No show</button>
            <button className="block w-full text-left hover:bg-gray-100 p-2 rounded">Awaiting review</button>
            <button className="block w-full text-left hover:bg-gray-100 p-2 rounded">Rebook</button>
            <button onClick={onEdit} className="block w-full text-left hover:bg-gray-100 p-2 rounded">Edit</button>
            <button
              onClick={handleCancelBooking}
              className="block w-full text-left text-red-600 hover:bg-red-100 p-2 rounded"
            >
              Cancel
            </button>
            <button onClick={() => setShowActions(false)} className="mt-2 w-full bg-gray-200 text-gray-700 py-1 rounded">
              Close
            </button>
          </div>
        </div>
      )}

      {/* NOTES MODAL */}
      {showNotesModal && (
        <ClientNotesModal
          clientId={client.id}
          bookingId={booking?.id}
          isOpen={showNotesModal}
          onClose={() => setShowNotesModal(false)}
          /* Optional goodies to avoid 400s inside the modal: */
          staffContext={currentStaff || null}
          onAddNote={handleAddNoteSafe}
          onAfterChange={async () => {
            try {
              const { data } = await supabaseClient
                .from("client_notes")
                .select("id, client_id, booking_id, note_content, created_at, created_by")
                .eq("client_id", client.id)
                .order("created_at", { ascending: false });
              const groupIds = new Set((relatedBookings || []).map(r => r.id));
              const filtered = (data || []).filter(n => !n.booking_id || groupIds.has(n.booking_id));
              setNotes(filtered);
            } catch {}
          }}
        />
      )}

      {/* REPEAT MODAL */}
      {repeatOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg p-4 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Repeat bookings</h3>

            <div className="grid grid-cols-1 gap-3">
              <label className="text-sm text-gray-700">
                Pattern
                <select
                  className="block w-full border rounded px-2 py-1 mt-1"
                  value={repeatPattern}
                  onChange={(e) => setRepeatPattern(e.target.value)}
                >
                  <option value="weekly">Weekly</option>
                  <option value="fortnightly">Fortnightly</option>
                  <option value="monthly">Monthly (same date)</option>
                  <option value="monthly_nth_day">Monthly (choose day)</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>

              {repeatPattern === "monthly_nth_day" && (
                <label className="text-sm text-gray-700">
                  Day of month (1–31)
                  <input
                    type="number"
                    min={1}
                    max={31}
                    className="block w-full border rounded px-2 py-1 mt-1"
                    value={repeatDayOfMonth}
                    onChange={(e) =>
                      setRepeatDayOfMonth(Math.max(1, Math.min(31, Number(e.target.value) || 1)))
                    }
                  />
                </label>
              )}

              <label className="text-sm text-gray-700">
                Number of future occurrences
                <input
                  type="number"
                  min={1}
                  max={52}
                  className="block w-full border rounded px-2 py-1 mt-1"
                  value={repeatCount}
                  onChange={(e) =>
                    setRepeatCount(Math.max(1, Math.min(52, Number(e.target.value) || 1)))
                  }
                />
              </label>

              {blueprint && (
                <p className="text-xs text-gray-600">
                  First new booking will be on{" "}
                  <b>{format(generateOccurrenceBase(0), "eee dd MMM yyyy, HH:mm")}</b>
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button onClick={() => setRepeatOpen(false)} className="bg-gray-200 text-gray-800">
                Cancel
              </Button>
              <Button onClick={createRepeatSet} className="bg-purple-600 text-white hover:bg-purple-700">
                Create
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
