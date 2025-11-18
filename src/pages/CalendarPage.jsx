import React, { useEffect, useState, useCallback } from "react";
import {
  Calendar,
  dateFnsLocalizer,
  Views,
} from "react-big-calendar";
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
import ReviewModal from "../components/ReviewModal";
import NewBooking from "../components/bookings/NewBooking";

import useUnavailableTimeBlocks from "../components/UnavailableTimeBlocks";
import UseSalonClosedBlocks from "../components/UseSalonClosedBlocks";
import UseTimeSlotLabel from "../utils/UseTimeSlotLabel";
import AddGridTimeLabels from "../utils/AddGridTimeLabels";

import supabase from "../supabaseClient";

import { useAuth } from "../contexts/AuthContext"; // <-- Add this import!

import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import "../styles/CalendarStyles.css";
import PageLoader from "../components/PageLoader.jsx";
import { addMinutes } from "date-fns";
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


// keep times as local wall-clock and guarantee at least 1 minute
const toLocal = (d) => {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate(), x.getHours(), x.getMinutes(), 0, 0);
};

const clampRange = (start, end) => {
  const s = toLocal(start);
  let e = toLocal(end);
  if (!(e > s)) e = new Date(s.getTime() + 60 * 1000); // ≥ 1 minute
  return { start: s, end: e };
};

// Snap a date to nearest step (floor by default)
const snapToStep = (d, step = 15) => {
  const x = new Date(d);
  x.setSeconds(0, 0);
  const mins = x.getMinutes();
  const snapped = Math.floor(mins / step) * step;
  x.setMinutes(snapped);
  return x;
};


// Clamp within your business hours for *that date*
const clampWithinDay = (d, minH = 9, maxH = 20) => {
  const base = new Date(d);
  const min = new Date(base.getFullYear(), base.getMonth(), base.getDate(), minH, 0, 0, 0);
  const max = new Date(base.getFullYear(), base.getMonth(), base.getDate(), maxH, 0, 0, 0);
  if (base < min) return min;
  if (base > max) return max;
  return base;
};


export default function CalendarPage() {
  const { currentUser, pageLoading, authLoading } = useAuth();

  const [clients, setClients] = useState([]);
  const [stylistList, setStylistList] = useState([]);
  const [events, setEvents] = useState([]);
  const [dbg, setDbg] = useState({});         // 👈 debug dictionary
  const dbgLog = (k, v = true) => {
    setDbg(prev => ({ ...prev, [k]: v, t: new Date().toISOString() }));
    // also to console so you don't need UI
    console.log("[CALDBG]", k, v);
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

  // Local loading state for fetchData
  const [loading, setLoading] = useState(true);

  // Keep whatever is there above...
const toDate = (v) => (v instanceof Date ? v : new Date(v));

// inside CalendarPage component:
const [showReminders, setShowReminders] = useState(false);
const [errText, setErrText] = useState("");

 // Watchdog: if loading > 7s, show what we know
  useEffect(() => {
    if (!loading) return;
    const id = setTimeout(() => {
      dbgLog("watchdogTimeout", true);
      setErrText(prev => prev || "Loading took too long (7s watchdog). Check console for [CALDBG] logs.");
      setLoading(false); // force the loader to exit so you can see the message
    }, 7000);
    return () => clearTimeout(id);
  }, [loading]);


const isAdmin = currentUser?.permission?.toLowerCase() === "admin";

const coerceEventForPopup = (ev) => {
  const rid = ev.resource_id ?? ev.resourceId ?? ev.stylist_id ?? null;
  const stylist = stylistList.find((s) => s.id === rid);
  return {
    ...ev,
    start: toDate(ev.start),
    end: toDate(ev.end),
    resource_id: rid,                 // <-- ensure BookingPopUp can read it
    resourceId: rid,                  // <-- keep calendar happy too
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
      )} - ${format(selectedSlot.end, "HH:mm")} • Stylist: ${stylist?.title ?? ""}`
    : "Booking";

  UseTimeSlotLabel(9, 20, 15);
  AddGridTimeLabels(9, 20, 15);

  useEffect(() => {
    // Wait until auth has finished restoring
    dbgLog("effect:mount", { hasUser: !!currentUser, authLoading });

    if (authLoading) return;         // still restoring
    if (!currentUser) {
      // no user at all → show a friendly message instead of throwing
      setErrText("You must be logged in to view the calendar.");
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setErrText("");
      try {
        // 🔍 Optional: log Supabase session, but DO NOT block on it
        dbgLog("getSession:start");
        try {
          const { data: sessionData, error: sessErr } =
            await supabase.auth.getSession();
          dbgLog("getSession:done", {
            hasSession: !!sessionData?.session,
            sessErr: !!sessErr,
          });
        } catch (e) {
          dbgLog("getSession:error", e?.message || String(e));
        }

        dbgLog("queries:start");

        const [
          { data: clientsData,  error: cErr },
          { data: staffData,    error: sErr },
          { data: bookingsData, error: bErr },
        ] = await Promise.all([
          supabase.from("clients").select("*"),
          supabase
            .from("staff")
            .select("*")
            .order("created_at", { ascending: true }),
          supabase.from("bookings").select("*"),
        ]);

        console.log("[CALDBG] bookingsData length:", bookingsData?.length, {
  bookingsSample: bookingsData?.slice(0, 3),
});


        dbgLog("queries:done", {
          cErr: !!cErr,
          sErr: !!sErr,
          bErr: !!bErr,
        });

        if (cErr) throw cErr;
        if (sErr) throw sErr;
        if (bErr) throw bErr;

        const staff = staffData || [];
        console.log("✅ Staff fetched:", staff);

        dbgLog("map:setState:start", {
          staffCount: staff.length,
          clients: (clientsData || []).length,
          bookings: (bookingsData || []).length,
        });

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
            const stylist = staff.find((s) => s.id === b.resource_id);
            const start = b.start ?? b.start_time;
            const end   = b.end   ?? b.end_time;
            return {
              ...b,
              start: new Date(start),
              end: new Date(end),
              resourceId: b.resource_id,
              stylistName: stylist?.name || "Unknown Stylist",
              title: b.title || "No Service Name",
            };
          })
        );

        dbgLog("map:setState:done");
      } catch (error) {
        console.error("❌ Error fetching calendar data:", error);
        dbgLog("error", error?.message || String(error));
        setErrText(error?.message || "Failed to load calendar data");
      } finally {
        dbgLog("effect:finally:setLoadingFalse");
        setLoading(false);
      }
    };

    fetchData();
  }, [currentUser, authLoading]);


  const unavailableBlocks = useUnavailableTimeBlocks(stylistList, visibleDate);
  const salonClosedBlocks = UseSalonClosedBlocks(stylistList, visibleDate);

const moveEvent = useCallback(
  async ({ event, start, end, resourceId }) => {
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
      stylistName: stylistList.find((s1) => s1.id === rid)?.title || "Unknown",
      allDay: false, // <- belt & braces
    };

    setEvents((prev) => prev.map((ev) => (ev.id === event.id ? updated : ev)));

    try {
      await supabase
        .from("bookings")
        .update({
          start: s,        // OK to pass Date; supabase-js serializes
          end: e,
          resource_id: rid,
          duration: newDuration,
        })
        .eq("id", event.id);
    } catch (error) {
      console.error("❌ Failed to move booking:", error);
    }
  },
  [stylistList]
);


  const handleCancelBookingFlow = () => {
    setIsModalOpen(false);
    setSelectedSlot(null);
    setSelectedClient("");
    setClientObj(null);
    setBasket([]);
    setStep(1);
  };

if (!currentUser) {
   console.log("[CALDBG] no currentUser yet");
   return <div>Loading...</div>;
 }

 if (!currentUser && !authLoading) {
  return <div className="p-6">You must be logged in to view the calendar.</div>;
}

 
if (pageLoading || authLoading || loading) {
  return (
    <div className="p-6">
      <PageLoader />
      {errText && (
        <div className="mt-4 p-3 bg-red-50 text-red-700 rounded">{errText}</div>
      )}
      <pre className="mt-4 p-3 bg-gray-100 text-xs rounded overflow-auto">
        {JSON.stringify({ pageLoading, authLoading, loading, dbg }, null, 2)}
      </pre>
    </div>
  );
}

  return (
    <div className="p-4">
      <div>
        <h1 className="text-5xl font-bold metallic-text p-5">The Edge HD Salon</h1>
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
        events={[...events, ...unavailableBlocks, ...salonClosedBlocks]}
        startAccessor="start"
        endAccessor="end"
        resources={stylistList}
        resourceIdAccessor="id"
        resourceTitleAccessor="title"
        // resourceAccessor={(e) => e.resourceId}
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
            return {
              style: {
                backgroundColor: "#36454F",
                opacity: 0.7,
                border: "none",
              },
            };
          }
          if (event.isSalonClosed) {
            return {
              style: {
                backgroundColor: "#333333",
                opacity: 0.7,
                border: "none",
              },
            };
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
   // Add to local state if not already present
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
          onNext={() => setStep(3)}
        />
      </RightDrawer>

      <ReviewModal
        isOpen={step === 3}
        onClose={handleCancelBookingFlow}
        onBack={() => setStep(2)}
        onConfirm={(newEvents) => {
   setEvents((prev) => [
     ...prev,
     ...newEvents.map(coerceEventForPopup),
   ]);
   handleCancelBookingFlow();
 }}
        clients={clients}
        stylistList={stylistList}
        selectedClient={selectedClient}
        selectedSlot={selectedSlot}
        basket={basket}
        // Pass currentUser here if needed by child component!
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
      // default the dialog's range to the visible week on the calendar:
      defaultWeekFromDate={visibleDate}
    />
  </>
)}

    </div>
  );
}
