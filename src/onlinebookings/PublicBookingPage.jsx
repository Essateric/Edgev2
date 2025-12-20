// src/onlinebookings/PublicBookingPage.jsx
import React, { useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../supabaseClient";

/* UI bits */
import Stepper from "./components/Stepper";
import ProviderList from "./components/ProviderList";
import CalendarSlots from "./components/CalendarSlots";
import ClientForm from "./components/ClientForm";
import ServiceList from "./components/ServiceList";

/* Hooks */
import useToast from "./hooks/useToast";
import useServicesAndProviders from "./hooks/useServicesAndProviders";
import useProviderOverrides from "./hooks/useProviderOverrides";
import useTimeline from "./hooks/useTimeline";
import useSlots from "./hooks/useSlots";

/* Lib */
import { sendBookingEmails } from "./lib/email";
import SaveBookingsLog from "../components/bookings/SaveBookingsLog";
import { safeInsertBookings } from "./api";

/* Config + helpers */
import { BRAND } from "../config/brand";
import { MIN_NOTICE_HOURS, BUSINESS } from "./config";
import { money } from "./lib/bookingUtils";
import { isValidEmail, uniqById, minsToLabel } from "./helpers";

/* ---------- local helpers ---------- */
const initialClient = {
  first_name: "",
  last_name: "",
  email: "",
  mobile: "",
  notes: "",
};

const normalizePhone = (s = "") => String(s).replace(/[^\d]/g, "");
const normName = (s = "") => String(s || "").trim().toLowerCase();

/**
 * Find-or-create client ID for PUBLIC bookings.
 * Rules:
 * - If email provided: match by email (case-insensitive). Patch missing fields.
 * - Else match by (first+last + mobile). Patch missing fields.
 * - If not found: create new client row -> returns UUID.
 *
 * IMPORTANT:
 * This will only persist into bookings.client_id if your DB trigger
 * (bookings_sanitize_anon) no longer forces new.client_id := null.
 */
async function findOrCreateClientId({ first, last, email, mobileN }) {
  const firstN = String(first || "").trim();
  const lastN = String(last || "").trim();
  const emailN = String(email || "").trim().toLowerCase();
  const mobileNN = normalizePhone(mobileN || "");

  if (!firstN || !lastN) throw new Error("First name and last name are required.");
  if (!emailN && !mobileNN) throw new Error("Email or mobile is required.");

  // 1) EMAIL path (preferred)
  if (emailN) {
    const { data: existing, error: findErr } = await supabase
      .from("clients")
      .select("id, first_name, last_name, email, mobile")
      .ilike("email", emailN)
      .maybeSingle();

    if (findErr) throw findErr;

    if (existing?.id) {
      // Patch missing bits (non-destructive)
      const patch = {};
      if (!existing.first_name && firstN) patch.first_name = firstN;
      if (!existing.last_name && lastN) patch.last_name = lastN;
      if (!existing.mobile && mobileNN) patch.mobile = mobileNN;

      if (Object.keys(patch).length) {
        const { error: updErr } = await supabase
          .from("clients")
          .update(patch)
          .eq("id", existing.id);

        if (updErr) throw updErr;
      }

      return existing.id;
    }

    // Create new
    const { data: created, error: insErr } = await supabase
      .from("clients")
      .insert([
        {
          first_name: firstN,
          last_name: lastN || null,
          email: emailN,
          mobile: mobileNN || null,
        },
      ])
      .select("id")
      .single();

    if (insErr) throw insErr;
    return created.id;
  }

  // 2) MOBILE path (only if no email)
  {
    // If mobile is empty after normalization, we can't search safely
    if (!mobileNN) throw new Error("Valid mobile is required when email is missing.");

    const { data: candidates, error: mobErr } = await supabase
      .from("clients")
      .select("id, first_name, last_name, email, mobile")
      .or(`mobile.eq.${mobileNN},mobile.ilike.%${mobileNN}%`)
      .limit(25);

    if (mobErr) throw mobErr;

    const firstKey = normName(firstN);
    const lastKey = normName(lastN);

    const match =
      (candidates || []).find((r) => {
        const rMob = normalizePhone(r?.mobile || "");
        const rFirst = normName(r?.first_name);
        const rLast = normName(r?.last_name);
        return rMob === mobileNN && rFirst === firstKey && rLast === lastKey;
      }) || null;

    if (match?.id) {
      // Patch missing bits
      const patch = {};
      if (!match.first_name && firstN) patch.first_name = firstN;
      if (!match.last_name && lastN) patch.last_name = lastN;

      if (Object.keys(patch).length) {
        const { error: updErr } = await supabase
          .from("clients")
          .update(patch)
          .eq("id", match.id);
        if (updErr) throw updErr;
      }

      return match.id;
    }

    // Create new
    const { data: created, error: insErr } = await supabase
      .from("clients")
      .insert([
        {
          first_name: firstN,
          last_name: lastN || null,
          email: null,
          mobile: mobileNN,
        },
      ])
      .select("id")
      .single();

    if (insErr) throw insErr;
    return created.id;
  }
}

export default function PublicBookingPage() {
  const [step, setStep] = useState(1);

  // Selection state
  const [selectedServices, setSelectedServices] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);

  // Client + save
  const [client, setClient] = useState(initialClient);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);

  // Toast
  const { toast, showToast, hideToast } = useToast();
  console.log("PublicBookingPage render – toast =", toast);

  // Data: services + providers
  const { services, providers } = useServicesAndProviders();

  // Staff overrides when provider changes (ALWAYS normalize to array)
  const providerOverridesResult = useProviderOverrides(selectedProvider);
  const providerOverrides = Array.isArray(providerOverridesResult?.overrides)
    ? providerOverridesResult.overrides
    : [];

  // Timeline (multi services, chemical gaps, sums & labels)
  const {
    timeline,
    hasChemical,
    hasUnknownPrice,
    serviceNameForEmail,
    sumActiveDuration,
    sumPrice,
  } = useTimeline({
    selectedServices,
    selectedProvider,
    providerOverrides, // always an array
  });

  // Local helper to compute effective price/duration (restores older behavior)
  const getEffectivePD = (svc) => {
    if (!selectedProvider || !svc) return { duration: null, price: null };
    const o = providerOverrides.find((x) => x?.service_id === svc?.id);
    const baseDuration = Number(svc?.base_duration ?? 0) || 0;
    return {
      duration: (o?.duration != null ? Number(o.duration) : baseDuration) || 0,
      price: o?.price != null ? Number(o.price) : null,
    };
  };

  // Slots (windows, min notice, busy spans, per-segment clash check)
  const { viewDate, setViewDate, availableSlots, slotsLoading } = useSlots({
    selectedServices,
    selectedProvider,
    selectedDate,
    timeline,
  });

  const lastPickedService = selectedServices[selectedServices.length - 1] || null;

  const isTBA = (p) =>
    p == null || p === "" || Number(p) === 0 || Number.isNaN(Number(p));

  function resetBookingFlow() {
    setSelectedServices([]);
    setSelectedProvider(null);
    setSelectedDate(null);
    setSelectedTime(null);
    setClient(initialClient);
    setSaved(null);
    setStep(1);
  }

  // Toggle a service in/out of the cart
  const toggleService = (svc) => {
    setSelectedServices((prev) => {
      const exists = prev.some((x) => x.id === svc.id);
      const next = exists ? prev.filter((x) => x.id !== svc.id) : [...prev, svc];
      return uniqById(next);
    });
  };

  // Continue/back guards
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
      setSelectedDate(null);
      setSelectedTime(null);
      setStep(2);
    } else if (step === 4) {
      setStep(3);
    }
  };

  // ----- Selection summary chip bar -----
  const startDateTime = useMemo(() => {
    if (!selectedDate || !selectedTime) return null;
    const d = new Date(selectedDate);
    d.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
    return d;
  }, [selectedDate, selectedTime]);

  function SelectionSummary({ provider, start, onClear }) {
    if (!provider && !start) return null;

    const dateStr = start
      ? start.toLocaleDateString(undefined, {
          weekday: "short",
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : null;

    const timeStr = start
      ? start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      : null;

    return (
      <div className="max-w-6xl mx-auto px-4 pt-4">
        <div className="flex flex-wrap items-center gap-2 bg-neutral-900/70 border border-neutral-800 rounded-2xl px-4 py-3">
          {provider && (
            <span className="inline-flex items-center gap-2 text-sm px-3 py-1 rounded-full border border-neutral-700 bg-neutral-800 text-white">
              <span className="opacity-80">Stylist</span>
              <span className="font-semibold">
                {provider.name || provider.title || "—"}
              </span>
            </span>
          )}
          {start && (
            <span className="inline-flex items-center gap-2 text-sm px-3 py-1 rounded-full border border-neutral-700 bg-neutral-800 text-white">
              <span className="opacity-80">Time</span>
              <span className="font-semibold">
                {dateStr} • {timeStr}
              </span>
            </span>
          )}

          {(provider || start) && (
            <button
              className="ml-auto px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-sm"
              onClick={onClear}
              type="button"
            >
              Clear selection
            </button>
          )}
        </div>
      </div>
    );
  }

  // ----- Cart (right column / mobile card) -----
  const CartSection = () => {
    if (!selectedServices.length) return null;

    return (
      <section className="w-full min-w-0 bg-neutral-900/90 rounded-2xl shadow p-5 border-2 border-amber-600/40">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xl font-semibold text-white">Your services</h3>
        </div>

        {/* Selected stylist chip */}
        {selectedProvider && (
          <div className="mb-4">
            <span className="inline-flex items-center gap-2 text-sm px-3 py-1 rounded-full border border-neutral-700 bg-amber-600/30 text-amber-100">
              <span className="opacity-80">Stylist</span>
              <span className="font-semibold">
                {selectedProvider.name || selectedProvider.title || "—"}
              </span>
            </span>
          </div>
        )}

        {!selectedProvider && (
          <p className="mb-3 text-xs text-amber-300">
            Select a stylist to see exact time and price.
          </p>
        )}

        <ul className="space-y-3">
          {selectedServices.map((svc) => {
            const { duration, price } =
              typeof getEffectivePD === "function"
                ? getEffectivePD(svc)
                : { duration: null, price: null };

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
                    {svc.is_chemical && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded bg-amber-600/30 text-amber-300">
                        chemical
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-300">
                    {dLabel} • {pLabel}
                  </p>
                </div>
                <button
                  aria-label={`Remove ${svc.name}`}
                  className="text-white/80 hover:text-white text-lg leading-none shrink-0"
                  onClick={() => toggleService(svc)}
                  title="Remove"
                  type="button"
                >
                  Remove
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

  // ---------- save grouped rows ----------
  async function saveBooking() {
    if (!selectedServices.length || !selectedProvider || !selectedDate || !selectedTime) return;

    if (!client.first_name || !client.last_name || (!client.email && !client.mobile)) {
      alert("Please enter your first & last name, and at least email or mobile.");
      return;
    }

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

      // Enforce minimum notice
      {
        const minStart = new Date(Date.now() + MIN_NOTICE_HOURS * 60 * 60 * 1000);
        if (start < minStart) {
          alert(
            "Bookings must be made at least 24 hours in advance. Please choose a later time."
          );
          return;
        }
      }

      const rows = timeline.map((seg) => {
        const sStart = new Date(start.getTime() + seg.offsetMin * 60000);
        const sEnd = new Date(sStart.getTime() + seg.duration * 60000);
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

      // 3) ✅ FIX: Always create/find a client FIRST, and use its UUID in booking rows
      const clientId = await findOrCreateClientId({
        first,
        last,
        email,
        mobileN,
      });

      if (!clientId) throw new Error("Client ID could not be created.");

      // 4) Same-day clash check (per segment)
      const dayStartISO = new Date(new Date(selectedDate).setHours(0, 0, 0, 0)).toISOString();
      const dayEndISO = new Date(new Date(selectedDate).setHours(23, 59, 59, 999)).toISOString();

      const { data: dayBookings, error: dayErr } = await supabase.rpc("public_get_booked_spans", {
        p_staff: selectedProvider.id,
        p_start: dayStartISO,
        p_end: dayEndISO,
      });
      if (dayErr) throw dayErr;

      const rangesOverlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && aEnd > bStart;

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

      // 5) Insert grouped rows
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
        source: "public",
        status: "confirmed",
        service_id: r.service_id,
      }));

      await safeInsertBookings(payloadRows);

      // 5b) HARD GUARANTEE (best-effort):
      // If your DB trigger/RLS/RPC dropped client_id, try to patch missing rows.
      // (Once your bookings_sanitize_anon function no longer sets client_id := null,
      // this should normally do nothing.)
      const { error: linkErr } = await supabase
        .from("bookings")
        .update({
          client_id: clientId,
          client_name: `${first} ${last}`.trim(),
        })
        .eq("booking_id", bookingId)
        .is("client_id", null);

      if (linkErr) {
        console.warn("Post-insert booking link failed:", linkErr.message);
      }

      // notify listeners
      window.dispatchEvent(
        new CustomEvent("bookings:changed", {
          detail: { type: "created", booking_id: bookingId },
        })
      );

      // 6) Client notes – best effort
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
      } catch {
        /* best-effort */
      }

      // 7) Log – best effort
      try {
        await SaveBookingsLog({
          action: "created",
          booking_id: bookingId,
          client_id: clientId,
          client_name: `${first} ${last}`.trim(),
          stylist_id: selectedProvider.id,
          stylist_name: selectedProvider.name || selectedProvider.title || "Unknown",
          service: {
            name: serviceNameForEmail || selectedServices[0]?.name || "Multiple services",
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
      } catch {
        /* non-fatal */
      }

      // 8) Emails – best effort
      try {
        const customerEmailToUse = isValidEmail(email) ? email : undefined;
        await sendBookingEmails({
          businessEmail: BUSINESS.notifyEmail,
          business: BUSINESS,
          booking: { start: totalStartISO, end: totalEndISO, client_name: `${first} ${last}`.trim() },
          service: { name: serviceNameForEmail },
          provider: selectedProvider,
          notes: (client.notes || "").trim(),
          customerPhone: mobileN,
          customerEmail: customerEmailToUse,
          customerName: `${first} ${last}`.trim(),
          client: { first_name: first, last_name: last },
          bookingClientName: `${first} ${last}`.trim(),
        });
      } catch {
        /* non-fatal */
      }

      // 9) Success toast (sticky) + reset AFTER showing toast
      showToast(
        <>
          <div className="font-semibold text-xl md:text-2xl mb-2">
            Thank you for booking with The Edge HD Salon.
          </div>
          <div className="text-base md:text-lg leading-relaxed">
            Your booking request has been received. We will contact you soon to confirm.
            <br className="hidden md:block" />
            In the meantime, if you’d like to join our WhatsApp channel for the latest
            news and updates,&nbsp;
            <a
              href="https://whatsapp.com/channel/0029Vb6Yqs9CXC3LeNFFtB3b"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold"
            >
              click here
            </a>
            .
          </div>
        </>,
        { type: "success", ms: 0 }
      );

      resetBookingFlow();
    } catch (e) {
      console.error("saveBooking failed", e);
      alert("Couldn't save booking. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ----- Header -----
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

  return (
    <div className="min-h-screen bg-black text-white text-[15px]">
      {header}

      <SelectionSummary
        provider={selectedProvider}
        start={startDateTime}
        onClear={() => {
          setSelectedTime(null);
          setSelectedDate(null);
          setSelectedProvider(null);
        }}
      />

      {/* Brand-themed toast */}
      {toast && (
        <div className="fixed inset-0 z-[9999] px-3 sm:px-4 flex items-center justify-center">
          {/* Backdrop – also closes on click */}
          <div
            className="absolute inset-0 bg-black/50"
            aria-hidden="true"
            onClick={hideToast}
          />

          <div
            className="relative w-full max-w-full sm:max-w-[520px] md:max-w-[620px] lg:max-w-[680px]
                 rounded-2xl border shadow-2xl overflow-hidden"
            role="status"
            aria-live="polite"
            style={{
              background: toast.type === "success" ? BRAND.successBg : BRAND.errorBg,
              borderColor: toast.type === "success" ? BRAND.successEdge : BRAND.errorEdge,
              color: toast.type === "success" ? BRAND.successText : BRAND.errorText,
            }}
          >
            <div
              style={{
                height: 6,
                background: toast.type === "success" ? BRAND.successEdge : BRAND.errorEdge,
              }}
            />
            <div
              className="px-4 py-4 sm:px-6 sm:py-6"
              style={{
                paddingTop: "max(1rem, env(safe-area-inset-top))",
                paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
                paddingLeft: "max(1rem, env(safe-area-inset-left))",
                paddingRight: "max(1rem, env(safe-area-inset-right))",
              }}
            >
              <div className="flex items-start gap-3 sm:gap-4">
                <span className="mt-0.5 text-2xl sm:text-3xl md:text-4xl shrink-0">
                  {toast.type === "success" ? "✅" : "⚠️"}
                </span>
                <div className="flex-1 text-base sm:text-lg leading-relaxed">
                  {toast.message}
                </div>

                {/* Close button */}
                <button
                  type="button"
                  className="shrink-0 text-white/90 hover:text-white text-2xl sm:text-3xl ml-2"
                  onClick={() => {
                    console.log("X button clicked");
                    hideToast();
                  }}
                  aria-label="Dismiss"
                  title="Dismiss"
                >
                  ×
                </button>
              </div>
            </div>
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
              <h2 className="font-semibold mb-4 text-xl text-white">Select services</h2>

              <ServiceList
                services={services}
                selectedService={lastPickedService}
                onSelect={toggleService}
                selectedProvider={selectedProvider}
                staffServiceOverrides={providerOverrides}
              />

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
                  <button
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40"
                    disabled={!canContinue}
                    onClick={handleContinue}
                    type="button"
                  >
                    Continue →
                  </button>
                </div>
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
                <div className="flex items-center gap-2">
                  <button
                    className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-sm"
                    onClick={handleBack}
                    type="button"
                  >
                    ← Back
                  </button>
                  <button
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-sm"
                    disabled={!canContinue}
                    onClick={handleContinue}
                    type="button"
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
                    type="button"
                  >
                    ← Back
                  </button>
                  <button
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-sm"
                    disabled={!canContinue}
                    onClick={handleContinue}
                    type="button"
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
                  type="button"
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
