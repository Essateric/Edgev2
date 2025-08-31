import nodemailer from "nodemailer";

// --- CORS (so browser POST works) ---
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // tighten to your site origin if you want
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const respond = (body, status = 200) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json", ...corsHeaders },
  body: JSON.stringify(body),
});

// --- helpers ---
const extractEmail = (s = "") => (s.match(/<([^>]+)>/)?.[1] || s).trim();
const isEmail = (v = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const escapeHtml = (s = "") =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// --- env ---
const FROM_EMAIL = process.env.FROM_EMAIL || ""; // e.g. "The Edge HD Salon <edgehd.salon@gmail.com>"
const REPLY_TO = process.env.REPLY_TO || FROM_EMAIL; // optional
const BUSINESS_EMAIL_FALLBACK = process.env.BUSINESS_EMAIL || extractEmail(FROM_EMAIL);

// --- Nodemailer (Gmail app password) ---
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.BOOKING_EMAIL_USER,      // your Gmail
    pass: process.env.BOOKING_EMAIL_PASS,      // 16-char app password (no spaces)
  },
});

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return respond("");
  if (event.httpMethod !== "POST") return respond({ error: "Method not allowed" }, 405);

  try {
    const payload = JSON.parse(event.body || "{}");

    // Resolve business email: payload → env BUSINESS_EMAIL → email inside FROM_EMAIL
    const businessEmail =
      (payload.businessEmail || "").trim() || BUSINESS_EMAIL_FALLBACK;

    if (!isEmail(businessEmail)) {
      return respond({ ok: false, error: "businessEmail is required and must be valid" }, 400);
    }

    const biz = payload.business || {};
    const booking = payload.booking || {};
    const tz = biz.timezone || "Europe/London";

    const when = new Date(booking.start).toLocaleString("en-GB", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
    });

    const service = escapeHtml(payload?.service?.name || "");
    const provider = escapeHtml(payload?.provider?.name || "");
    const bizName = escapeHtml(biz.name || "Our Salon");
    const address = escapeHtml(biz.address || "");

    const customerHtml = `
      <div style="font-family:Arial,sans-serif">
        <h2>Booking Request sent – ${bizName}</h2>
        <p>Thanks for your request for <b>${service}</b> with <b>${provider}</b>.</p>
        <p><b>When:</b> ${when} (${tz})</p>
        <p><b>Where:</b> ${address}</p>
        <p>Our staff will contact you to confirm this booking. </p>
        <p>If you need to change anything, just reply to this email.</p>
      </div>`;

    const businessHtml = `
      <div style="font-family:Arial,sans-serif">
        <h2>New booking request</h2>
        <p><b>Service:</b> ${service}</p>
        <p><b>Provider:</b> ${provider}</p>
        <p><b>When:</b> ${when} (${tz})</p>
        <p><b>Customer email:</b> ${escapeHtml(payload.customerEmail || "") || "—"}</p>
      </div>`;

    const mailPromises = [];

    // Send to customer (only if a valid email is provided)
    if (isEmail(payload.customerEmail || "")) {
      mailPromises.push(
        transporter.sendMail({
          from: FROM_EMAIL,
          to: payload.customerEmail,
          subject: "Your booking request has been sent",
          html: customerHtml,
          replyTo: REPLY_TO,
        })
      );
    }

    // Send to business
    mailPromises.push(
      transporter.sendMail({
        from: FROM_EMAIL,
        to: businessEmail,
        subject: "New booking request",
        html: businessHtml,
        replyTo: REPLY_TO,
      })
    );

    await Promise.all(mailPromises);
    return respond({ ok: true });
  } catch (err) {
    console.error(err);
    return respond({ ok: false, error: String(err) }, 500);
  }
}
