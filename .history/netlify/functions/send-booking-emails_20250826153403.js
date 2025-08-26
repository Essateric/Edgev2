// netlify/functions/send-booking-emails.js
// Sends 2 emails with Resend: one to the customer, one to the salon

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL; // e.g. 'The Edge HD Salon <onboarding@resend.dev>'

// Minimal CORS helper (keep origins tight in production)
const cors = {
  "Access-Control-Allow-Origin": process.env.ALLOW_ORIGIN || "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sendResend({ to, subject, html }) {
  if (!RESEND_API_KEY || !FROM_EMAIL) {
    throw new Error("Missing RESEND_API_KEY or FROM_EMAIL");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL, // MUST be like 'Name <user@yourdomain.com>' OR onboarding@resend.dev
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend failed: ${res.status} ${text}`);
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: cors, body: "" };
    }
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: cors, body: "Method Not Allowed" };
    }

    const payload = JSON.parse(event.body || "{}");
    const {
      customerEmail,
      businessEmail,
      business = {},
      booking = {},
      service = {},
      provider = {},
    } = payload;

    const when = booking.start
      ? new Date(booking.start).toLocaleString("en-GB", {
          weekday: "short",
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

    const customerHtml = `
      <div style="font-family:Arial,sans-serif">
        <h2>Booking confirmed – ${business.name || "Our Salon"}</h2>
        <p>Thanks for booking <b>${service.name || "a service"}</b> with <b>${provider.name || "our team"}</b>.</p>
        <p><b>When:</b> ${when} (${business.timezone || "Europe/London"})</p>
        <p><b>Where:</b> ${business.address || "—"}</p>
        <p>If you need to change anything, just reply to this email.</p>
      </div>`;

    const businessHtml = `
      <div style="font-family:Arial,sans-serif">
        <h2>New booking request</h2>
        <p><b>Service:</b> ${service.name || "—"}</p>
        <p><b>Provider:</b> ${provider.name || "—"}</p>
        <p><b>When:</b> ${when} (${business.timezone || "Europe/London"})</p>
        <p><b>Customer email:</b> ${customerEmail || "—"}</p>
      </div>`;

    // Send emails (customer is optional if no email provided)
    const tasks = [];
    if (customerEmail) {
      tasks.push(
        sendResend({
          to: customerEmail,
          subject: "Your booking is confirmed",
          html: customerHtml,
        })
      );
    }
    tasks.push(
      sendResend({
        to: businessEmail,
        subject: "New booking request",
        html: businessHtml,
      })
    );

    await Promise.all(tasks);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", ...cors },
      body: JSON.stringify({ ok: true }),
    };
  } catch (e) {
    console.error("send-booking-emails error:", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", ...cors },
      body: JSON.stringify({ ok: false, error: String(e) }),
    };
  }
};
