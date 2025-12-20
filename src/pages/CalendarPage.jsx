// src/pages/CalendarPage.jsx
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay } from "date-fns";
import enGB from "date-fns/locale/en-GB";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
} from "lucide-react";

import CalendarModal from "../components/CalendarModal";
import BookingPopUp from "../components/bookings/BookingPopUp";
import RightDrawer from "../components/RightDrawer";
import CustomCalendarEvent from "../components/CustomCalendarEvent";
import SelectClientModal from "../components/clients/SelectClientModal.jsx";
import SelectClientModalStaff from "../components/clients/SelectClientModalStaff.jsx";
import ReviewModal from "../components/ReviewModal";
import NewBooking from "../components/bookings/NewBooking";

import useUnavailableTimeBlocks from "../components/UnavailableTimeBlocks";
import UseSalonClosedBlocks from "../components/UseSalonClosedBlocks";
import UseTimeSlotLabel from "../utils/UseTimeSlotLabel";
import AddGridTimeLabels from "../utils/AddGridTimeLabels";

import baseSupabase from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";

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

export default function CalendarPage() {
    const [stylistList, setStylistList] = useState([]);
  const mapBookingRowToEvent = (b) => {
  const stylistRow = stylistList.find((s) => s.id === b.resource_id);
  const start = b.start ?? b.start_time;
  const end = b.end ?? b.end_time;

  return {
    ...b,
    start: new Date(start),
    end: new Date(end),
    resourceId: b.resource_id,
    stylistName: stylistRow?.name || "Unknown Stylist",
    title: b.title || "No Service Name",
  };
};

  const auth = useAuth();
  const { currentUser, pageLoading, authLoading } = auth;

  // ✅ FIX: use the context client (token-backed), fallback to base client
  const supabase = auth?.supabaseClient || baseSupabase;

  const hasUser = !!currentUser;

  const [clients, setClients] = useState([]);
  const [events, setEvents] = useState([]);

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

  const [step, setStep] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);

  const [visibleDate, setVisibleDate] = useState(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const [loading, setLoading] = useState(true); // data fetch in progress
  const [ready, setReady] = useState(false); // calendar is allowed to render
  const [showReminders, setShowReminders] = useState(false);
  const [errText, setErrText] = useState("");
  const [reviewData, setReviewData] = useState(null);

  const selectedClientRow = useMemo(() => {
  return clientObj || clients?.find((c) => c.id === selectedClient) || null;
}, [clientObj, clients, selectedClient]);

const newBookingExtendedProps = useMemo(() => {
  return {
    client_email: selectedClientRow?.email ?? null,
    client_mobile: selectedClientRow?.mobile ?? null,
    client_first_name: selectedClientRow?.first_name ?? null,
    client_last_name: selectedClientRow?.last_name ?? null,
  };
}, [selectedClientRow]);


  const unavailableBlocks = useUnavailableTimeBlocks(stylistList, visibleDate);
  const salonClosedBlocks = UseSalonClosedBlocks(stylistList, visibleDate);

const calendarEvents = useMemo(() => {
  return [...(events || []), ...unavailableBlocks, ...salonClosedBlocks];
}, [events, unavailableBlocks, salonClosedBlocks]);




  const isAdmin = currentUser?.permission?.toLowerCase() === "admin";

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
        ev.stylistName || stylist?.name || stylist?.title || "Unknown Stylist",
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

  // UseTimeSlotLabel(9, 20, 15);
  // AddGridTimeLabels(9, 20, 15);

  /* --------- fetch clients, staff, bookings once user is ready --------- */

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
          .select("*");
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
            weeklyHours: s.weekly_hours || {},
          }))
        );

        setEvents(
          (bookingsData || []).map((b) => {
            const stylistRow = staff.find((s) => s.id === b.resource_id);
            const start = b.start ?? b.start_time;
            const end = b.end ?? b.end_time;
            return {
              ...b,
              start: new Date(start),
              end: new Date(end),
              resourceId: b.resource_id,
              stylistName: stylistRow?.name || "Unknown Stylist",
              title: b.title || "No Service Name",
            };
          })
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
      // no cancelled flag — runIdRef handles staleness
    };
  }, [currentUser?.id, supabase]);

  useEffect(() => {
  if (!currentUser?.id) return;
  if (!supabase) return;

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

        setEvents((prev) => {
          const idx = prev.findIndex((e) => e.id === row.id);
          const mapped = mapBookingRowToEvent(row);

          if (idx === -1) return [...prev, mapped];

          const copy = prev.slice();
          copy[idx] = { ...copy[idx], ...mapped };
          return copy;
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [supabase, currentUser?.id, stylistList]);



  const moveEvent = useCallback(
    
    async ({ event, start, end, resourceId }) => {
      if (event?.is_locked) return;
      const { start: s, end: e } = clampRange(start, end);
      const rid = resourceId ?? event.resourceId;

      const newDuration = (e.getTime() - s.getTime()) / 60000;

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

      setEvents((prev) =>
        prev.map((ev) => (ev.id === event.id ? updated : ev))
      );

      try {
        await supabase
          .from("bookings")
          .update({
            start: s,
            end: e,
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

  const handleCancelBookingFlow = () => {
    setIsModalOpen(false);
    setSelectedSlot(null);
    setSelectedClient("");
    setClientObj(null);
    setBasket([]);
    setReviewData(null); 
    setStep(1);
  };

  /* ---------- simple auth gate ---------- */

  // 1) still bootstrapping auth & no user yet → global loader
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

  // 2) auth finished and no user → send them to login
  if (!hasUser && !authLoading) {
    return <div className="p-6">You must be logged in to view the calendar.</div>;
  }

  // 3) user exists, but calendar data not ready yet
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
      <div>
        <h1 className="text-5xl font-bold metallic-text p-5">
          The Edge HD Salon
        </h1>
      </div>

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
        selectable
        showNowIndicator
        onRangeChange={(range) => {
          if (Array.isArray(range)) {
            setVisibleDate(range[0]);
          } else {
            setVisibleDate(range.start);
          }
        }}
        onSelectSlot={(slot) => {
          setSelectedSlot(slot);
          setIsModalOpen(true);
          setStep(1);
        }}
        onSelectEvent={(event) => {
          if (event.isUnavailable || event.isSalonClosed) return;
          setSelectedBooking(coerceEventForPopup(event));
        }}
        onEventDrop={moveEvent}
        resizable
        onEventResize={moveEvent}
eventPropGetter={(event) => {
  if (event.isUnavailable) {
    return { style: { backgroundColor: "#36454F", opacity: 0.7, border: "none" } };
  }
  if (event.isSalonClosed) {
    return { style: { backgroundColor: "#333333", opacity: 0.7, border: "none" } };
  }

  if (event.status === "confirmed") {
    return { style: { zIndex: 2, opacity: 0.6 } };
  }
  if (event.status === "cancelled") {
  return { style: { backgroundColor: "#b91c1c", color: "#fff", zIndex: 2, opacity: 0.95 } };
}


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
  !event.isUnavailable && !event.isSalonClosed && !event.is_locked
}
resizableAccessor={(event) =>
  !event.isUnavailable && !event.isSalonClosed && !event.is_locked
}

      />

      <BookingPopUp
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
        onBookingUpdated={({ booking_id, id, is_locked }) => {
    setEvents((prev) =>
      prev.map((ev) => {
        const same =
          booking_id ? ev.booking_id === booking_id : ev.id === id;
        return same ? { ...ev, is_locked } : ev;
      })
    );
  }}
      />

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
        onClientCreated={(c) => {
          setClients((prev) => (prev.some((p) => p.id === c.id) ? prev : [...prev, c]));
          setSelectedClient(c.id);
          setClientObj(c);
        }}
      />

<SelectClientModalStaff
  supabaseClient={supabase}
  isOpen={isModalOpen && step === 1}
  onClose={handleCancelBookingFlow}
  clients={clients}
  selectedSlot={selectedSlot}
  selectedClient={selectedClient}
  setSelectedClient={async (id) => {
    setSelectedClient(id);

    const local = clients.find((c) => c.id === id);
    if (local) {
      setClientObj(local);
      return;
    }

    const { data, error } = await supabase
      .from("clients")
      .select("id, first_name, last_name, mobile, email, notes, dob, created_at")
      .eq("id", id)
      .single();

    if (error) console.error("[CalendarPage] fetch selected client failed:", error);
    if (data) setClientObj(data);
  }}
  onNext={() => setStep(2)}
  onClientCreated={(c) => {
    setClients((prev) => (prev.some((p) => p.id === c.id) ? prev : [...prev, c]));
    setSelectedClient(c.id);
    setClientObj(c);
  }}
/>


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
          clientObj={clientObj}       // ✅ add
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

      {isAdmin && (
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
    </div>
  );
}
