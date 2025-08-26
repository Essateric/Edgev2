import React, { useEffect, useMemo, useState } from "react";
// ✅ Fixed: use the correct relative path from src/onlinebookings/PublicBookingPage.jsx → src/supabaseClient.js
import { supabase } from "../supabaseClient.js";

// PublicBookingPage.jsx — Plain JavaScript (no TypeScript)
// PUBLIC FLOW (as per screenshot):
// 1) Service → 2) Stylist → 3) Time (calendar + slots) → 4) Client
// DB: services, staff, bookings, clients

// ====== BASIC CONFIG ======
const BUSINESS = {
  name: "Your Clinic Name",
  address: "123 High Street, Manchester, M33 7DZ",
  timezone: "Europe/London",
  mapsEmbedSrc: "https://www.google.com/maps?q=Your+Clinic+Name+Manchester&output=embed",
};

// ====== UTIL HELPERS ======
const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay   = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
const addMinutes = (date, mins) => { const d = new Date(date); d.setMinutes(d.getMinutes() + mins); return d; };
const fmtTime = (d) => { const h = d.getHours(); const m = d.getMinutes(); const hh = ((h + 11) % 12) + 1; return `${hh}:${pad(m)} ${h < 12 ? "AM" : "PM"}`; };
const money = (v) => (v == null || isNaN(Number(v)) ? "" : `£${Number(v).toFixed(2)}`);

// Overlap check between [a1,a2) and [b1,b2)
const rangesOverlap = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;

// Parse staff.weekly_hours JSON for a weekday (0..6). Supports object or array per day.
function getWindowsForWeekday(weekly_hours, weekday) {
  if (!weekly_hours) return [];
  const raw = weekly_hours[String(weekday)];
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .map((w) => (w && w.start && w.end ? { start: w.start, end: w.end } : null))
    .filter(Boolean);
}

function buildSlotsFromWindows(date, windows, stepMins, durationMins) {
  const out = [];
  for (const w of windows) {
    const [sh, sm] = String(w.start).split(":").map(Number);
    const [eh, em] = String(w.end).split(":").map(Number);
    const wStart = new Date(date); wStart.setHours(sh||0, sm||0, 0, 0);
    const wEnd   = new Date(date); wEnd.setHours(eh||0, em||0, 0, 0);
    for (let t = new Date(wStart); addMinutes(t, durationMins) <= wEnd; t = addMinutes(t, stepMins)) {
      const sEnd = addMinutes(t, durationMins);
      if (sEnd <= wEnd) out.push(new Date(t));
    }
  }
  return out;
}

function monthDays(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days = [];
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) days.push(new Date(d));
  return days;
}

// ====== DEV TESTS ======
function runDevTests() {
  const results = [];
  const d = new Date("2025-01-01T09:00:00");
  const a1 = new Date(d), a2 = addMinutes(a1, 60);
  const b1 = addMinutes(a1, 30), b2 = addMinutes(b1, 60);
  results.push({ name: "Overlap true", passed: rangesOverlap(a1,a2,b1,b2) === true });
  const c1 = new Date("2025-01-01T11:00:00"), c2 = new Date("2025-01-01T12:00:00");
  results.push({ name: "Overlap false", passed: rangesOverlap(a1,a2,c1,c2) === false });
  const wh = { "2": [{ start: "09:00", end: "12:00" }, { start: "13:00", end: "17:00" }] };
  results.push({ name: "Weekly hours parse (2 windows)", passed: getWindowsForWeekday(wh,2).length === 2 });
  const whSingle = { "1": { start: "09:00", end: "17:00" } };
  results.push({ name: "Weekly hours parse (single window)", passed: getWindowsForWeekday(whSingle,1).length === 1 });
  const slots = buildSlotsFromWindows(new Date("2025-01-02T00:00:00"), [{ start:"09:00", end:"10:00" }], 15, 30);
  results.push({ name: "Slot builder count=3", passed: slots.length === 3 });
  const slotsEdge = buildSlotsFromWindows(new Date("2025-01-02T00:00:00"), [{ start:"09:00", end:"09:30" }], 15, 30);
  results.push({ name: "Slots edge (no overflow beyond window)", passed: slotsEdge.length === 1 && slotsEdge[0].getHours() === 9 && slotsEdge[0].getMinutes() === 0 });
  const noOverlapBoundary = rangesOverlap(new Date("2025-01-01T09:00:00"), new Date("2025-01-01T10:00:00"), new Date("2025-01-01T10:00:00"), new Date("2025-01-01T11:00:00"));
  results.push({ name: "Overlap boundary (end=start) is false", passed: noOverlapBoundary === false });
  return results;
}

// ====== MAIN COMPONENT ======
export default function PublicBookingPage() {
  // Steps: 1 Service → 2 Stylist → 3 Time → 4 Client
  const [step, setStep] = useState(1);

  // Data
  const [services, setServices] = useState([]);
  const [providers, setProviders] = useState([]);

  // Selections
  const [selectedService, setSelectedService] = useState(null);
  const [selectedProvider, setSelectedProvider] = useState(null);

  // Time step state (calendar + slots)
  const [viewDate, setViewDate] = useState(() => startOfDay(new Date()));
  const [selectedDate, setSelectedDate] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedTime, setSelectedTime] = useState(null);

  // Client details
  const [client, setClient] = useState({ first_name: "", last_name: "", email: "", mobile: "", notes: "" });

  // Save state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);

  const [testResults, setTestResults] = useState(null);

  // Load services & staff once (public — no auth required if RLS allows anon select)
  useEffect(() => {
    (async () => {
      const { data: s, error: se } = await supabase
        .from("services")
        .select("id, name, category, base_duration, base_price")
        .order("name", { ascending: true });
      if (se) console.error("services fetch error", se.message);
      setServices(s || []);

      const { data: staff, error: ste } = await supabase
        .from("staff")
        .select("id, name, weekly_hours, permission, email")
        .order("name", { ascending: true });
      if (ste) console.error("staff fetch error", ste.message);
      setProviders(staff || []);
    })();
  }, []);

  const monthDaysMemo = useMemo(() => monthDays(viewDate), [viewDate]);

  // Compute available slots when inputs change (Time step)
  useEffect(() => {
    if (!selectedService || !selectedProvider || !selectedDate) return;
    let active = true;
    (async () => {
      setSlotsLoading(true);
      try {
        const dur = selectedService.base_duration || 30; // minutes
        const stepMins = 15;
        const dayStart = startOfDay(selectedDate);
        const dayEnd = endOfDay(selectedDate);

        // 1) Windows for weekday
        const windows = getWindowsForWeekday(selectedProvider.weekly_hours, dayStart.getDay());
        if (!windows.length) { setAvailableSlots([]); return; }

        // 2) Candidate slots
        const candidates = buildSlotsFromWindows(dayStart, windows, stepMins, dur);
        if (!candidates.length) { setAvailableSlots([]); return; }

        // 3) Existing bookings for provider that touch the day
        const { data: existing, error: be } = await supabase
          .from("bookings")
          .select("id, start, end, status")
          .eq("resource_id", selectedProvider.id)
          .lte("start", dayEnd.toISOString())
          .gte("end", dayStart.toISOString());
        if (be) console.error("bookings fetch error", be.message);
        const busy = (existing || []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));

        // 4) Free = no overlaps
        const free = candidates.filter((t) => {
          const s = t; const e = addMinutes(t, dur);
          return busy.every((b) => !rangesOverlap(s, e, b.start, b.end));
        });
        if (active) setAvailableSlots(free);
      } finally {
        if (active) setSlotsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [selectedService, selectedProvider, selectedDate]);

  // Save booking (client lookup/create + double-check overlap + insert)
  async function saveBooking() {
    if (!selectedService || !selectedProvider || !selectedDate || !selectedTime) return;
    if (!client.first_name || !client.last_name || (!client.email && !client.mobile)) {
      alert("Please enter your first & last name, and at least email or mobile.");
      return;
    }
    setSaving(true);
    try {
      const dur = selectedService.base_duration || 30;
      const start = new Date(selectedDate); start.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
      const end = addMinutes(start, dur);

      // 1) Find or create client
      let clientId = null;
      if (client.email || client.mobile) {
        let q = supabase.from("clients").select("id, first_name, last_name, email, mobile").limit(1);
        if (client.email && client.mobile) {
          q = q.or(`email.eq.${client.email},mobile.eq.${client.mobile}`);
        } else if (client.email) {
          q = q.eq("email", client.email);
        } else if (client.mobile) {
          q = q.eq("mobile", client.mobile);
        }
        const { data: existing, error: ce } = await q;
        if (ce) console.error("client lookup error", ce.message);
        if (existing && existing.length) {
          clientId = existing[0].id;
          if (!existing[0].first_name || !existing[0].last_name) {
            await supabase.from("clients").update({
              first_name: existing[0].first_name || client.first_name,
              last_name: existing[0].last_name || client.last_name,
            }).eq("id", clientId);
          }
        } else {
          const { data: created, error: ci } = await supabase
            .from("clients")
            .insert([{ first_name: client.first_name, last_name: client.last_name, email: client.email || null, mobile: client.mobile || null }])
            .select("id")
            .single();
          if (ci) throw ci;
          clientId = created.id;
        }
      }

      // 2) Double-check availability (race-safe)
      const { data: overlaps, error: ovErr } = await supabase
        .from("bookings")
        .select("id")
        .eq("resource_id", selectedProvider.id)
        .lt("start", end.toISOString())
        .gt("end", start.toISOString());
      if (ovErr) throw ovErr;
      if (overlaps && overlaps.length) {
        alert("Sorry, that time was just taken. Please pick another slot.");
        return;
      }

      // 3) Insert booking
      const payload = {
        booking_id: null,
        title: selectedService.name,
        category: selectedService.category || null,
        client_id: clientId,
        client_name: `${client.first_name} ${client.last_name}`.trim(),
        resource_id: selectedProvider.id,
        start: start.toISOString(),
        end: end.toISOString(),
        duration: dur,
        price: selectedService.base_price ?? null,
        status: "confirmed",
      };
      const { data: ins, error: bi } = await supabase.from("bookings").insert([payload]).select("*").single();
      if (bi) throw bi;

      setSaved({ booking: ins, client: { id: clientId, ...client }, provider: selectedProvider, service: selectedService });
      setStep(4); // show confirmation below client step
    } catch (e) {
      console.error("saveBooking failed", e.message);
      alert("Couldn't save booking. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ====== UI ======
  const Stepper = () => (
    <div className="sticky top-20 space-y-4">
      {[
        { n: 1, label: "Service" },
        { n: 2, label: "Provider" },
        { n: 3, label: "Time" },
        { n: 4, label: "Client" },
      ].map((s) => (
        <div key={s.n} className={`pl-3 border-l-4 ${step === s.n ? "border-black" : "border-gray-300"}`}>
          <div className={`text-lg font-semibold ${step === s.n ? "text-black" : "text-gray-500"}`}>{s.label}</div>
        </div>
      ))}
    </div>
  );

  const header = (
    <div className="sticky top-0 z-10 bg-white/70 backdrop-blur border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs">BH</div>
        <div>
          <h1 className="text-lg font-semibold">{BUSINESS.name}</h1>
          <p className="text-sm text-gray-500">{BUSINESS.address}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {header}

      {/* Developer tests */}
      <div className="max-w-6xl mx-auto px-4 pt-4">
        <details className="bg-white rounded-2xl shadow p-4">
          <summary className="cursor-pointer text-sm font-semibold">🧪 Developer tests</summary>
          <div className="mt-3">
            <button className="px-3 py-2 rounded-xl border hover:bg-gray-50" onClick={() => setTestResults(runDevTests())}>Run tests</button>
            {testResults && (
              <ul className="mt-3 space-y-2 text-sm">
                {testResults.map((t, i) => (
                  <li key={i} className={`p-2 rounded border ${t.passed ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
                    <b>{t.name}:</b> {t.passed ? "PASS" : "FAIL"}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* LEFT: Stepper */}
        <aside className="md:col-span-1">
          <Stepper />
        </aside>

        {/* RIGHT: Content */}
        <main className="md:col-span-3 space-y-6">
          {/* STEP 1: Services */}
          {step === 1 && (
            <section className="bg-white rounded-2xl shadow p-4">
              <h2 className="font-semibold mb-3">Select a service</h2>
              {!services.length && <p className="text-sm text-gray-600">No services found. Add some in the DB.</p>}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {services.map((svc) => (
                  <button key={svc.id} onClick={() => { setSelectedService(svc); setStep(2); }} className={`text-left p-4 rounded-xl border transition hover:shadow ${selectedService?.id === svc.id ? "border-black bg-gray-50" : "border-gray-200"}`}>
                    <p className="font-medium">{svc.name}</p>
                    <p className="mt-1 text-xs text-gray-500 flex items-center gap-3">
                      <span>{svc.base_duration || 30} mins</span>
                      {svc.base_price != null && <span>{money(svc.base_price)}</span>}
                    </p>
                    {svc.category && <p className="text-xs text-gray-500 mt-1">{svc.category}</p>}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* STEP 2: Provider */}
          {step === 2 && (
            <section className="bg-white rounded-2xl shadow p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Select a stylist</h2>
                <button onClick={() => setStep(3)} disabled={!selectedProvider} className="text-sm text-black/70 hover:text-black disabled:opacity-40">Next →</button>
              </div>
              <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {providers.map((p) => (
                  <label key={p.id} className={`p-4 rounded-xl border flex gap-3 items-center hover:shadow cursor-pointer ${selectedProvider?.id === p.id ? "border-black bg-gray-50" : "border-gray-200"}`}>
                    <input type="radio" name="provider" className="sr-only" checked={selectedProvider?.id === p.id} onChange={() => { setSelectedProvider(p); }} />
                    <div className="w-10 h-10 rounded-full bg-gray-200" />
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-gray-600">{p.permission || p.email || "Staff"}</p>
                    </div>
                  </label>
                ))}
              </div>
            </section>
          )}

          {/* STEP 3: Time (Calendar + Slots) */}
          {step === 3 && (
            <section className="bg-white rounded-2xl shadow p-4">
              <div className="flex items中心 justify-between">
                <h2 className="font-semibold">Choose a time</h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => setViewDate((prev) => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d; })} className="p-2 rounded-lg border hover:bg-gray-50">←</button>
                  <div className="text-sm font-medium">{new Date(viewDate).toLocaleString(undefined, { month: "long", year: "numeric" })}</div>
                  <button onClick={() => setViewDate((prev) => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d; })} className="p-2 rounded-lg border hover:bg-gray-50">→</button>
                </div>
              </div>

              {/* Calendar */}
              <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs">
                {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (<div key={d} className="py-1 text-gray-500">{d}</div>))}
                {monthDaysMemo.map((d) => {
                  const today = startOfDay(new Date());
                  const selectable = d >= today && selectedProvider && selectedService; // require prior steps
                  const selected = selectedDate && d.toDateString() === selectedDate.toDateString();
                  return (
                    <button key={d.toISOString()} disabled={!selectable} onClick={() => { setSelectedDate(new Date(d)); setSelectedTime(null); }} className={`py-2 rounded-lg border text-sm ${selected ? "border-black bg-gray-50" : "border-gray-200"} ${selectable ? "hover:shadow" : "opacity-30 cursor-not-allowed"}`}>
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>

              {/* Slots */}
              <div className="mt-4">
                {!selectedDate ? (
                  <p className="text-sm text-gray-600">Pick a date to see available times.</p>
                ) : slotsLoading ? (
                  <p className="text-sm text-gray-600">Loading available times…</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {availableSlots.length ? (
                      availableSlots.map((t) => (
                        <button key={t.toISOString()} onClick={() => { setSelectedTime(new Date(t)); setStep(4); }} className={`px-3 py-2 rounded-lg border text-sm ${selectedTime && t.getTime() === selectedTime.getTime() ? "border-black bg-gray-50" : "border-gray-200 hover:shadow"}`}>
                          {fmtTime(t)}
                        </button>
                      ))
                    ) : (
                      <p className="text-sm text-gray-600">No free slots for this day.</p>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* STEP 4: Client */}
          {step === 4 && (
            <section className="bg-white rounded-2xl shadow p-4">
              <h2 className="font-semibold">Your details</h2>
              <div className="mt-3 grid sm:grid-cols-2 gap-3">
                <label className="text-sm"><span className="text-gray-600">First name</span><input value={client.first_name} onChange={(e) => setClient({ ...client, first_name: e.target.value })} className="mt-1 w-full p-2 border rounded-lg bg-white" placeholder="e.g. John" /></label>
                <label className="text-sm"><span className="text-gray-600">Last name</span><input value={client.last_name} onChange={(e) => setClient({ ...client, last_name: e.target.value })} className="mt-1 w-full p-2 border rounded-lg bg-white" placeholder="e.g. Smith" /></label>
                <label className="text-sm"><span className="text-gray-600">Email</span><input type="email" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} className="mt-1 w-full p-2 border rounded-lg bg-white" placeholder="you@email.com" /></label>
                <label className="text-sm"><span className="text-gray-600">Mobile</span><input value={client.mobile} onChange={(e) => setClient({ ...client, mobile: e.target.value })} className="mt-1 w-full p-2 border rounded-lg bg-white" placeholder="07..." /></label>
              </div>
              <label className="text-sm block mt-3"><span className="text-gray-600">Notes (optional)</span><textarea value={client.notes} onChange={(e) => setClient({ ...client, notes: e.target.value })} className="mt-1 w-full p-2 border rounded-lg bg-white" placeholder="Anything we should know?" /></label>
              <div className="mt-4 flex items-center gap-3">
                <button disabled={saving || !selectedService || !selectedProvider || !selectedDate || !selectedTime || !client.first_name || !client.last_name || (!client.email && !client.mobile)} onClick={saveBooking} className="px-4 py-2 rounded-xl bg-black text-white hover:opacity-90 disabled:opacity-50">{saving ? "Booking..." : "Book appointment"}</button>
                <p className="text-sm text-gray-600">Confirmation appears below.</p>
              </div>

              {/* Confirmation */}
              {saved && (
                <div className="mt-6 p-4 border rounded-xl">
                  <h3 className="font-semibold">🎉 Booking confirmed</h3>
                  <p className="text-sm text-gray-700 mt-1">Thanks, {saved.client.first_name}. Your {saved.service.name.toLowerCase()} is booked with {saved.provider.name}.</p>
                  <div className="mt-3 grid sm:grid-cols-2 gap-3 text-sm">
                    <div className="p-3 rounded-xl border"><p className="text-gray-500">When</p><p className="font-medium">{new Date(saved.booking.start).toLocaleString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} ({BUSINESS.timezone})</p></div>
                    <div className="p-3 rounded-xl border"><p className="text-gray-500">Where</p><p className="font-medium">{BUSINESS.address}</p></div>
                    <div className="p-3 rounded-xl border"><p className="text-gray-500">Service</p><p className="font-medium">{saved.service.name} · {saved.service.base_duration} mins {saved.service.base_price != null ? `· ${money(saved.service.base_price)}` : ""}</p></div>
                    <div className="p-3 rounded-xl border"><p className="text-gray-500">Provider</p><p className="font-medium">{saved.provider.name}</p></div>
                  </div>
                </div>
              )}
            </section>
          )}
        </main>
      </div>

      <footer className="max-w-6xl mx-auto px-4 py-10 text-center text-xs text-gray-500">
        <p>Powered by your brand · Built for Google Business appointment links</p>
      </footer>
    </div>
  );
}
