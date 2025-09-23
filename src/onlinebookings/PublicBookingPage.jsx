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
  for (const k of BOOKING_COLUMNS) if (row[k] !== undefined) out[k] = row[k];
  if (out.duration != null) out.duration = Math.round(Number(out.duration) || 0);
  if (out.price != null) out.price = Number(out.price) || 0;
  return out;
}

// very simple email check + common gmail typo guard
function isValidEmail(s) {
  if (!s) return false;
  const e = String(s).trim().toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  if (!ok) return false;
  const typos = ["gmail.c", "gmail.co", "gmail.con", "gmail.coom", "gmail.cc"];
  if (typos.some((t) => e.endsWith(`@${t}`))) return false;
  return true;
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

// fallback normaliser (covers CSV/JSON strings if they ever appear)
function normalizeServiceIds(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s.startsWith("[") && s.endsWith("]")) {
      try {
        const arr = JSON.parse(s);
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    }
    if (s.includes(",")) return s.split(",").map((x) => x.trim()).filter(Boolean);
    return [s];
  }
  return [raw];
}

// ---------- INSERT via RPC (no read-after-insert) ----------
async function safeInsertBookings(rows) {
  const { error } = await supabase.rpc("public_create_booking_multi", {
    p_rows: rows,
  });
  if (error) throw error;
  return [];
}

export default function PublicBookingPage() {
  const [step, setStep] = useState(1);

  // All services/providers
  const [services, setServices] = useState([]);
  const [providers, setProviders] = useState([]);

  // MULTI service selection
  const [selectedServices, setSelectedServices] = useState([]);
  const lastPickedService = selectedServices[selectedServices.length - 1] || null;

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

  // Inline toast (success / error) shown in-page
  const [toast, setToast] = useState(null);
  function showToast(message, { type = "success", ms = 5000 } = {}) {
    setToast({ message, type, ts: Date.now() });
    if (ms > 0) {
      window.clearTimeout(showToast._t);
      showToast._t = window.setTimeout(() => setToast(null), ms);
    }
  }

  const isTBA = (p) =>
    p == null || p === "" || Number(p) === 0 || Number.isNaN(Number(p));

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

  // ===== Fetch services + providers + map services to providers (via RPCs) =====
  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.rpc("public_get_services");
      setServices(s || []);

      const { data: staff } = await supabase.rpc("public_get_staff");

      let links = [];
      {
        const { data: l } = await supabase.rpc("public_get_staff_services");
        links = l || [];
      }

      const map = new Map();
      for (const r of links) {
        if (!map.has(r.staff_id)) map.set(r.staff_id, new Set());
        map.get(r.staff_id).add(r.service_id);
      }

      const normalised = (staff || []).map((p) => {
        const baseServiceIds = Array.from(map.get(p.id) || []);
        const isMartinByName = String(p.name || p.title || "")
          .trim()
          .toLowerCase() === "martin";
        const isMartinById =
          p.id === "9cf991b3-2ea5-44c1-b915-615fdd9f993c";
        const isMartin = isMartinById || isMartinByName;

        return {
          ...p,
          service_ids:
            baseServiceIds.length > 0
              ? baseServiceIds
              : isMartin
              ? (s || []).map((x) => x.id)
              : baseServiceIds,
          online_bookings: true,
          is_active: true,
          title: isMartin ? "Senior Stylist" : p.title || null,
          role: isMartin ? "stylist" : p.role,
        };
      });

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
  const getEffectivePD = (svc) => {
    if (!selectedProvider) return { duration: null, price: null };
    const o = providerOverrides.find((x) => x.service_id === svc.id);
    return {
      duration:
        (o?.duration != null ? Number(o.duration) : svc.base_duration || 0) ||
        0,
      price: o?.price != null ? Number(o.price) : null,
    };
  };

  // Build service timeline (includes 30m gap after chemical services)
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
      if (isTBA(p)) unknown = true;
      else priceSum += Number(p || 0);
      offset += dur;
      if (isChemicalService(svc)) {
        anyChem = true;
        offset += 30; // processing gap
      }
    }

    const nameForEmail =
      selectedServices.map((s) => s.name).join(", ") +
      (anyChem ? " (+processing gap)" : "");

    return {
      timeline: items,
      hasChemical: anyChem,
      serviceNameForEmail: nameForEmail,
      hasUnknownPrice: unknown,
      sumActiveDuration: items.reduce((acc, it) => acc + it.duration, 0),
      sumPrice: priceSum,
    };
  }, [selectedServices, providerOverrides, selectedProvider]);

  // Compute free slots (respect each segment + gaps)
  useEffect(() => {
    if (!selectedServices.length || !selectedProvider || !selectedDate) return;

    let active = true;
    (async () => {
      setSlotsLoading(true);
      try {
        const dayStart = startOfDay(selectedDate);
        const dayEnd = endOfDay(selectedDate);
        const dayStartISO = dayStart.toISOString();
        const dayEndISO = dayEnd.toISOString();

        const windows = getWindowsForWeekday(
          selectedProvider.weekly_hours,
          dayStart.getDay()
        );
        if (!windows.length) {
          setAvailableSlots([]);
          return;
        }

        const totalSpan = timeline.length
          ? timeline[timeline.length - 1].offsetMin +
            timeline[timeline.length - 1].duration
          : 30;

        const stepMins = 15;
        let candidates = buildSlotsFromWindows(
          dayStart,
          windows,
          stepMins,
          totalSpan
        );

        const now = new Date();
        if (dayStart.getTime() === startOfDay(now).getTime()) {
          candidates = candidates.filter((t) => t > now);
        }
        if (!candidates.length) {
          setAvailableSlots([]);
          return;
        }

        const { data: spans, error: spansErr } = await supabase.rpc(
          "public_get_booked_spans",
          { p_staff: selectedProvider.id, p_start: dayStartISO, p_end: dayEndISO }
        );
        if (spansErr) throw spansErr;

        const busy = (spans || []).map((b) => ({
          start: new Date(b.start),
          end: new Date(b.end),
        }));

        const free = candidates.filter((base) =>
          timeline.every((seg) => {
            const s = addMinutes(base, seg.offsetMin);
            const e = addMinutes(s, seg.duration);
            return busy.every((b) => !rangesOverlap(s, e, b.start, b.end));
          })
        );

        if (active) setAvailableSlots(free);
      } finally {
        if (active) setSlotsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedServices, selectedProvider, selectedDate, timeline]);

  // toggle service
  const toggleService = (svc) => {
    setSelectedServices((prev) => {
      const exists = prev.some((x) => x.id === svc.id);
      const next = exists ? prev.filter((x) => x.id !== svc.id) : [...prev, svc];
      return uniqById(next);
    });
  };

  // ---------- navigation helpers ----------
  const canContinue = useMemo(() => {
    if (step === 1) return selectedServices.length > 0;
    if (step === 2) return !!selectedProvider;
    if (step === 3) return !!(selectedDate && selectedTime);
    return false;
  }, [step, selectedServices.length, selectedProvider, selectedDate, selectedTime]);

  const handleContinue = () => {
    if (step === 1) setStep(2);
    else if (step === 2 && selectedProvider) setStep(3);
    else if (step === 3 && selectedDate && selectedTime) setStep(4);
  };

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
    } else if (step === 3) {
      // going back to provider selection: clear chosen time/date
      setSelectedDate(null);
      setSelectedTime(null);
      setStep(2);
    } else if (step === 4) {
      setStep(3);
    }
  };

  // ---------- save grouped rows ----------
  async function saveBooking() {
    if (!selectedServices.length || !selectedProvider || !selectedDate || !selectedTime) return;

    if (!client.first_name || !client.last_name || (!client.email && !client.mobile)) {
      alert("Please enter your first & last name, and at least email or mobile.");
      return;
    }

    const normalizePhone = (s = "") => String(s).replace(/[^\d]/g, "");

    setSaving(true);
    try {
      // 1) Names/contact
      const first = String(client.first_name || "").trim();
      const last = String(client.last_name || "").trim();
      const email = String(client.email || "").trim().toLowerCase();
      const mobileN = normalizePhone(client.mobile || "");

      // 2) Build rows from timeline
      const start = new Date(selectedDate);
      start.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);

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

      // 3) Find-or-create client
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
                email,
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
            String((r.mobile || "").replace(/[^\d]/g, "")) === mobileN &&
            String(r.first_name || "").trim().toLowerCase() ===
              first.toLowerCase() &&
            String(r.last_name || "").trim().toLowerCase() ===
              last.toLowerCase()
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

      // 4) Clash check
      const dayStartISO = startOfDay(selectedDate).toISOString();
      const dayEndISO = endOfDay(selectedDate).toISOString();
      const { data: dayBookings, error: dayErr } = await supabase.rpc(
        "public_get_booked_spans",
        { p_staff: selectedProvider.id, p_start: dayStartISO, p_end: dayEndISO }
      );
      if (dayErr) throw dayErr;

      for (const r of rows) {
        const s = new Date(r.start);
        const e = new Date(r.end);
        const clash = (dayBookings || []).some((b) =>
          rangesOverlap(s, e, new Date(b.start), new Date(b.end))
        );
        if (clash) {
          alert(
            "Sorry, one of those times was just taken. Please pick another slot."
          );
          return;
        }
      }

      // 5) Insert bookings (grouped)
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
      await safeInsertBookings(payloadRows);

      // 6) Save client's notes
      try {
        const rawNotes = String(client.notes || "").trim();
        if (rawNotes) {
          const { error: rpcErr } = await supabase.rpc(
            "public_add_client_note_for_group",
            {
              p_booking_id: bookingId,
              p_client_id: clientId,
              p_note: rawNotes,
            }
          );
          if (rpcErr) throw rpcErr;
        }
      } catch (e) {
        console.warn(
          "[client_notes] group RPC failed, falling back:",
          e?.message
        );
        try {
          const rawNotes = String(client.notes || "").trim();
          if (rawNotes) {
            const { data: rowIds, error: rowsErr } = await supabase
              .from("bookings")
              .select("id")
              .eq("booking_id", bookingId)
              .order("start", { ascending: true })
              .limit(1);
            if (rowsErr) throw rowsErr;
            const bookingRowId = rowIds?.[0]?.id || null;

            await supabase.from("client_notes").insert([
              {
                client_id: clientId,
                note_content: `Notes added by client: ${rawNotes}`,
                created_by: "client",
                booking_id: bookingRowId,
              },
            ]);
          }
        } catch (e2) {
          console.warn("[client_notes] fallback insert failed:", e2?.message);
        }
      }

      // 7) Log
      try {
        await SaveBookingsLog({
          action: "created",
          booking_id: bookingId,
          client_id: clientId,
          client_name: `${first} ${last}`.trim(),
          stylist_id: selectedProvider.id,
          stylist_name:
            selectedProvider.name || selectedProvider.title || "Unknown",
          service: {
            name:
              serviceNameForEmail ||
              selectedServices[0]?.name ||
              "Multiple services",
            category: "Multi",
            price: sumPrice,
            duration: sumActiveDuration,
          },
          start: totalStartISO,
          end: totalEndISO,
          logged_by: null,
          reason: "Online Booking (multi)",
          before_snapshot: null,
          after_snapshot: null,
          skipStaffLookup: true,
        });
      } catch (e) {
        console.warn("Booking saved, but log write failed:", e?.message);
      }

      // 8) Emails
      try {
        const customerEmailToUse = isValidEmail(email) ? email : undefined;
        const resp = await sendBookingEmails({
          businessEmail: BUSINESS.notifyEmail,
          business: BUSINESS,
          booking: {
            start: totalStartISO,
            end: totalEndISO,
            client_name: `${first} ${last}`.trim(),
          },
          service: { name: serviceNameForEmail },
          provider: selectedProvider,
          notes: (client.notes || "").trim(),
          customerPhone: mobileN,
          customerEmail: customerEmailToUse,
          customerName: `${first} ${last}`.trim(),
          client: { first_name: first, last_name: last },
          bookingClientName: `${first} ${last}`.trim(),
        });
        if (!resp?.ok && resp !== undefined) {
          console.warn("[email] server responded not ok:", resp);
          showToast(
            "Booking saved, but emails couldn’t be sent. We’ll confirm by phone/SMS.",
            { type: "error" }
          );
        }
      } catch (e) {
        console.error("[email] failed:", e);
        showToast(
          "Booking saved, but emails couldn’t be sent. We’ll confirm by phone/SMS.",
          { type: "error" }
        );
      }

      // 9) Done
      showToast("Thanks! Your booking request has been sent successfully.", {
        type: "success",
      });
      resetBookingFlow();
    } catch (e) {
      console.error("saveBooking failed", e);
      alert("Couldn't save booking. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // HEADER
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

  // ---------- Accordion Services ----------
  const AccordionServices = () => {
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
                    const selected = selectedServices.some(
                      (x) => x.id === svc.id
                    );
                    const dLabel = selectedProvider
                      ? minsToLabel(duration)
                      : "—";
                    const pLabel =
                      selectedProvider && !isTBA(price)
                        ? money(price)
                        : "TBA";
                    return (
                      <button
                        key={svc.id}
                        onClick={() => toggleService(svc)}
                        className={`text-left rounded-xl border px-4 py-3 hover:bg-neutral-800/60 transition w-full ${
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

  // CART SECTION
  const CartSection = () => {
    if (!selectedServices.length) return null;

    return (
      <section className="w-full min-w-0 bg-neutral-900/90 rounded-2xl shadow p-5 border-2 border-amber-600/40">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-white">Your services</h3>
          {/* Back + Continue controls (visible for steps 1–3) */}
          <div className="flex items-center gap-2">
            {step > 1 && step < 4 && (
              <button
                className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-sm"
                onClick={handleBack}
              >
                ← Back
              </button>
            )}
            {step < 4 && (
              <button
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-sm whitespace-nowrap"
                disabled={!canContinue}
                onClick={handleContinue}
              >
                Continue →
              </button>
            )}
          </div>
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
            Please select a stylist for price.
          </p>
        )}
      </section>
    );
  };

  return (
    <div className="min-h-screen bg-black text-white text-[15px]">
      {header}

      {/* Inline toast banner */}
      {toast && (
  <div
    className="
      fixed z-50 inset-x-0
      bottom-4 top-auto md:top-4 md:bottom-auto
      px-4 pointer-events-none
    "
    role="status"
    aria-live="polite"
  >
    <div
      className={`max-w-xl mx-auto pointer-events-auto
        flex items-start gap-3 rounded-xl border px-4 py-3 shadow
        ${toast.type === "success"
          ? "bg-emerald-900/90 border-emerald-700 text-emerald-100"
          : "bg-rose-900/90 border-rose-700 text-rose-100"}`}
    >
      <span className="mt-0.5 text-lg">{toast.type === "success" ? "✅" : "⚠️"}</span>
      <div className="flex-1">{toast.message}</div>
      <button
        className="shrink-0 text-white/80 hover:text-white"
        onClick={() => setToast(null)}
        aria-label="Dismiss"
        title="Dismiss"
      >
        ×
      </button>
    </div>
  </div>
)}

      {/* Mobile cart */}
      <div className="max-w-6xl mx-auto px-4 pt-6 lg:hidden">
        <CartSection />
      </div>

      {/* Desktop grid */}
      <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[220px_1fr_420px] gap-6">
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

        <main className="space-y-6">
          {step === 1 && (
            <section className="bg-neutral-900/80 rounded-2xl shadow p-5 border border-neutral-800">
              <h2 className="font-semibold mb-4 text-xl text-white">
                Select services
              </h2>
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
                <div className="flex items-center gap-2">
                  {/* no Back on step 1 */}
                  <button
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40"
                    disabled={!canContinue}
                    onClick={handleContinue}
                  >
                    Continue →
                  </button>
                </div>
              </div>
              {(hasUnknownPrice || !selectedProvider) &&
                selectedServices.length > 0 && (
                  <p className="mt-2 text-xs text-gray-400">
                    Prices for TBA services will be discussed during the
                    appointment.
                  </p>
                )}
            </section>
          )}

          {step === 2 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-xl">Select a stylist</h2>
                <div className="flex items-center gap-2">
                  <button
                    className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-sm"
                    onClick={handleBack}
                  >
                    ← Back
                  </button>
                  <button
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-sm"
                    disabled={!canContinue}
                    onClick={handleContinue}
                  >
                    Continue →
                  </button>
                </div>
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
              />
            </section>
          )}

          {step === 3 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-xl">Select a time</h2>
                <div className="flex items-center gap-2">
                  <button
                    className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-sm"
                    onClick={handleBack}
                  >
                    ← Back
                  </button>
                  <button
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-sm"
                    disabled={!canContinue}
                    onClick={handleContinue}
                  >
                    Continue →
                  </button>
                </div>
              </div>

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
            </section>
          )}

          {step === 4 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-xl">Your details</h2>
                <button
                  className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-sm"
                  onClick={handleBack}
                >
                  ← Back
                </button>
              </div>

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
            </section>
          )}
        </main>

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
