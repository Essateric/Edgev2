// Supabase Edge Function: send 2 emails (customer + business)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// at top of your Netlify function
const extractEmail = (s = "") => (s.match(/<([^>]+)>/)?.[1] || s).trim();
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);


type Payload = {
  customerEmail?: string | null;
  businessEmail: string;
  business: { name: string; address: string; timezone: string };
  booking: { start: string; end: string; title?: string | null; price?: number | null };
  service: { name: string; base_duration?: number | null; base_price?: number | null; category?: string | null };
  provider: { name: string };
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL");   // e.g. "The Edge HD Salon <bookings@yourdomain.com>"
const REPLY_TO = Deno.env.get("REPLY_TO") ?? ""; // optional

// --- helpers ---
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // lock down to your site origin if you prefer
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

const escapeHtml = (s?: string | null) =>
  (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

async function sendResend(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY || !FROM_EMAIL) throw new Error("Missing RESEND_API_KEY or FROM_EMAIL");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html, reply_to: REPLY_TO || undefined }),
  });
  if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
}

// --- handler ---
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const payload = (await req.json().catch(() => null)) as Payload | null;
  if (!payload) return json({ ok: false, error: "Invalid JSON" }, 400);
  if (!payload.businessEmail) return json({ ok: false, error: "businessEmail is required" }, 400);

  const tz = payload.business?.timezone || "Europe/London";
  const when = new Date(payload.booking.start).toLocaleString("en-GB", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz, // ✅ apply business timezone
  });

  const service = escapeHtml(payload.service?.name);
  const provider = escapeHtml(payload.provider?.name);
  const bizName = escapeHtml(payload.business?.name);
  const address = escapeHtml(payload.business?.address);

  const customerHtml = `
    <div style="font-family:Arial,sans-serif">
      <h2>Booking confirmed – ${bizName}</h2>
      <p>Thanks for booking <b>${service}</b> with <b>${provider}</b>.</p>
      <p><b>When:</b> ${when} (${tz})</p>
      <p><b>Where:</b> ${address}</p>
      <p>If you need to change anything, just reply to this email.</p>
    </div>`;

  const businessHtml = `
    <div style="font-family:Arial,sans-serif">
      <h2>New booking request</h2>
      <p><b>Service:</b> ${service}</p>
      <p><b>Provider:</b> ${provider}</p>
      <p><b>When:</b> ${when} (${tz})</p>
      <p><b>Customer email:</b> ${escapeHtml(payload.customerEmail) || "—"}</p>
    </div>`;

  try {
    await Promise.all([
      payload.customerEmail ? sendResend(payload.customerEmail, "Your booking is confirmed", customerHtml) : Promise.resolve(),
      sendResend(payload.businessEmail, "New booking request", businessHtml),
    ]);
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: String(e) }, 500);
  }
});
