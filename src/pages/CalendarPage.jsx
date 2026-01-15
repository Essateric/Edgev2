// src/pages/CalendarPage.jsx
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay } from "date-fns";
import enGB from "date-fns/locale/en-GB";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";



import CalendarModal from "../components/CalendarModal";
import BookingPopUp from "../components/bookings/BookingPopUp";
import RightDrawer from "../components/RightDrawer";
import CustomCalendarEvent from "../components/CustomCalendarEvent";
import SelectClientModal from "../components/clients/SelectClientModal.jsx";
import SelectClientModalStaff from "../components/clients/SelectClientModalStaff.jsx";
import ReviewModal from "../components/ReviewModal";
import NewBooking from "../components/bookings/NewBooking";
import ScheduleTaskModal from "../components/ScheduleTaskModal.jsx";

import useUnavailableTimeBlocks from "../components/UnavailableTimeBlocks";
import UseSalonClosedBlocks from "../components/UseSalonClosedBlocks";
import useAddGridTimeLabels from "../utils/AddGridTimeLabels";

import baseSupabase from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import useTaskScheduler from "../components/hooks/useTaskScheduler";

import { v4 as uuidv4 } from "uuid";
import { addWeeks, addMonths } from "date-fns";
import { logEvent } from "../lib/logEvent";



import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import "../styles/CalendarStyles.css";
import PageLoader from "../components/PageLoader.jsx";
import RemindersDialog from "../components/reminders/RemindersDialog.jsx";

const DnDCalendar = withDragAndDrop(Calendar);

const locales = { "en-GB": enGB };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date()),
  getDay,
  locales,
});

/* ----------------- small date helpers ----------------- */

const CLIENT_SELECT = "id, first_name, last_name, mobile, email, notes, dob, created_at";
const CLIENT_PAGE_SIZE = 1000;

async function fetchAllClientsPaged(supabase) {
  let all = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("clients")
      .select(CLIENT_SELECT)
      .order("created_at", { ascending: false })
      .range(from, from + CLIENT_PAGE_SIZE - 1);

    if (error) throw error;

    const batch = data ?? [];
    all = all.concat(batch);

    if (batch.length < CLIENT_PAGE_SIZE) break;
    from += CLIENT_PAGE_SIZE;
  }

  return all;
}


// keep times as local wall-clock and guarantee at least 1 minute
const toLocal = (d) => {
  const x = new Date(d);
  return new Date(
    x.getFullYear(),
    x.getMonth(),
    x.getDate(),
    x.getHours(),
    x.getMinutes(),
    0,
    0
  );
};

const clampRange = (start, end) => {
  const s = toLocal(start);
  let e = toLocal(end);
  if (!(e > s)) e = new Date(s.getTime() + 60 * 1000); // ≥ 1 minute
  return { start: s, end: e };
};

const toDate = (v) => (v instanceof Date ? v : new Date(v));

// Defensive cancelled check (handles "cancelled", "canceled", whitespace, case)
const isCancelledStatus = (status) => {
  const s = String(status || "").trim().toLowerCase();
  return (
    s === "cancelled" ||
    s === "canceled" ||
    s.startsWith("cancel") ||
    s.includes("cancelled") || // client_cancelled, etc.
    s.includes("canceled")
  );
};

const isScheduleBlockEvent = (ev) => {
  if (!ev) return false;

  if (ev.isScheduleBlock || ev.isScheduledTask) return true;

  const status = String(ev.status || "").trim().toLowerCase();
  const hasNoClient = ev.client_id === null || ev.client_id === undefined || ev.client_id === "";

  return status === "blocked" && hasNoClient;
};
const mapScheduleBlockRowToEvent = (row, staffList = []) => {
  if (!row) return null;
  const stylistRow = staffList.find((s) => s.id === row.staff_id);
  const taskTypeName =
    row?.schedule_task_types?.name || row?.task_type_name || "Scheduled task";

  return {
    ...row,
    id: row.id,
    start: new Date(row.start),
    end: new Date(row.end),
    resourceId: row.staff_id,
    staff_id: row.staff_id,
    stylistName: stylistRow?.name || stylistRow?.title || "Unknown Stylist",
    title: taskTypeName,
    isScheduleBlock: true,
    isScheduledTask: true,
    blockSource: "schedule_blocks",
  };
};


const isConfirmedStatus = (status) => {
  const s = String(status || "").trim().toLowerCase();
  return s === "confirmed" || s.startsWith("confirm") || s.includes("confirmed");
};

export default function CalendarPage() {
   const navigate = useNavigate();              // ✅ ADD THIS
  const [bootingOut, setBootingOut] = useState(false); // ✅ ADD THIS

    const auth = useAuth();
  const { currentUser, pageLoading, authLoading, supabaseClient } = auth;

  const supabase = supabaseClient;
  const hasUser = !!currentUser;

  const isAdmin =
    String(currentUser?.permission || "").trim().toLowerCase() === "admin";
  const [stylistList, setStylistList] = useState([]);



// ✅ Option 2: force logout + redirect if session/client missing
useEffect(() => {
  if (authLoading) return;

  // If no session or no user, kick out to login
  if (!supabaseClient || !currentUser) {
    setBootingOut(true);

    baseSupabase.auth.signOut().finally(() => {
      navigate("/login", { replace: true });
    });
  }
}, [authLoading, supabaseClient, currentUser, navigate]);

// While we are logging out + redirecting
if (bootingOut) return <PageLoader />;


  const [clients, setClients] = useState([]);
  const [events, setEvents] = useState([]);
  const {
    taskEvents,
    taskSaving,
    taskError,
  } = useTaskScheduler({ supabase, stylistList });

  const [dbg, setDbg] = useState({});
  const dbgLog = (k, v = true) => {
    const payload = {
      ...(typeof v === "object" ? v : {}),
      t: new Date().toISOString(),
    };
    setDbg((prev) => ({ ...prev, [k]: payload }));
    console.log("[CALDBG]", k, payload);
  };

  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectedClient, setSelectedClient] = useState("");
  const [clientObj, setClientObj] = useState(null);
  const [basket, setBasket] = useState([]);
const [bookingTagId, setBookingTagId] = useState(null);
  const [step, setStep] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);

  const [visibleDate, setVisibleDate] = useState(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const [loading, setLoading] = useState(true); // data fetch in progress
  const [ready, setReady] = useState(false); // calendar is allowed to render
   // Add subtle quarter-hour labels to each calendar grid cell (rerun when calendar renders/navigates)
  useAddGridTimeLabels(9, 20, 15, [ready, visibleDate]);
  const [showReminders, setShowReminders] = useState(false);
  const [errText, setErrText] = useState("");
  const [reviewData, setReviewData] = useState(null);
  const [scheduledTasks, setScheduledTasks] = useState([]);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskDraft, setTaskDraft] = useState(null);
    const unavailableBlocks = useUnavailableTimeBlocks(stylistList, visibleDate);
  const salonClosedBlocks = UseSalonClosedBlocks(stylistList, visibleDate);
  const [bookingTags, setBookingTags] = useState([]);

useEffect(() => {
  if (!supabase) return;

  (async () => {
    const { data, error } = await supabase
      .from("booking_tags")
      .select("id, code, label, is_active")
      .eq("is_active", true)
      .order("label", { ascending: true });

    if (error) {
      console.warn("[CalendarPage] failed to load booking tags", error);
      setBookingTags([]);
    } else {
      setBookingTags(data || []);
    }
  })();
}, [supabase]);

const tagCodeById = useMemo(() => {
  const m = new Map();
  (bookingTags || []).forEach((t) => {
    if (t?.id) m.set(t.id, t.code || t.label || "");
  });
  return m;
}, [bookingTags]);

const mapBookingRowToEvent = useCallback(
  (b, fallbackConfirmed = false) => {
    const stylistRow = stylistList.find((s) => s.id === b.resource_id);
    const start = b.start ?? b.start_time;
    const end = b.end ?? b.end_time;

    const isScheduleBlock =
      String(b?.status || "").toLowerCase() === "blocked" && !b?.client_id;

    const confirmed_via_reminder = Boolean(
      fallbackConfirmed || b?.confirmed_via_reminder
    );

    const tagCode = b?.booking_tag_id ? (tagCodeById.get(b.booking_tag_id) || null) : null;

    return {
      ...b,
      start: new Date(start),
      end: new Date(end),
      resourceId: b.resource_id,
      stylistName: stylistRow?.title || "Unknown Stylist",
      title: b.title || (isScheduleBlock ? "Blocked" : "No Service Name"),
      confirmed_via_reminder,
      isScheduleBlock,
      blockSource: "bookings",
      booking_tag_code: tagCode, // ✅ IMPORTANT
    };
  },
  [stylistList, tagCodeById] // ✅ IMPORTANT
);

useEffect(() => {
  if (!tagCodeById || tagCodeById.size === 0) return;

  setEvents((prev) =>
    (prev || []).map((ev) => {
      const tid = ev?.booking_tag_id || null;
      const code = tid ? (tagCodeById.get(tid) || null) : null;

      // don't rerender if no change
      if ((ev?.booking_tag_code || null) === code) return ev;

      return { ...ev, booking_tag_code: code };
    })
  );
}, [tagCodeById]);



  const selectedClientRow = useMemo(() => {
     return [
      ...(events || []),
      ...scheduledTasks,
      ...unavailableBlocks,
      ...salonClosedBlocks,
    ];
  }, [events, scheduledTasks, unavailableBlocks, salonClosedBlocks]);

  const newBookingExtendedProps = useMemo(() => {
    return {
      client_email: selectedClientRow?.email ?? null,
      client_mobile: selectedClientRow?.mobile ?? null,
      client_first_name: selectedClientRow?.first_name ?? null,
      client_last_name: selectedClientRow?.last_name ?? null,
    };
  }, [selectedClientRow]);



  // ✅ Include cancelled in view (we color them red below)
  const calendarEvents = useMemo(() => {
    return [
      ...(events || []),
      ...(taskEvents || []),
      ...(scheduledTasks || []),
      ...unavailableBlocks,
      ...salonClosedBlocks,
    ];
  }, [events, scheduledTasks, taskEvents, unavailableBlocks, salonClosedBlocks]);


  const coerceEventForPopup = (ev) => {
    const rid = ev.resource_id ?? ev.resourceId ?? ev.stylist_id ?? null;
    const stylist = stylistList.find((s) => s.id === rid);
    return {
      ...ev,
      start: toDate(ev.start),
      end: toDate(ev.end),
      resource_id: rid,
      resourceId: rid,
      title: ev.title || "No Service Name",
      stylistName:
        ev.stylistName || stylist?.title || "Unknown Stylist",
    };
  };

  const stylist = stylistList.find((s) => s.id === selectedSlot?.resourceId);

  const bookingTitle = selectedSlot
    ? `Booking for ${
        clientObj
          ? clientObj.first_name + " " + clientObj.last_name
          : "Unknown Client"
      } • ${format(selectedSlot.start, "eeee dd MMM yyyy")} ${format(
        selectedSlot.start,
        "HH:mm"
      )} - ${format(selectedSlot.end, "HH:mm")} • Stylist: ${
        stylist?.title ?? ""
      }`
    : "Booking";

  // ✅ StrictMode-safe: only the latest run is allowed to set state
  const runIdRef = useRef(0);

  useEffect(() => {
    const hasUserLocal = !!currentUser;

    dbgLog("effect:mount/update", {
      hasUser: hasUserLocal,
      authLoading,
      userId: currentUser?.id ?? null,
      hasToken: !!currentUser?.token,
    });

    if (!hasUserLocal) {
      dbgLog("effect: early exit", { hasUserLocal });
      setLoading(false);
      setReady(false);
      return;
    }

    const runId = ++runIdRef.current;

    const fetchData = async () => {
      dbgLog("effect: will run fetchData", { runId });

      setLoading(true);
      setErrText("");
      setReady(false);
      dbgLog("fetchData: start", { runId });

      try {
        // ---------- STAFF ----------
        dbgLog("staff query: BEFORE", { runId });
        const { data: staffData, error: sErr } = await supabase
          .from("staff")
          .select("*")
          .order("created_at", { ascending: true });
        dbgLog("staff query: AFTER", {
          runId,
          error: sErr ? sErr.message : null,
          count: staffData?.length ?? 0,
        });
        if (sErr) throw sErr;

        // ---------- CLIENTS ----------
        dbgLog("clients query: BEFORE", { runId });
      const { data: clientsData, error: cErr } = await supabase
  .from("clients")
  .select("id, first_name, last_name, mobile, email, notes, dob, created_at")
  .order("created_at", { ascending: false })
  .range(0, 999);

        dbgLog("clients query: AFTER", {
          runId,
          error: cErr ? cErr.message : null,
          count: clientsData?.length ?? 0,
        });
        if (cErr) throw cErr;

        // ---------- BOOKINGS ----------
        dbgLog("bookings query: BEFORE", { runId });
        const { data: bookingsData, error: bErr } = await supabase
          .from("bookings")
          .select("*");
        dbgLog("bookings query: AFTER", {
          runId,
          error: bErr ? bErr.message : null,
          count: bookingsData?.length ?? 0,
        });
        if (bErr) throw bErr;

        // ---------- SCHEDULE BLOCKS ----------
dbgLog("schedule blocks query: BEFORE", { runId });
const { data: scheduleBlocksData, error: sbErr } = await supabase
  .from("schedule_blocks")
  .select("*, schedule_task_types ( id, name, category )")
  .eq("is_active", true);
dbgLog("schedule blocks query: AFTER", {
  runId,
  error: sbErr ? sbErr.message : null,
  count: scheduleBlocksData?.length ?? 0,
});
if (sbErr) throw sbErr;

        // ✅ If a newer fetch started, ignore this one
        if (runId !== runIdRef.current) {
          dbgLog("fetchData: stale run -> skipping setState", { runId });
          return;
        }

        const staff = staffData || [];

        setClients(clientsData || []);
        setStylistList(
          staff.map((s) => ({
            id: s.id,
            title: s.name,
            name: s.name,
            email: s.email,
            weeklyHours: s.weekly_hours || {},
          }))
        );

     setEvents(
  (bookingsData || []).map((b) => {
    const stylistRow = staff.find((s) => s.id === b.resource_id);
    const start = b.start ?? b.start_time;
    const end = b.end ?? b.end_time;

    const isScheduleBlock =
      String(b?.status || "").toLowerCase() === "blocked" && !b?.client_id;
      const tagCode = b?.booking_tag_id ? tagCodeById.get(b.booking_tag_id) : null;

    return {
      ...b,
      start: new Date(start),
      end: new Date(end),
      resourceId: b.resource_id,
      stylistName: stylistRow?.name || "Unknown Stylist",
      title: b.title || (isScheduleBlock ? "Blocked" : "No Service Name"),
      isScheduleBlock, // ✅ IMPORTANT
      booking_tag_code: tagCode,
    };
  })
);

 setScheduledTasks(
          (scheduleBlocksData || [])
            .map((b) => mapScheduleBlockRowToEvent(b, staff))
            .filter(Boolean)
        );

        dbgLog("fetchData: end of try block", { runId });
      } catch (error) {
        console.error("[CALDBG] fetchData: ERROR", error);

        if (runId === runIdRef.current) {
          setErrText(error?.message || "Failed to load calendar data");
        }
      } finally {
        if (runId === runIdRef.current) {
          dbgLog("fetchData: finally → setLoading(false), setReady(true)", {
            runId,
          });
          setLoading(false);
          setReady(true);
        } else {
          dbgLog("fetchData: finally but stale run", { runId });
        }
      }
    };

    fetchData();

    return () => {
      dbgLog("effect cleanup", { runId });
    };
}, [currentUser?.id, supabase, tagCodeById]);


  useEffect(() => {
    if (!supabase) return undefined;

    const channel = supabase
      .channel("clients-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clients" },
        (payload) => {
          setClients((prev = []) => {
            const row = payload.new || payload.old;
            if (!row?.id) return prev;

            if (payload.eventType === "DELETE") {
              return prev.filter((c) => c.id !== row.id);
            }

            const exists = prev.some((c) => c.id === row.id);
            const merged = {
              ...(prev.find((c) => c.id === row.id) || {}),
              ...row,
            };

            return exists
              ? prev.map((c) => (c.id === row.id ? merged : c))
               : [row, ...prev];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);


  useEffect(() => {
    if (!currentUser?.id) return;
    if (!supabase) return;

    const fetchLatestConfirmation = async (bookingRow) => {
      // Check the specific row plus any sibling rows in the same booking block.
      const idsToCheck = new Set([bookingRow?.id].filter(Boolean));

      if (bookingRow?.booking_id) {
        try {
          const { data: groupRows, error: groupErr } = await supabase
            .from("bookings")
            .select("id")
            .eq("booking_id", bookingRow.booking_id);

          if (groupErr) throw groupErr;
          for (const r of groupRows || []) {
            if (r?.id) idsToCheck.add(r.id);
          }
        } catch (e) {
          console.warn("[Calendar] failed to load booking group ids", e?.message);
        }
      }

      if (!idsToCheck.size) return null;

      const idsArray = Array.from(idsToCheck);

      const { data, error } = await supabase
        .from("booking_confirmations")
        .select("response, responded_at, booking_id")
        .in("booking_id", idsArray)
        .order("responded_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      const confirmedFromReply = !!(
        data?.responded_at &&
        String(data?.response || "").toLowerCase().startsWith("confirm")
      );

      return { confirmedFromReply, idsArray };
    };

    const refreshBookingBlock = async (bookingRowId) => {
      if (!bookingRowId) return;

      try {
        const { data: primary, error: primaryErr } = await supabase
          .from("bookings")
          .select("*")
          .eq("id", bookingRowId)
          .maybeSingle();

        if (primaryErr) throw primaryErr;
        if (!primary) return;

        const rows = [primary];
        const ids = new Set([primary.id]);

        if (primary.booking_id) {
          const { data: siblings, error: siblingErr } = await supabase
            .from("bookings")
            .select("*")
            .eq("booking_id", primary.booking_id);

          if (siblingErr) throw siblingErr;
          for (const r of siblings || []) {
            if (r?.id && !ids.has(r.id)) {
              ids.add(r.id);
              rows.push(r);
            }
          }
        }

        let idsArray = Array.from(ids);
        let confirmedFromReply = false;

        try {
          const confirmation = await fetchLatestConfirmation(primary);
          if (confirmation) {
            confirmedFromReply = confirmation.confirmedFromReply;
            idsArray = confirmation.idsArray;
          }
        } catch (err) {
          console.warn("[Calendar] confirmation refresh failed", err?.message);
        }

        setEvents((prev) => {
          const mapped = rows.map((r) => mapBookingRowToEvent(r, confirmedFromReply));
          const idsSet = new Set(idsArray);
          const updated = prev.map((ev) =>
            idsSet.has(ev.id) || (primary.booking_id && ev.booking_id === primary.booking_id)
              ? {
                  ...ev,
                  ...(mapped.find((m) => m.id === ev.id) ||
                    mapped.find((m) => primary.booking_id && m.booking_id === ev.booking_id) ||
                    ev),
                  confirmed_via_reminder: confirmedFromReply,
                }
              : ev
          );

          for (const m of mapped) {
            if (!updated.some((u) => u.id === m.id)) {
              updated.push({ ...m, confirmed_via_reminder: confirmedFromReply });
            }
          }

          return updated;
        });
      } catch (err) {
        console.warn("[Calendar] failed to refresh booking block", err?.message);
      }
    };

    const channel = supabase
      .channel("realtime:bookings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldRow = payload.old;
            if (!oldRow?.id) return;
            setEvents((prev) => prev.filter((e) => e.id !== oldRow.id));
            return;
          }

          const row = payload.new;
          if (!row?.id) return;
  const applyRealtimeUpdate = async () => {
            setEvents((prev) => {
              const idx = prev.findIndex((e) => e.id === row.id);
              const mapped = mapBookingRowToEvent(
                row,
                idx !== -1 ? prev[idx]?.confirmed_via_reminder : false
              );

              if (idx === -1) return [...prev, mapped];

              const copy = prev.slice();
              copy[idx] = { ...copy[idx], ...mapped };
              return copy;
            });

            // Fetch latest confirmation state so delayed SMS replies still show green.
            try {
              const confirmation = await fetchLatestConfirmation(row);
              if (!confirmation) return;
              const { confirmedFromReply, idsArray } = confirmation;

              setEvents((prev) =>
                prev.map((e) =>
                  idsArray.includes(e.id) ||
                  (row.booking_id && e.booking_id && e.booking_id === row.booking_id)
                    ? { ...e, confirmed_via_reminder: confirmedFromReply }
                    : e
                )
              );
            } catch (err) {
              console.warn("[Calendar] failed to refresh reminder confirmation", err?.message);
            }
          };

            applyRealtimeUpdate();
        }
      )
      .subscribe();
       // Also listen for booking confirmation responses so long-lived tabs update automatically.
    const confirmationsChannel = supabase
      .channel("realtime:booking_confirmations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "booking_confirmations" },
        (payload) => {
          const bookingId = payload.new?.booking_id || payload.old?.booking_id;
          if (!bookingId) return;
          refreshBookingBlock(bookingId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(confirmationsChannel);
    };
 }, [supabase, currentUser?.id, stylistList, mapBookingRowToEvent]);


  const moveEvent = useCallback(
    async ({ event, start, end, resourceId }) => {
      const { start: s, end: e } = clampRange(start, end);

      if (event?.is_locked) return;
      if (isCancelledStatus(event?.status)) return; // ✅ don't move cancelled
       // ✅ Prevent "task events" (non-bookings) from being updated as bookings by mistake
     if (event?.isTask) return;

  if (event?.isScheduleBlock && event?.blockSource === "schedule_blocks") {
        let { start: s, end: e } = clampRange(start, end);
        const rid = resourceId ?? event.resourceId;
          const previousStaffId = event.staff_id || event.resourceId || null;
        const previousWindow = getStaffWorkingWindow(
          previousStaffId,
          event.start,
          stylistList
        );
        const isAllDayWindow =
          !!previousWindow &&
          event.start.getTime() === previousWindow.start.getTime() &&
          event.end.getTime() === previousWindow.end.getTime();

        if (isAllDayWindow) {
          const targetWindow = getStaffWorkingWindow(rid, s, stylistList);
          if (!targetWindow) {
            toast.error("No working hours found for that staff member.");
            return;
          }
          s = targetWindow.start;
          e = targetWindow.end;
        }

        setScheduledTasks((prev) =>
          prev.map((ev) =>
            ev.id === event.id
              ? {
                  ...ev,
                  start: s,
                  end: e,
                  resourceId: rid,
                  staff_id: rid,
                  stylistName: stylistList.find((s1) => s1.id === rid)?.title || ev.stylistName,
                }
              : ev
          )
        );
         try {
          await supabase
            .from("schedule_blocks")
            .update({
              start: s.toISOString(),
              end: e.toISOString(),
              staff_id: rid,
            })
            .eq("id", event.id);
        } catch (error) {
          console.error("❌ Failed to move schedule block:", error);
        }
        return;
      }

      const rid = resourceId ?? event.resourceId;

      const newDuration = (e.getTime() - s.getTime()) / 60000;

      if (event?.isScheduleBlock && newDuration > 12 * 60) {
        toast.error("Blocks can’t be longer than 12 hours.");
        return;
      }

      const updated = {
        ...event,
        start: s,
        end: e,
        resourceId: rid,
        resource_id: rid,
        duration: newDuration,
        stylistName:
          stylistList.find((s1) => s1.id === rid)?.title || "Unknown",
        allDay: false,
      };

      setEvents((prev) => prev.map((ev) => (ev.id === event.id ? updated : ev)));

      try {
        await supabase
          .from("bookings")
          .update({
            start: s,
            end: e,
             start: s.toISOString(),
           end: e.toISOString(),
            resource_id: rid,
            resource_id: rid,
            duration: newDuration,
          })
          .eq("id", event.id);
      } catch (error) {
        console.error("❌ Failed to move booking:", error);
      }
    },
   [stylistList, supabase]
  );

  const handleCancelBookingFlow = useCallback(() => {
    setIsModalOpen(false);
    setSelectedSlot(null);
    setSelectedClient("");
    setClientObj(null);
     setBookingTagId(null);
    setBasket([]);
    setReviewData(null);
    setStep(1);
 }, []);

const handleOpenScheduleTask = (slot, editingTask = null) => {
    setIsModalOpen(false);
    setTaskDraft({
      slot: slot || selectedSlot,
       editingTask,
    });
    setTaskModalOpen(true);
  };

  const handleCloseTaskModal = () => {
    setTaskModalOpen(false);
    setTaskDraft(null);
  };

const buildOccurrences = ({ start, end, repeatRule, occurrences }) => {
  const out = [];
  const count = Math.max(1, Math.min(52, Number(occurrences) || 1));

  const durMs = end.getTime() - start.getTime();

  for (let i = 0; i < count; i++) {
    let s = new Date(start);
    if (repeatRule === "weekly") s = addWeeks(s, i);
    if (repeatRule === "fortnightly") s = addWeeks(s, i * 2);
    if (repeatRule === "monthly") s = addMonths(s, i);

    const e = new Date(s.getTime() + durMs);
    out.push({ start: s, end: e });
  }

  return out;
};

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const getStaffWorkingWindow = (staffId, date, stylistList) => {
  if (!staffId || !date) return null;
  const staff = stylistList.find((s) => s.id === staffId);
  if (!staff) return null;
  const dayName = DAY_LABELS[new Date(date).getDay()];
  const hours = staff?.weeklyHours?.[dayName];
  if (!hours || hours.off) return null;
  const [startHour, startMinute] = String(hours.start || "").split(":").map(Number);
  const [endHour, endMinute] = String(hours.end || "").split(":").map(Number);
  if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) return null;
  const start = new Date(date);
  start.setHours(startHour || 0, startMinute || 0, 0, 0);
  const end = new Date(date);
  end.setHours(endHour || 0, endMinute || 0, 0, 0);
  if (!(end > start)) return null;
  return { start, end };
};


const handleSaveTask = async ({ action, payload }) => {
  if (!supabase) return;

  try {
    // ---------- DELETE ----------
    if (action === "delete") {
      const meta = payload?.editingMeta || {};
  const deleteScope = payload?.deleteScope || "single"; // single | occurrence | series

      if (!meta.id) {
        toast.error("Missing schedule block id for delete");
        return;
      }

      const match = {};
      let beforeRows = [];

      if (deleteScope === "single") {
        match.id = meta.id;
      } else {
        if (meta.task_type_id) match.task_type_id = meta.task_type_id;
        if (meta.start) match.start = new Date(meta.start).toISOString();
        if (meta.end) match.end = new Date(meta.end).toISOString();
        if (meta.created_by) match.created_by = meta.created_by;
      }

      if (!Object.keys(match).length) {
        match.id = meta.id;
      }

      const { data: fetchedRows } = await supabase
        .from("schedule_blocks")
        .select("id,staff_id,task_type_id,start,end,created_by")
        .match(match);
      beforeRows = fetchedRows || [];

      const { error } = await supabase.from("schedule_blocks").delete().match(match);
      if (error) throw error;

      // local UI remove immediately
      setScheduledTasks((prev) =>
        prev.filter((ev) => !beforeRows.some((row) => row.id === ev.id))
      );

      // audit
      try {
        const actorEmail = currentUser?.email || currentUser?.user?.email || null;
        const actorId = currentUser?.id || currentUser?.user?.id || null;

        await logEvent({
          entityType: "scheduled_task",
       entityId: meta.id,
          action: "scheduled_task_deleted",
          details: {
            scope: deleteScope,
            deleted_rows: (beforeRows || []).map((r) => ({
              id: r.id,
              staff_id: r.staff_id,
              start: r.start,
              end: r.end,
              task_type_id: r.task_type_id,
            })),
          },
          actorId,
          actorEmail,
          supabaseClient: supabase,
        });
      } catch (e) {
        console.warn("[Audit] delete scheduled task failed", e);
      }

      toast.success("Task deleted");
      handleCloseTaskModal();
      return;
    }

    // ---------- CREATE ----------
    if (action === "create") {
      const {
        taskTypeId,
        start,
        end,
        staffIds,
        repeatRule,
        occurrences,
        is_locked,
         allDay,
      } = payload;

      const occ = buildOccurrences({
        start: new Date(start),
        end: new Date(end),
        repeatRule,
        occurrences,
      });

      const rows = [];
      for (const o of occ) {
       
        for (const staffId of staffIds) {
          if (allDay) {
            const window = getStaffWorkingWindow(staffId, o.start, stylistList);
            if (!window) continue;
            
            rows.push({
             staff_id: staffId,
              task_type_id: taskTypeId,
              start: window.start.toISOString(),
              end: window.end.toISOString(),
               is_active: true,
            });
            continue;
          }

      
          rows.push({
            staff_id: staffId,
            task_type_id: taskTypeId,
            start: o.start.toISOString(),
            end: o.end.toISOString(),
             is_active: true,
          });
        }
      }

      const { data: inserted, error } = await supabase
       .from("schedule_blocks")
        .insert(rows)
     .select("*, schedule_task_types ( id, name, category )");
      if (error) throw error;

      // immediate UI add
        setScheduledTasks((prev) => [
        ...prev,
        ...(inserted || [])
          .map((r) => mapScheduleBlockRowToEvent(r, stylistList))
          .filter(Boolean),
      ]);

      // audit
      try {
        const actorEmail = currentUser?.email || currentUser?.user?.email || null;
        const actorId = currentUser?.id || currentUser?.user?.id || null;

        await logEvent({
          entityType: "scheduled_task",
           entityId: inserted?.[0]?.id || uuidv4(),
          action: "scheduled_task_created",
          details: {
            occurrences: occ.length,
            staff_ids: staffIds,
             task_type_id: taskTypeId,
            start: new Date(start).toISOString(),
            end: new Date(end).toISOString(),
            inserted_rows: (inserted || []).length,
          },
          actorId,
          actorEmail,
          supabaseClient: supabase,
        });
      } catch (e) {
        console.warn("[Audit] create scheduled task failed", e);
      }

      toast.success("Task created");
      handleCloseTaskModal();
      return;
    }

    // ---------- UPDATE ----------
    if (action === "update") {
      const meta = payload?.editingMeta || {};
    
      const newStart = new Date(payload.start);
      const newEnd = new Date(payload.end);
     const newTaskTypeId = payload.taskTypeId || meta.task_type_id || null;
      const newStaffIds = payload.staffIds || [];
 if (!meta.id) {
        toast.error("Missing schedule block id for update");
        return;
      }
 const normalizedStaffIds = newStaffIds.filter(Boolean);

    if (normalizedStaffIds.length <= 1) {
        const staffId = normalizedStaffIds[0] || meta.staff_id || meta.resource_id;
        const { data: updated, error } = await supabase
          .from("schedule_blocks")
          .update({
            staff_id: staffId,
            task_type_id: newTaskTypeId,
            start: newStart.toISOString(),
            end: newEnd.toISOString(),
            is_active: true,
          })
          .eq("id", meta.id)
          .select("*, schedule_task_types ( id, name, category )")
          .single();

        if (error) throw error;

      setScheduledTasks((prev) =>
          prev.map((ev) =>
            ev.id === meta.id
              ? mapScheduleBlockRowToEvent(updated, stylistList)
              : ev
          )
        );
      } else {
        const { error: deleteErr } = await supabase
          .from("schedule_blocks")
          .delete()
          .eq("id", meta.id);
        if (deleteErr) throw deleteErr;

        const rows = normalizedStaffIds.map((staffId) => ({
          staff_id: staffId,
          task_type_id: newTaskTypeId,
          start: newStart.toISOString(),
          end: newEnd.toISOString(),
          is_active: true,
        }));

        const { data: insertedRows, error: insertErr } = await supabase
          .from("schedule_blocks")
          .insert(rows)
          .select("*, schedule_task_types ( id, name, category )");

        if (insertErr) throw insertErr;

        setScheduledTasks((prev) => {
          const remaining = prev.filter((ev) => ev.id !== meta.id);
          const mapped = (insertedRows || [])
            .map((r) => mapScheduleBlockRowToEvent(r, stylistList))
            .filter(Boolean);
          return [...remaining, ...mapped];
        });
      }

     
      // audit
      try {
        const actorEmail = currentUser?.email || currentUser?.user?.email || null;
        const actorId = currentUser?.id || currentUser?.user?.id || null;

        await logEvent({
          entityType: "scheduled_task",
         entityId: meta.id,
          action: "scheduled_task_updated",
          details: {
           block_id: meta.id,
            start: newStart.toISOString(),
            end: newEnd.toISOString(),
            task_type_id: newTaskTypeId,
            staff_ids: newStaffIds,
           
          },
          actorId,
          actorEmail,
          supabaseClient: supabase,
        });
      } catch (e) {
        console.warn("[Audit] update scheduled task failed", e);
      }

      toast.success("Task updated");
      handleCloseTaskModal();
      return;
    }
  } catch (err) {
    console.error("[Calendar] task save failed", err);
    toast.error(err?.message || "Task save failed");
  }
};



  const handleBlockCreated = useCallback(
    (row) => {
      if (!row) return;
      const mapped = mapBookingRowToEvent(row);
      setEvents((prev) => [...prev, mapped]);
      handleCancelBookingFlow();
    },
    [handleCancelBookingFlow, mapBookingRowToEvent]
  );

  /* ---------- simple auth gate ---------- */

  if (authLoading && !hasUser) {
    return (
      <div className="p-6">
        <PageLoader />
        <pre className="mt-4 p-3 bg-gray-100 text-xs rounded overflow-auto">
          {JSON.stringify(
            { stage: "authBoot", pageLoading, authLoading, hasUser },
            null,
            2
          )}
        </pre>
      </div>
    );
  }

  if (!hasUser && !authLoading) {
    return <div className="p-6">You must be logged in to view the calendar.</div>;
  }

  if (!ready) {
    return (
      <div className="p-6">
        <PageLoader />
        {errText && (
          <div className="mt-4 p-3 bg-red-50 text-red-700 rounded">{errText}</div>
        )}
        <pre className="mt-4 p-3 bg-gray-100 text-xs rounded overflow-auto">
          {JSON.stringify(
            {
              loading,
              ready,
              hasUser,
              pageLoading,
              authLoading,
              dbg,
            },
            null,
            2
          )}
        </pre>
      </div>
    );
  }

  /* ----------------- render calendar ----------------- */

  return (
    <div className="p-4 metallic-bg">

      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setVisibleDate(new Date())}
            className="bg-bronze px-4 py-2 rounded-lg border border-black hover:bg-black hover:text-white"
          >
            Today
          </button>

          <button
            onClick={() =>
              setVisibleDate(
                new Date(
                  visibleDate.getFullYear(),
                  visibleDate.getMonth(),
                  visibleDate.getDate() - 1
                )
              )
            }
            className="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300"
          >
            <ChevronLeft className="w-8 h-8 text-black" />
          </button>

          <div className="font-semibold">
            <h1 className="text-2xl font-bold metallic-text p-5">
              {format(visibleDate, "eeee dd MMMM yyyy")}
            </h1>
          </div>

          <button
            onClick={() =>
              setVisibleDate(
                new Date(
                  visibleDate.getFullYear(),
                  visibleDate.getMonth(),
                  visibleDate.getDate() + 1
                )
              )
            }
            className="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300"
          >
            <ChevronRight className="w-8 h-8 text-black" />
          </button>

          <button
            onClick={() => setIsCalendarOpen(true)}
            className="bg-bronze border border-black hover:bg-black text-white px-4 py-2 rounded flex items-center gap-2"
          >
            <CalendarIcon className="w-4 h-4" />
            <span>Go to Date</span>
          </button>
        </div>
      </div>

       {taskError && (
        <div className="mb-3 p-3 bg-red-50 text-red-700 border border-red-200 rounded">
          Task save failed: {taskError}
        </div>
      )}
      {taskSaving && (
        <div className="mb-2 text-sm text-gray-600">Saving task…</div>
      )}

      <DnDCalendar
        localizer={localizer}
        events={calendarEvents}
        startAccessor="start"
        endAccessor="end"
        resources={stylistList}
        resourceIdAccessor="id"
        resourceTitleAccessor="title"
        date={visibleDate}
        onNavigate={(newDate) => setVisibleDate(newDate)}
        defaultView={Views.DAY}
        views={[Views.DAY]}
        step={15}
        timeslots={4}
        min={new Date(2025, 0, 1, 9, 0)}
        max={new Date(2025, 0, 1, 20, 0)}
        scrollToTime={new Date(2025, 0, 1, 9, 0)}
      selectable="ignoreEvents"
        showNowIndicator
        onRangeChange={(range) => {
          if (Array.isArray(range)) setVisibleDate(range[0]);
          else setVisibleDate(range.start);
        }}
        onSelectSlot={(slot) => {
          setSelectedSlot(slot);
          setIsModalOpen(true);
          setStep(1);
        }}
   onSelectEvent={(event) => {
  if (event.isUnavailable || event.isSalonClosed || event.isTask) return;

  // ✅ ALWAYS open task editor for blocked slots (even if flags are missing)
  if (isScheduleBlockEvent(event)) {
    const rid = event.resourceId ?? event.resource_id ?? null;

    handleOpenScheduleTask(
      {
        start: event.start,
        end: event.end,
        resourceId: rid,
      },
      {
        ...event,
        // ✅ force flags so edit save logic always treats it as a DB block
        isScheduleBlock: true,
        resourceId: rid,
        start: event.start,
        end: event.end,
        // ✅ series id hint for later (optional)
       staffIds:
          event.staffIds ||
          (event.staff_id ? [event.staff_id] : rid ? [rid] : []),
        taskTypeId: event.task_type_id || event.taskTypeId || null,
      }
    );
    return;
  }

  setSelectedBooking(coerceEventForPopup(event));
}}

        onEventDrop={moveEvent}
        resizable
        onEventResize={moveEvent}
        eventPropGetter={(event) => {
          if (event.isScheduledTask || event.isScheduleBlock) {
            return {
              style: {
                zIndex: 2,
                backgroundImage:
                  "linear-gradient(135deg, #d0a36c, #b0702e, #391f04)",
                color: "#fff",
                border: "1px solid #d0a36c",
                opacity: 0.95,
              },
              title: event.title,
            };
          }

           if (event.isUnavailable) {
    return {
      className: "rbc-unavailable-block",
      style: {
        backgroundColor: "#36454F",
        opacity: 0.7,
        border: "none",
        pointerEvents: "none", // ✅ lets click/drag pass through
      },
    };
  }
 // ✅ Non-working / salon closed blocks (click-through)
  if (event.isSalonClosed) {
    return {
      className: "rbc-salonclosed-block",
      style: {
        backgroundColor: "#333333",
        opacity: 0.7,
        border: "none",
        pointerEvents: "none",
      },
    };
  }

                   const status = String(event.status || "").trim().toLowerCase();

          // ✅ Cancelled = red
          if (isCancelledStatus(status)) {
            return {
              style: {
                zIndex: 2,
                backgroundColor: "#b91c1c",
                color: "#fff",
                border: "none",
                opacity: 0.95,
              },
            };
          }

          // ✅ Confirmed = green (this is your “blue -> green” change)
          if (isConfirmedStatus(status)) {
            return {
              style: {
                zIndex: 2,
                backgroundColor: "#16a34a",
                color: "#fff",
                border: "none",
                opacity: 0.95,
              },
            };
          }

          if (isScheduleBlockEvent(event) || event.isTask) {
    return {
      style: {
        zIndex: 2,
        backgroundImage: "linear-gradient(135deg, #d0a36c, #b0702e, #391f04)",
        color: "#fff",
        border: "1px solid #d0a36c",
        opacity: 0.95,
      },
      title: event.title,
    };
  }

          // default (pending etc)
          return { style: { zIndex: 2 } };
        }}
        style={{ height: "90vh" }}
        components={{
          event: CustomCalendarEvent,
          toolbar: () => null,
        }}
        showAllDay={false}
        allDayAccessor={() => false}
        draggableAccessor={(event) =>
          !event.isUnavailable &&
          !event.isSalonClosed &&
          !event.isTask &&
          !event.is_locked &&
          !isCancelledStatus(event.status)
        }
        resizableAccessor={(event) =>
          !event.isUnavailable &&
          !event.isSalonClosed &&
          !event.isTask &&
          !event.is_locked &&
          !isCancelledStatus(event.status)
        }
      />

      <BookingPopUp
      supabaseClient={supabase}
        isOpen={!!selectedBooking}
        booking={selectedBooking}
        onClose={() => setSelectedBooking(null)}
        onEdit={() => {
          setSelectedSlot({
            start: selectedBooking.start,
            end: selectedBooking.end,
            resourceId: selectedBooking.resourceId,
          });
          setSelectedClient(selectedBooking.client_id);
          setClientObj(clients.find((c) => c.id === selectedBooking.client_id));
          setIsModalOpen(true);
          setStep(1);
          setSelectedBooking(null);
        }}
        onDeleteSuccess={(deletedId) => {
          setEvents((prev) => prev.filter((e) => e.id !== deletedId));
          setSelectedBooking(null);
        }}
        stylistList={stylistList}
        clients={clients}
        onBookingUpdated={({ booking_id, id, is_locked, booking_tag_id }) => {
          setEvents((prev) =>
            prev.map((ev) => {
              const same = booking_id ? ev.booking_id === booking_id : ev.id === id;
              const nextTagId =
          booking_tag_id !== undefined ? booking_tag_id : ev.booking_tag_id;

        const nextTagCode = nextTagId
          ? (tagCodeById?.get(nextTagId) || null)
          : null;
               return same
                ? {
                    ...ev,
                    is_locked:
                      typeof is_locked === "boolean" ? is_locked : ev.is_locked,
                          booking_tag_id: nextTagId,
          booking_tag_code: nextTagCode, 
                  }
                : ev;
            })
          );
        }}
      />

    {isAdmin ? (
  <SelectClientModal
    isOpen={isModalOpen && step === 1}
    onClose={handleCancelBookingFlow}
    clients={clients}
    selectedSlot={selectedSlot}
    selectedClient={selectedClient}
    setSelectedClient={(id) => {
      setSelectedClient(id);
      setClientObj(clients.find((c) => c.id === id));
    }}
    onNext={() => setStep(2)}
     onScheduleTask={handleOpenScheduleTask} 
    onClientCreated={(c) => {
     setClients((prev) => {
        const already = prev.some((p) => p.id === c.id);
        return already ? prev : [c, ...prev];
      });
      setSelectedClient(c.id);
      setClientObj(c);
    }}
    bookingTagId={bookingTagId}
    setBookingTagId={setBookingTagId}
    supabaseClient={supabase}
    onBlockCreated={handleBlockCreated}
  />
) : (
  <SelectClientModalStaff
    supabaseClient={supabase}
    isOpen={isModalOpen && step === 1}
    onClose={handleCancelBookingFlow}
    clients={clients}
    booking={selectedBooking}
    selectedSlot={selectedSlot}
    selectedClient={selectedClient}
    setSelectedClient={async (id) => {
      setSelectedClient(id);
      const local = clients.find((c) => c.id === id);
      if (local) return setClientObj(local);

      const { data } = await supabase
        .from("clients")
        .select("id, first_name, last_name, mobile, email, notes, dob, created_at")
        .eq("id", id)
        .single();

      if (data) setClientObj(data);
    }}
    onNext={() => setStep(2)}
     onScheduleTask={handleOpenScheduleTask} 
    onClientCreated={(c) => {
      setClients((prev) => {
        const already = prev.some((p) => p.id === c.id);
        return already ? prev : [c, ...prev];
      });
      setSelectedClient(c.id);
      setClientObj(c);
      
    }}
     bookingTagId={bookingTagId}
    setBookingTagId={setBookingTagId}
  />
)}


      <RightDrawer
        isOpen={step === 2}
        onClose={handleCancelBookingFlow}
        widthClass="w-full sm:w-[80%] md:w-[60%] xl:w-[50%]"
        title={bookingTitle}
      >
        <NewBooking
          stylistName={stylist?.title}
          stylistId={selectedSlot?.resourceId}
          selectedSlot={selectedSlot}
          clients={clients}
          selectedClient={selectedClient}
          clientObj={clientObj}
          bookingTagId={bookingTagId}
          basket={basket}
          setBasket={setBasket}
          onBack={() => setStep(1)}
          onCancel={handleCancelBookingFlow}
          extendedProps={newBookingExtendedProps}
          onNext={(payload) => {
            setReviewData(payload || null);
            setStep(3);
          }}
        />
      </RightDrawer>

      <ReviewModal
        isOpen={step === 3}
        onClose={handleCancelBookingFlow}
        onBack={() => setStep(2)}
        onConfirm={(newEvents) => {
          setEvents((prev) => [...prev, ...newEvents.map(coerceEventForPopup)]);
          handleCancelBookingFlow();
        }}
        clients={clients}
        clientObj={clientObj}
        reviewData={reviewData}
        stylistList={stylistList}
        selectedClient={selectedClient}
        selectedSlot={selectedSlot}
        basket={basket}
      />

      <CalendarModal
        isOpen={isCalendarOpen}
        onClose={() => setIsCalendarOpen(false)}
        onDateSelect={(date) => {
          setVisibleDate(date);
          setIsCalendarOpen(false);
        }}
      />

       {hasUser && (
        <>
          <button
            onClick={() => setShowReminders(true)}
            className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 bg-black text-white rounded-full shadow-lg px-5 py-3"
            title="Send Reminders"
          >
            Send Reminders
          </button>

          <RemindersDialog
            isOpen={showReminders}
            onClose={() => setShowReminders(false)}
            defaultWeekFromDate={visibleDate}
          />
        </>
      )}
       <ScheduleTaskModal
        supabaseClient={supabase}
        isOpen={taskModalOpen}
        onClose={handleCloseTaskModal}
        slot={taskDraft?.slot}
        stylists={stylistList}
        editingTask={taskDraft?.editingTask}
        onSave={handleSaveTask}
      />
    </div>
  );
}
