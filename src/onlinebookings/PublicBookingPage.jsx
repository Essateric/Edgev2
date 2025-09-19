// src/onlinebookings/PublicBookingPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient.js";
import Stepper from "./components/Stepper.jsx";
import ProviderList from "./components/ProviderList.jsx";
import CalendarSlots from "./components/CalendarSlots.jsx";
import ClientForm from "./components/ClientForm.jsx";
import {
  addMinutes,
  startOfDay,
  endOfDay,
  money,
  getWindowsForWeekday,
  buildSlotsFromWindows,
  rangesOverlap,
} from "./lib/bookingUtils.js";
import { sendBookingEmails } from "./lib/email.js";
import { v4 as uuidv4 } from "uuid";
import SaveBookingsLog from "../components/bookings/SaveBookingsLog";
import edgeLogo from "../assets/EdgeLogo.png";

const LOGO_SRC = edgeLogo || "/edge-logo.png";

const BUSINESS = {
  name: "The Edge HD Salon",
  address: "9 Claremont Road, Sale, M33 7DZ",
  timezone: "Europe/London",
  logoSrc: LOGO_SRC,
  notifyEmail: "edgehd.salon@gmail.com",
};

// ---------- helpers ----------
const initialClient = {
  first_name: "",
  last_name: "",
  email: "",
  mobile: "",
  notes: "",
};

// Whitelist columns we actually insert into `bookings`
const BOOKING_COLUMNS = [
  "booking_id",
  "title",
  "category",
  "client_id",
  "client_name",
  "resource_id",
  "start",
  "end",
  "duration",
  "price",
  "status",
  "service_id",
];

function sanitizeBookingRow(row) {
  const out = {};
  for (const k of BOOKING_COLUMNS) {
    if (row[k] !== undefined) out[k] = row[k];
  }
  // harden types
  if (out.duration != null) out.duration = Math.round(Number(out.duration) || 0);
  if (out.price != null) out.price = Number(out.price) || 0;
  return out;
}

const uniqById = (arr) => {
  const seen = new Set();
  return arr.filter((x) => {
    if (!x?.id || seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
};

// chemical if DB flag set OR category contains "treat" (Treatments)
const isChemicalService = (svc) => {
  const cat = String(svc?.category || "").toLowerCase();
  return Boolean(svc?.is_chemical) || cat.includes("treat");
};

const minsToLabel = (total) => {
  const d = Number(total) || 0;
  if (!d) return "—";
  const h = Math.floor(d / 60);
  const m = d % 60;
  return `${h ? `${h}h ` : ""}${m || (!h ? d : 0)}m`;
};

// Insert rows and gracefully retry if some columns don't exist yet (e.g. service_id/sort_index on older DBs)
async function safeInsertBookings(rows) {
  // try sanitized first (only BOOKING_COLUMNS)
  const cleanRows = rows.map(sanitizeBookingRow);
  let { data, error } = await supabase.from("bookings").insert(cleanRows).select("*");
  if (!error) return data;

  const msg = (error.message || "").toLowerCase();
  if (msg.includes("service_id")) {
    const stripped = cleanRows.map(({ service_id, ...rest }) => rest);
    const retry = await supabase.from("bookings").insert(stripped).select("*");
    if (!retry.error) return retry.data;
    throw retry.error;
  }
  throw error;
}

export default function PublicBookingPage() {
  const [step, setStep] = useState(1);

  // All services/providers
  const [services, setServices] = useState([]);
  const [providers, setProviders] = useState([]);

  // MULTI: selected “cart” of services
  const [selectedServices, setSelectedServices] = useState([]);
  const lastPickedService =
    selectedServices[selectedServices.length - 1] || null;

  // Provider & time picking
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [viewDate, setViewDate] = useState(() => startOfDay(new Date()));
  const [selectedDate, setSelectedDate] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedTime, setSelectedTime] = useState(null);

  // Client & save
  const [client, setClient] = useState(initialClient);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);

  // Stylist-specific overrides from staff_services
  const [providerOverrides, setProviderOverrides] = useState([]);

  const isTBA = (p) =>
    p == null || p === "" || Number(p) === 0 || Number.isNaN(Number(p));

  // helper to fully reset the flow after a successful booking
  function resetBookingFlow() {
    setSelectedServices([]);
    setSelectedProvider(null);
    setSelectedDate(null);
    setSelectedTime(null);
    setAvailableSlots([]);
    setProviderOverrides([]);
    setClient(initialClient);
    setSaved(null);
    setViewDate(startOfDay(new Date()));
    setStep(1);
  }

  // fetch services/providers
  useEffect(() => {
    (async () => {
      const { data: s } = await supabase
        .from("services")
        .select("id,name,category,is_chemical,base_duration,base_price")
        .order("name");
      setServices(s || []);

      const { data: staff } = await supabase
     .from("staff")
     .select(`
       id,
       name,
       email,
       permission,
       weekly_hours,
       service_ids,          -- REQUIRED for filtering by service
       online_bookings,      -- show/hide online-bookable stylists
       is_active             -- hide inactive stylists
     `)
     .order("name");
   // Normalise shapes so mobile doesn’t crash the filter
   const normalised = (staff || []).map(p => ({
     ...p,
     service_ids: Array.isArray(p?.service_ids) ? p.service_ids : [],
     online_bookings: p?.online_bookings ?? true,
     is_active: p?.is_active ?? true,
   }));
   setProviders(normalised);
    })();
  }, []);

  // load overrides when provider changes
  useEffect(() => {
    (async () => {
      if (!selectedProvider) {
        setProviderOverrides([]);
        return;
      }
      const { data, error } = await supabase
        .from("staff_services")
        .select("service_id, staff_id, price, duration")
        .eq("staff_id", selectedProvider.id);
      if (!error) setProviderOverrides(data || []);
    })();
  }, [selectedProvider]);

  // effective per-item values for display & booking
  // IMPORTANT: Until a stylist is selected, both price and duration are "unknown"
  const getEffectivePD = (svc) => {
    if (!selectedProvider) {
      return { duration: null, price: null };
    }
    const o = providerOverrides.find((x) => x.service_id === svc.id);
    return {
      // duration needs a safe fallback so slots can still work even if an override is missing
      duration:
        (o?.duration != null ? Number(o.duration) : (svc.base_duration || 0)) ||
        0,
      // price remains TBA if not overridden (stylist-specific)
      price: o?.price != null ? Number(o.price) : null,
    };
  };

  // Build a "timeline" of services: each item = {offsetMin, duration}
  // - After chemical services, insert a 30m *gap* by increasing the offset of subsequent items.
  const {
    timeline,
    hasChemical,
    serviceNameForEmail,
    hasUnknownPrice,
    sumActiveDuration,
    sumPrice,
  } = useMemo(() => {
    if (!selectedServices.length || !selectedProvider) {
      return {
        timeline: [],
        hasChemical: false,
        serviceNameForEmail: "",
        hasUnknownPrice: true,
        sumActiveDuration: 0,
        sumPrice: 0,
      };
    }

    let offset = 0;
    let anyChem = false;
    let unknown = false;
    let priceSum = 0;
    const items = [];

    for (const svc of selectedServices) {
      const { duration: d, price: p } = getEffectivePD(svc);
      const dur = Number(d || 0);

      items.push({ offsetMin: offset, duration: dur, svc });

      // pricing (TBA stays out)
      if (isTBA(p)) unknown = true;
      else priceSum += Number(p || 0);

      // next start offset
      offset += dur;
      if (isChemicalService(svc)) {
        anyChem = true;
        // Insert a 30m GAP — not booked, just shifts the next service.
        offset += 30;
      }
    }

    const nameForEmail =
      selectedServices.map((s) => s.name).join(", ") +
      (anyChem ? " (+processing gap)" : "");

    return {
      timeline: items, // for slot search & saving
      hasChemical: anyChem,
      serviceNameForEmail: nameForEmail,
      hasUnknownPrice: unknown,
      sumActiveDuration: items.reduce((acc, it) => acc + it.duration, 0), // no gaps
      sumPrice: priceSum,
    };
  }, [selectedServices, providerOverrides, selectedProvider]);

  // compute free slots for the whole timeline (first service start), checking each segment individually
  useEffect(() => {
    if (!selectedServices.length || !selectedProvider || !selectedDate) return;

    let active = true;
    (async () => {
      setSlotsLoading(true);
      try {
        const dayStart = startOfDay(selectedDate);
        const dayEnd = endOfDay(selectedDate);

        const windows = getWindowsForWeekday(
          selectedProvider.weekly_hours,
          dayStart.getDay()
        );
        if (!windows.length) {
          setAvailableSlots([]);
          return;
        }

        // total span (from first start to end of last service) includes gaps implicitly
        const totalSpan =
          timeline.length
            ? timeline[timeline.length - 1].offsetMin +
              timeline[timeline.length - 1].duration
            : 30;

        const stepMins = 15;
        let candidates = buildSlotsFromWindows(dayStart, windows, stepMins, totalSpan);

        // if today, don't offer past times
        const now = new Date();
        if (dayStart.getTime() === startOfDay(now).getTime()) {
          candidates = candidates.filter((t) => t > now);
        }
        if (!candidates.length) {
          setAvailableSlots([]);
          return;
        }

        // get bookings for the day for this stylist (include any that overlap the day)
        const { data: existing } = await supabase
          .from("bookings")
          .select("start,end")
          .eq("resource_id", selectedProvider.id)
          .lt("start", dayEnd.toISOString())
          .gt("end", dayStart.toISOString());

        const busy = (existing || []).map((b) => ({
          start: new Date(b.start),
          end: new Date(b.end),
        }));

        // A slot is free if EVERY service segment (with offsets) doesn't overlap busy
        const free = candidates.filter((base) => {
          return timeline.every((seg) => {
            const s = addMinutes(base, seg.offsetMin);
            const e = addMinutes(s, seg.duration);
            return busy.every((b) => !rangesOverlap(s, e, b.start, b.end));
          });
        });

        if (active) setAvailableSlots(free);
      } finally {
        if (active) setSlotsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedServices, selectedProvider, selectedDate, timeline]);

  // step 1 toggle (add/remove)
  const toggleService = (svc) => {
    setSelectedServices((prev) => {
      const exists = prev.some((x) => x.id === svc.id);
      const next = exists ? prev.filter((x) => x.id !== svc.id) : [...prev, svc];
      return uniqById(next);
    });
  };

  // ---------- save as grouped rows (with 30m GAP after chemical; no processing row) ----------
  async function saveBooking() {
    if (!selectedServices.length || !selectedProvider || !selectedDate || !selectedTime) return;

    if (!client.first_name || !client.last_name || (!client.email && !client.mobile)) {
      alert("Please enter your first & last name, and at least email or mobile.");
      return;
    }

    const normalizePhone = (s = "") => String(s).replace(/[^\d]/g, "");

    setSaving(true);
    try {
      const first = String(client.first_name || "").trim();
      const last = String(client.last_name || "").trim();
      const email = String(client.email || "").trim().toLowerCase();
      const mobileN = normalizePhone(client.mobile || "");

      const start = new Date(selectedDate);
      start.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);

      // Build rows using the precomputed timeline (gaps already baked into offsets)
      const rows = timeline.map((seg) => {
        const sStart = addMinutes(start, seg.offsetMin);
        const sEnd = addMinutes(sStart, seg.duration);
        const { price: p } = getEffectivePD(seg.svc);
        return {
          title: seg.svc.name,
          category: seg.svc.category || null,
          duration: seg.duration,
          price: p,
          start: sStart.toISOString(),
          end: sEnd.toISOString(),
          service_id: seg.svc.id,
        };
      });

      const totalStartISO = rows[0].start;
      const totalEndISO = rows[rows.length - 1].end;
      const bookingId = uuidv4();

      // ---------- find-or-create client ----------
      let clientId = null;

      if (email) {
        const { data: byEmail, error: findEmailErr } = await supabase
          .from("clients")
          .select("id, first_name, last_name, email, mobile")
          .ilike("email", email)
          .limit(1);
        if (findEmailErr) throw findEmailErr;

        if (byEmail?.length) {
          clientId = byEmail[0].id;

          const patch = {};
          if (!byEmail[0].first_name && first) patch.first_name = first;
          if (!byEmail[0].last_name && last) patch.last_name = last;
          if (!byEmail[0].mobile && mobileN) patch.mobile = mobileN;

          if (Object.keys(patch).length) {
            const { error: updErr } = await supabase
              .from("clients")
              .update(patch)
              .eq("id", clientId);
            if (updErr) throw updErr;
          }
        } else {
          const { data: created, error: insErr } = await supabase
            .from("clients")
            .insert([
              {
                first_name: first,
                last_name: last || null,
                email: email,
                mobile: mobileN || null,
              },
            ])
            .select("id")
            .single();
          if (insErr) throw insErr;
          clientId = created.id;
        }
      } else {
        const { data: candidates, error: findMobErr } = await supabase
          .from("clients")
          .select("id, first_name, last_name, mobile")
          .or(`mobile.eq.${mobileN},mobile.ilike.%${mobileN}%`)
          .limit(20);
        if (findMobErr) throw findMobErr;

        const existing = (candidates || []).find(
          (r) =>
            normalizePhone(r.mobile || "") === mobileN &&
            String(r.first_name || "").trim().toLowerCase() === first.toLowerCase() &&
            String(r.last_name || "").trim().toLowerCase() === last.toLowerCase()
        );

        if (existing) {
          clientId = existing.id;
        } else {
          const { data: created, error: insErr } = await supabase
            .from("clients")
            .insert([
              {
                first_name: first,
                last_name: last || null,
                email: null,
                mobile: mobileN,
              },
            ])
            .select("id")
            .single();
          if (insErr) throw insErr;
          clientId = created.id;
        }
      }

      // Fetch day bookings once and check overlaps per service row (include any that overlaps the day)
      const dayStartISO = startOfDay(selectedDate).toISOString();
      const dayEndISO = endOfDay(selectedDate).toISOString();
      const { data: dayBookings, error: dayErr } = await supabase
        .from("bookings")
        .select("start,end")
        .eq("resource_id", selectedProvider.id)
        .lt("start", dayEndISO)
        .gt("end", dayStartISO);
      if (dayErr) throw dayErr;

      for (const r of rows) {
        const s = new Date(r.start);
        const e = new Date(r.end);
        const clash = (dayBookings || []).some((b) =>
          rangesOverlap(s, e, new Date(b.start), new Date(b.end))
        );
        if (clash) {
          alert("Sorry, one of those times was just taken. Please pick another slot.");
          return;
        }
      }

      // create grouped rows (we'll sanitize before insert)
      const payloadRows = rows.map((r) => ({
        booking_id: bookingId,
        title: r.title,
        category: r.category,
        client_id: clientId,
        client_name: `${first} ${last}`.trim(),
        resource_id: selectedProvider.id,
        start: r.start,
        end: r.end,
        duration: r.duration,
        price: r.price,
        status: "confirmed",
        service_id: r.service_id,
      }));

      const inserted = await safeInsertBookings(payloadRows);

      // log summary
      try {
        await SaveBookingsLog({
          action: "created",
          booking_id: bookingId,
          client_id: clientId,
          client_name: `${first} ${last}`.trim(),
          stylist_id: selectedProvider.id,
          stylist_name: selectedProvider.name || selectedProvider.title || "Unknown",
          service: {
            name:
              serviceNameForEmail ||
              selectedServices[0]?.name ||
              "Multiple services",
            category: "Multi",
            price: sumPrice,
            duration: sumActiveDuration, // only active time, no gaps
          },
          start: totalStartISO,
          end: totalEndISO,
          logged_by: null,
          reason: "Online Booking (multi)",
          before_snapshot: null,
          after_snapshot: inserted?.[0] || null,
          skipStaffLookup: true,
        });
      } catch (e) {
        console.warn("Booking saved, but log write failed:", e?.message);
      }

      // emails (combined)
      if (email) {
        try {
          await sendBookingEmails({
            customerEmail: email,
            businessEmail: BUSINESS.notifyEmail,
            business: BUSINESS,
            booking: { start: totalStartISO, end: totalEndISO, client_name: `${first} ${last}`.trim() },
            service: { name: serviceNameForEmail },
            provider: selectedProvider,
            notes: (client.notes || "").trim(),
            customerName: `${first} ${last}`.trim(),
            client: { first_name: first, last_name: last },
            bookingClientName: `${first} ${last}`.trim(),
            customerPhone: mobileN,
          });
        } catch (e) {
          console.error("[email] failed:", e);
        }
      }

      alert("Thanks! Your booking request has been sent.");
      resetBookingFlow();
    } catch (e) {
      console.error("saveBooking failed", e);
      alert("Couldn't save booking. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // HEADER (logo 4× larger)
  const header = (
    <div className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-neutral-800">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
        <img
          src={BUSINESS.logoSrc}
          alt={BUSINESS.name}
          className="w-40 h-40 rounded-full object-cover"
          onError={(e) => {
            e.currentTarget.src = "/edge-logo.png";
          }}
        />
        <div>
          <h1 className="text-2xl font-semibold text-white">{BUSINESS.name}</h1>
          <p className="text-sm text-gray-300">{BUSINESS.address}</p>
        </div>
      </div>
    </div>
  );

  // ---------- Accordion Services (replaces ServiceList) ----------
  const AccordionServices = () => {
    // group by category
    const grouped = useMemo(() => {
      const map = new Map();
      for (const s of services) {
        const cat = s.category || "Other";
        if (!map.has(cat)) map.set(cat, []);
        map.get(cat).push(s);
      }
      return Array.from(map.entries()).sort(([a], [b]) =>
        String(a).localeCompare(String(b))
      );
    }, [services]);

    const [openCat, setOpenCat] = useState(() =>
      grouped.length ? grouped[0][0] : null
    );
    const catRefs = useRef({});

    const toggleCat = (cat) => {
      setOpenCat((curr) => {
        const next = curr === cat ? null : cat;
        requestAnimationFrame(() => {
          const el = catRefs.current[cat];
          if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
        return next;
      });
    };

    return (
      <div className="space-y-3">
        {grouped.map(([cat, list]) => (
          <div
            key={cat}
            ref={(el) => (catRefs.current[cat] = el)}
            className="rounded-xl border border-neutral-800"
          >
            <button
              type="button"
              onClick={() => toggleCat(cat)}
              className="w-full flex items-center justify-between px-4 py-3 bg-neutral-900/70 hover:bg-neutral-900 text-left"
            >
              <span className="font-medium">
                {cat}
                {cat.toLowerCase().includes("treat") && (
                  <span className="ml-2 text-[11px] px-2 py-0.5 rounded bg-amber-600/30 text-amber-300 align-middle">
                    chemical
                  </span>
                )}
              </span>
              <span className="text-sm text-gray-400">
                {openCat === cat ? "Hide" : "Show"}
              </span>
            </button>

            {openCat === cat && (
              <div className="relative z-10 px-3 pb-3 bg-neutral-950/40">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 w-full">
                  {list.map((svc) => {
                    const { duration, price } = getEffectivePD(svc);
                    const selected = selectedServices.some((x) => x.id === svc.id);
                    const dLabel = selectedProvider ? minsToLabel(duration) : "—";
                    const pLabel =
                      selectedProvider && !isTBA(price) ? money(price) : "TBA";
                    return (
                      <button
                        key={svc.id}
                        onClick={() => toggleService(svc)}
                        className={`text-left rounded-xl border px-4 py-3 hover:bg-neutral-800/60 transition w-full
                          ${
                            selected
                              ? "border-amber-500 bg-neutral-800/70"
                              : "border-neutral-800 bg-neutral-900/40"
                          }`}
                      >
                        <div className="min-w-0">
                          <p className="font-medium break-words">
                            {svc.name}
                            {isChemicalService(svc) && (
                              <span className="ml-2 text-[11px] px-2 py-0.5 rounded bg-amber-600/30 text-amber-300">
                                chemical
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400">
                            {dLabel} • {pLabel}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // CART SECTION (right side, wider; Continue at top)
  const CartSection = () => {
    if (!selectedServices.length) return null;

    return (
      <section className="w-full min-w-0 bg-neutral-900/90 rounded-2xl shadow p-5 border-2 border-amber-600/40">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-white">Your services</h3>
          <button
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-sm whitespace-nowrap"
            disabled={!selectedServices.length}
            onClick={() => setStep(2)}
          >
            Continue →
          </button>
        </div>

        {!selectedProvider && (
          <p className="mb-3 text-xs text-amber-300">
            Select a stylist to see exact time and price.
          </p>
        )}

        <ul className="space-y-3">
          {selectedServices.map((svc) => {
            const { duration, price } = getEffectivePD(svc);
            const dLabel = selectedProvider ? minsToLabel(duration) : "—";
            const pLabel =
              selectedProvider && !isTBA(price) ? money(price) : "TBA";
            return (
              <li
                key={svc.id}
                className="flex items-start justify-between gap-3 bg-neutral-800/70 rounded-xl px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-base font-medium text-white break-words">
                    {svc.name}
                    {isChemicalService(svc) && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded bg-amber-600/30 text-amber-300">
                        chemical
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-300">
                    {dLabel} {pLabel !== "TBA" ? "• " + pLabel : "• TBA"}
                  </p>
                </div>
                <button
                  aria-label={`Remove ${svc.name}`}
                  className="text-white/80 hover:text-white text-lg leading-none shrink-0"
                  onClick={() => toggleService(svc)}
                  title="Remove"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>

        {hasChemical && selectedProvider && (
          <div className="mt-3 text-sm text-amber-300">
            Processing time for chemical treatments applied.
          </div>
        )}

        <div className="mt-5 border-t border-neutral-700 pt-4">
          <div className="flex items-center justify-between text-base">
            <span className="text-gray-300 whitespace-nowrap">Total time</span>
            <span className="text-white font-medium text-right">
              {selectedProvider ? minsToLabel(sumActiveDuration) : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between text-lg mt-2">
            <span className="text-gray-300 whitespace-nowrap">Total price</span>
            <span className="text-white font-semibold text-right">
              {hasUnknownPrice ? "TBA" : money(sumPrice)}
            </span>
          </div>
        </div>

        {hasUnknownPrice && (
          <p className="mt-3 text-xs text-gray-400">
            Please selecta stylist for price.
          </p>
        )}
      </section>
    );
  };

  return (
    <div className="min-h-screen bg-black text-white text-[15px]">
      {header}

      {/* Mobile: pin the cart right under the header (top of page) */}
      <div className="max-w-6xl mx-auto px-4 pt-6 lg:hidden">
        <CartSection />
      </div>

      {/* Desktop grid: sidebar / main / wide cart */}
      <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[220px_1fr_420px] gap-6">
        {/* Left: Stepper */}
        <aside>
          <Stepper
            step={step}
            setStep={setStep}
            selectedService={lastPickedService}
            selectedProvider={selectedProvider}
            selectedDate={selectedDate}
            selectedTime={selectedTime}
          />
        </aside>

        {/* Center: Steps */}
        <main className="space-y-6">
          {step === 1 && (
            <section className="bg-neutral-900/80 rounded-2xl shadow p-5 border border-neutral-800">
              <h2 className="font-semibold mb-4 text-xl text-white">
                Select services
              </h2>

              {/* Accordion categories */}
              <AccordionServices />

              <div className="mt-5 flex items-center justify-between">
                <span className="text-sm text-gray-300">
                  {selectedServices.length > 0
                    ? selectedProvider
                      ? `${minsToLabel(sumActiveDuration)} • ${
                          hasUnknownPrice ? "TBA" : money(sumPrice)
                        }`
                      : "Pick a stylist to see time & price"
                    : "Choose one or more services"}
                </span>
                <button
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40"
                  disabled={!selectedServices.length}
                  onClick={() => setStep(2)}
                >
                  Continue →
                </button>
              </div>

              {(hasUnknownPrice || !selectedProvider) && selectedServices.length > 0 && (
                <p className="mt-2 text-xs text-gray-400">
                  Prices for TBA services will be discussed during the appointment.
                </p>
              )}
            </section>
          )}

          {step === 2 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-xl">Select a stylist</h2>
                <button
                  className="text-sm text-white/80 hover:text-white underline"
                  onClick={() => setStep(1)}
                >
                  + Add/remove services
                </button>
              </div>

              <ProviderList
                providers={providers}
                selectedServices={selectedServices}
                selectedProvider={selectedProvider}
                onSelect={(p) => {
                  setSelectedProvider(p);
                  setSelectedDate(null);
                  setSelectedTime(null);
                }}
                onNext={() => setStep(3)}
              />
            </section>
          )}

          {step === 3 && (
            <CalendarSlots
              viewDate={viewDate}
              setViewDate={setViewDate}
              selectedService={lastPickedService}
              selectedProvider={selectedProvider}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              availableSlots={availableSlots}
              selectedTime={selectedTime}
              setSelectedTime={setSelectedTime}
              slotsLoading={slotsLoading}
              onPickTime={() => setStep(4)}
            />
          )}

          {step === 4 && (
            <ClientForm
              business={BUSINESS}
              client={client}
              setClient={setClient}
              saving={saving}
              saved={saved}
              disabled={
                saving ||
                !selectedServices.length ||
                !selectedProvider ||
                !selectedDate ||
                !selectedTime ||
                !client.first_name ||
                !client.last_name ||
                (!client.email && !client.mobile)
              }
              onSave={saveBooking}
            />
          )}
        </main>

        {/* Right: Cart (sticky on desktop) */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <CartSection />
          </div>
        </aside>
      </div>

      <footer className="max-w-6xl mx-auto px-4 py-10 text-center text-xs text-gray-400">
        <p>Powered by Essateric Solutions</p>
      </footer>
    </div>
  );
}
