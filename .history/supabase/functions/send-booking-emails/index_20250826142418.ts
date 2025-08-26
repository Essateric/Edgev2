// Deno Edge Function: sends 2 emails (to customer + business)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Payload = {
  customerEmail: string;
  businessEmail: string;
  business: { name: string; address: string; timezone: string };
  booking: { start: string; end: string; title?: string | null; price?: number | null };
  service: { name: string; base_duration?: number | null; base_price?: number | null; category?: string | null };
  provider: { name: string };
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL"); // e.g. "The Edge HD Salon <bookings@yourdomain.com>"

async function sendResend(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY || !FROM_EMAIL) {
    throw new Error("Missing RESEND_API_KEY or FROM_EMAIL");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend failed: ${res.status} ${text}`);
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const payload = (await req.json()) as Payload;

    const when = new Date(payload.booking.start).toLocaleString("en-GB", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const customerHtml = `
      <div style="font-family:Arial,sans-serif">
        <h2>Booking confirmed – ${payload.business.name}</h2>
        <p>Thanks for booking <b>${payload.service.name}</b> with <b>${payload.provider.name}</b>.</p>
        <p><b>When:</b> ${when} (${payload.business.timezone})</p>
        <p><b>Where:</b> ${payload.business.address}</p>
        <p>If you need to change anything, just reply to this email.</p>
      </div>`;

    const businessHtml = `
      <div style="font-family:Arial,sans-serif">
        <h2>New booking request</h2>
        <p><b>Service:</b> ${payload.service.name}</p>
        <p><b>Provider:</b> ${payload.provider.name}</p>
        <p><b>When:</b> ${when} (${payload.business.timezone})</p>
        <p><b>Customer email:</b> ${payload.customerEmail || "—"}</p>
      </div>`;

    await Promise.all([
      payload.customerEmail
        ? sendResend(payload.customerEmail, "Your booking is confirmed", customerHtml)
        : Promise.resolve(),
      sendResend(payload.businessEmail, "New booking request", businessHtml),
    ]);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
