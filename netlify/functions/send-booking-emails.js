// Sends two emails via Gmail (Nodemailer): one to the customer (optional) and one to the salon (required).

import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

console.log("📧 EDGE HD BOOKING EMAIL BOOTING...");
console.log("🔐 USER:", process.env.BOOKING_EMAIL_USER || "❌ Not Set");

const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOW_ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};

// helpers
const json = (code, body) => ({
  statusCode: code,
  headers: { "Content-Type": "application/json", ...corsHeaders },
  body: JSON.stringify(body),
});
const isEmail = (s) => !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s));
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
const withLineBreaks = (s = "") => esc(s).replace(/\r?\n/g, "<br>");
const extractEmail = (s = "") => (s.match(/<([^>]+)>/)?.[1] || s).trim();

// simple phone formatter (keeps +44 or leading 0; groups for readability)
// simple UK mobile formatter:
// "07305422191"  -> "07305 422 191"
// "+447305422191"-> "+44 7305 422 191"
const fmtPhone = (s = "") => {
  const raw = String(s || "").replace(/[^\d+]/g, "");
  if (!raw) return "—";

  // +44 case (international)
  if (raw.startsWith("+44")) {
    let nsn = raw.slice(3);            // strip +44
    if (nsn.startsWith("0")) nsn = nsn.slice(1); // drop national 0 if present
    // expect 10 digits for a mobile after +44 (e.g. 7305422191)
    if (nsn.length >= 10) {
      return `+44 ${nsn.slice(0,4)} ${nsn.slice(4,7)} ${nsn.slice(7,10)}`;
    }
    return `+44 ${nsn}`; // fallback
  }

  // National format: ensure leading 0 and then 11 digits
  let num = raw;
  if (!num.startsWith("0")) num = "0" + num;
  num = num.slice(0, 11); // trim if longer
  if (num.length === 11) {
    return `${num.slice(0,5)} ${num.slice(5,8)} ${num.slice(8,11)}`;
  }

  // Fallback to raw if we can't confidently format
  return num;
};


function makeTransporter() {
  const user = process.env.BOOKING_EMAIL_USER;
  const pass = process.env.BOOKING_EMAIL_PASS;

  if (!user || !pass) {
    throw new Error("Missing BOOKING_EMAIL_USER or BOOKING_EMAIL_PASS env var");
  }

  // Gmail transporter (use Gmail App Password)
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
    logger: true,
    debug: true,
  });

  return transporter;
}

export async function handler(event) {
  try {
    // CORS preflight
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: corsHeaders, body: "" };
    }
    if (event.httpMethod !== "POST") {
      return json(405, { ok: false, error: "Method Not Allowed" });
    }
    if (!event.body) {
      console.error("❌ No body received in POST request");
      return json(400, { ok: false, error: "Missing request body" });
    }

    // Payload:
    // {
    //   customerEmail, businessEmail,
    //   business:{name,address,timezone},
    //   booking:{start,end,client_name?},
    //   service:{name}, provider:{name},
    //   notes?:string,
    //   customerName?:string,
    //   client?:{first_name,last_name,mobile?},
    //   customerPhone?:string   <-- we'll display this for the salon
    // }
    let data;
    try {
      data = JSON.parse(event.body);
    } catch {
      return json(400, { ok: false, error: "Invalid JSON" });
    }

    const {
      customerEmail,          // optional
      businessEmail,          // may be missing; we will fallback
      business = {},          // { name, address, timezone }
      booking = {},           // { start, end, client_name? }
      service = {},           // { name }
      provider = {},          // { name }
      notes = "",             // free-text notes from customer
      customerPhone,          // <-- NEW: prefer this if present
      client,                 // may also contain mobile
    } = data;

    // 🔹 Derive the client's name from multiple possible places
    const rawClientName =
      String(data.customerName || "").trim() ||
      String(booking.client_name || "").trim() ||
      `${String(client?.first_name || "").trim()} ${String(client?.last_name || "").trim()}`.trim();

    const clientFull = esc(rawClientName || "Customer");
    const clientFirst = esc((rawClientName.split(" ")[0] || "there").trim());

    // 🔹 Derive a displayable phone for the salon
    const derivedPhone = customerPhone || client?.mobile || "";
    const phoneText = fmtPhone(derivedPhone);
    const phoneHtml = `<p style="margin:0 0 4px 0"><b>Phone:</b> ${esc(phoneText)}</p>`;

    // Resolve business email: payload → env BUSINESS_EMAIL → address inside FROM_EMAIL
    const FROM_EMAIL =
      process.env.FROM_EMAIL ||
      `The Edge HD Salon <${process.env.BOOKING_EMAIL_USER || ""}>`;

    const resolvedBusinessEmail =
      (businessEmail || "").trim() ||
      process.env.BUSINESS_EMAIL ||
      extractEmail(FROM_EMAIL);

    if (!isEmail(resolvedBusinessEmail)) {
      return json(400, { ok: false, error: "businessEmail is required and must be valid" });
    }
    if (!booking.start) {
      return json(400, { ok: false, error: "booking.start is required (ISO string)" });
    }

    const tz = business.timezone || "Europe/London";
    const when = new Date(booking.start).toLocaleString("en-GB", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
    });

    const bizName = esc(business.name || "The Edge HD Salon");
    const bizAddr = esc(business.address || "—");
    const serviceName = esc(service.name || "a service");
    const providerName = esc(provider.name || "our team");
    const notesClean = (notes || "").trim();
    const notesHTML = notesClean ? withLineBreaks(notesClean) : "";

    const transporter = makeTransporter();
    await transporter.verify();
    console.log("✅ Email transporter verified.");

    // ---------- Customer email ----------
    const customerSubject = `Booking Request Received – ${bizName}`;
    const customerHtml = `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <p style="margin:0 0 8px 0">Hi ${clientFirst},</p>
        <p style="margin:0 0 8px 0">Thanks for your booking request for <b>${serviceName}</b> with <b>${providerName}</b>.</p>
        <p style="margin:0 0 4px 0"><b>When:</b> ${esc(when)} (${esc(tz)})</p>
        <p style="margin:0 0 12px 0"><b>Where:</b> ${bizAddr}</p>
        ${notesClean ? `<p style="margin:0 0 12px 0"><b>Your notes:</b><br>${notesHTML}</p>` : ``}
        <p style="margin:0;color:#666">Our staff will contact you to confirm this booking.</p>
        <p style="margin:0;color:#666">If you need to change anything, just reply to this email.</p>
      </div>`;
    const customerText =
      `Hi ${rawClientName.split(" ")[0] || "there"},\n\n` +
      `Booking Request sent – ${business.name || "The Edge HD Salon"}\n` +
      `Service: ${service.name || "a service"}\n` +
      `Provider: ${provider.name || "our team"}\n` +
      `When: ${when} (${tz})\n` +
      `Where: ${business.address || "—"}\n` +
      (notesClean ? `Notes: ${notesClean}\n` : ``);

    // ---------- Salon email (now includes Phone) ----------
    const businessSubject = `New booking request`;
    const businessHtml = `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <p style="margin:0 0 4px 0"><b>Client:</b> ${clientFull}</p>
        ${phoneHtml}
        <p style="margin:0 0 4px 0"><b>Service:</b> ${serviceName}</p>
        <p style="margin:0 0 4px 0"><b>Provider:</b> ${providerName}</p>
        <p style="margin:0 0 4px 0"><b>When:</b> ${esc(when)} (${esc(tz)})</p>
        <p style="margin:0 0 4px 0"><b>Customer email:</b> ${esc(customerEmail || "—")}</p>
        ${notesClean ? `<p style="margin:8px 0 0 0"><b>Customer notes:</b><br>${notesHTML}</p>` : ``}
      </div>`;
    const businessText =
      `New booking request\n` +
      `Client: ${rawClientName || "—"}\n` +
      `Phone: ${phoneText}\n` +                  // <-- added to text version
      `Service: ${service.name || "—"}\n` +
      `Provider: ${provider.name || "—"}\n` +
      `When: ${when} (${tz})\n` +
      `Customer email: ${customerEmail || "—"}\n` +
      (notesClean ? `Customer notes: ${notesClean}\n` : ``);

    // Send emails
    const tasks = [];

    if (customerEmail && isEmail(customerEmail)) {
      tasks.push(
        transporter.sendMail({
          from: FROM_EMAIL,
          to: customerEmail,
          subject: customerSubject,
          html: customerHtml,
          text: customerText,
          replyTo: resolvedBusinessEmail, // replies go to salon
        })
      );
    }

    tasks.push(
      transporter.sendMail({
        from: FROM_EMAIL,
        to: resolvedBusinessEmail,
        subject: businessSubject,
        html: businessHtml,
        text: businessText,
        replyTo: customerEmail && isEmail(customerEmail) ? customerEmail : undefined,
      })
    );

    const infos = await Promise.all(tasks);
    infos.forEach((info, i) =>
      console.log(`📤 Email ${i + 1} sent:`, info && info.messageId)
    );

    return json(200, { ok: true, message: "Emails sent" });
  } catch (err) {
    console.error("❌ Booking email failed:", err);
    return json(500, { ok: false, error: err.message || String(err) });
  }
}
