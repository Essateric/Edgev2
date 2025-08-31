// PublicBookingPage.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient.js";
import Stepper from "./components/Stepper.jsx";
import ServiceList from "./components/ServiceList.jsx";
import ProviderList from "./components/ProviderList.jsx";
import CalendarSlots from "./components/CalendarSlots.jsx";
import ClientForm from "./components/ClientForm.jsx";
import {
  addMinutes, startOfDay, endOfDay, money,
  getWindowsForWeekday, buildSlotsFromWindows, rangesOverlap
} from "./lib/bookingUtils.js";
import { sendBookingEmails } from "./lib/email.js"; // uses Netlify Function via fetch
 import { v4 as uuidv4 } from "uuid";

const BUSINESS = {
  name: "The Edge HD Salon",
  address: "9 Claremont Road, Sale, M33 7DZ",
  timezone: "Europe/London",
  logoSrc: "/edge-logo.png",
  notifyEmail: "edgehd.salon@gmail.com",
};

export default function PublicBookingPage() {
  const [step, setStep] = useState(1);
  const [services, setServices] = useState([]);
  const [providers, setProviders] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedProvider, setSelectedProvider] = useState(null);

  const [viewDate, setViewDate] = useState(() => startOfDay(new Date()));
  const [selectedDate, setSelectedDate] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedTime, setSelectedTime] = useState(null);

  const [client, setClient] = useState({ first_name:"", last_name:"", email:"", mobile:"", notes:"" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from("services").select("id,name,category,base_duration,base_price").order("name");
      setServices(s || []);
      const { data: staff } = await supabase.from("staff").select("id,name,weekly_hours,permission,email").order("name");
      setProviders(staff || []);
    })();
  }, []);

  // Build free slots when the inputs change
  useEffect(() => {
    if (!selectedService || !selectedProvider || !selectedDate) return;
    let active = true;
    (async () => {
      setSlotsLoading(true);
      try {
        const dur = selectedService.base_duration || 30;
        const stepMins = 15;
        const dayStart = startOfDay(selectedDate);
        const dayEnd = endOfDay(selectedDate);

        const windows = getWindowsForWeekday(selectedProvider.weekly_hours, dayStart.getDay());
        if (!windows.length) { setAvailableSlots([]); return; }

        let candidates = buildSlotsFromWindows(dayStart, windows, stepMins, dur);
        const now = new Date();
        if (dayStart.getTime() === startOfDay(now).getTime()) {
          candidates = candidates.filter((t) => t > now);
        }
        if (!candidates.length) { setAvailableSlots([]); return; }

        const { data: existing } = await supabase
          .from("bookings")
          .select("id,start,end")
          .eq("resource_id", selectedProvider.id)
          .lte("start", dayEnd.toISOString())
          .gte("end", dayStart.toISOString());

        const busy = (existing || []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
        const free = candidates.filter((t) => {
          const s = t, e = addMinutes(t, dur);
          return busy.every((b) => !rangesOverlap(s, e, b.start, b.end));
        });
        if (active) setAvailableSlots(free);
      } finally {
        if (active) setSlotsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [selectedService, selectedProvider, selectedDate]);

  async function saveBooking() {
    if (!selectedService || !selectedProvider || !selectedDate || !selectedTime) return;
    if (!client.first_name || !client.last_name || (!client.email && !client.mobile)) {
      alert("Please enter your first & last name, and at least email or mobile.");
      return;
    }
    setSaving(true);
    try {
      const dur = selectedService.base_duration || 30;
      const start = new Date(selectedDate);
      start.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
      const end = addMinutes(start, dur);

      // upsert client
      let clientId = null;
      if (client.email || client.mobile) {
        let q = supabase.from("clients").select("id,first_name,last_name,email,mobile").limit(1);
        if (client.email && client.mobile) q = q.or(`email.eq.${client.email},mobile.eq.${client.mobile}`);
        else if (client.email) q = q.eq("email", client.email);
        else q = q.eq("mobile", client.mobile);
        const { data: found } = await q;
        if (found?.length) {
          clientId = found[0].id;
          if (!found[0].first_name || !found[0].last_name) {
            await supabase.from("clients").update({
              first_name: found[0].first_name || client.first_name,
              last_name:  found[0].last_name  || client.last_name,
            }).eq("id", clientId);
          }
        } else {
          const { data: created } = await supabase
            .from("clients")
            .insert([{ first_name: client.first_name, last_name: client.last_name, email: client.email || null, mobile: client.mobile || null }])
            .select("id").single();
          clientId = created.id;
        }
      }

      // race-safe overlap check
      const { data: overlaps } = await supabase
        .from("bookings")
        .select("id")
        .eq("resource_id", selectedProvider.id)
        .lt("start", end.toISOString())
        .gt("end", start.toISOString());
      if (overlaps?.length) { alert("Sorry, that time was just taken. Please pick another slot."); return; }

      // create booking
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
      const { data: ins } = await supabase.from("bookings").insert([payload]).select("*").single();

      // save locally
      const savedPack = { booking: ins, client: { id: clientId, ...client }, provider: selectedProvider, service: selectedService };
      setSaved(savedPack);

      // 🔔 send emails via Netlify Function (no Supabase Edge call)
      if (client.email) {
        await sendBookingEmails({
          customerEmail: client.email,
          businessEmail: BUSINESS.notifyEmail, // explicit to avoid fallback issues
          business: BUSINESS,
          booking: ins,
          service: selectedService,
          provider: selectedProvider,
        });
      }

      setStep(4);
    } catch (e) {
      console.error("saveBooking failed", e);
      alert("Couldn't save booking. Please try again.");
    } finally { setSaving(false); }
  }

  const header = (
    <div className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-neutral-800">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
        <img src={BUSINESS.logoSrc} alt={BUSINESS.name} className="w-10 h-10 rounded-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
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
      <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-4 gap-6">
        <aside className="md:col-span-1">
          <Stepper
            step={step} setStep={setStep}
            selectedService={selectedService}
            selectedProvider={selectedProvider}
            selectedDate={selectedDate}
            selectedTime={selectedTime}
          />
        </aside>

        <main className="md:col-span-3 space-y-6">
          {step === 1 && (
            <ServiceList
              services={services}
              selectedService={selectedService}
              onSelect={(svc) => { setSelectedService(svc); setStep(2); }}
            />
          )}

          {step === 2 && (
            <ProviderList
              providers={providers}
              selectedProvider={selectedProvider}
              onSelect={setSelectedProvider}
              onNext={() => setStep(3)}
            />
          )}

          {step === 3 && (
            <CalendarSlots
              viewDate={viewDate}
              setViewDate={setViewDate}
              selectedService={selectedService}
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
                saving || !selectedService || !selectedProvider || !selectedDate || !selectedTime ||
                !client.first_name || !client.last_name || (!client.email && !client.mobile)
              }
              onSave={saveBooking}
            />
          )}
        </main>
      </div>

      <footer className="max-w-6xl mx-auto px-4 py-10 text-center text-xs text-gray-400">
        <p>Powered by Essateric Solutions</p>
      </footer>
    </div>
  );
}
