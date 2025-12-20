import nodemailer from "nodemailer";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
};

const getBaseUrl = () => {
  // Netlify provides URL / DEPLOY_PRIME_URL. Use your own if you prefer.
  return (
    process.env.PUBLIC_SITE_URL ||
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL
  );
};

const normalizeUkMobileToE164 = (raw) => {
  const s = String(raw || "").trim();
  if (!s) throw new Error("Invalid client phone");
  if (s.startsWith("+")) return s.replace(/[^\d+]/g, "");
  const digits = s.replace(/[^\d]/g, "");
  if (!digits) throw new Error("Invalid client phone");
  if (digits.startsWith("0")) return `+44${digits.slice(1)}`;
  if (digits.startsWith("44")) return `+${digits}`;
  if (digits.startsWith("7")) return `+44${digits}`;
  return `+${digits}`;
};

// ✅ small helper
const isUuid = (v) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

// ✅ small fix: guarantee we insert a REAL bookings.id uuid (FK-safe)
const resolveBookingUuid = async (sb, b, groupKey) => {
  // 1) if b.id is a real bookings.id, use it
  if (isUuid(b?.id)) {
    const { data, error } = await sb
      .from("bookings")
      .select("id")
      .eq("id", b.id)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) return data.id;
  }

  // 2) try any alternate uuid fields if you ever pass them
  const alt = b?.booking_uuid || b?.bookingId || b?.booking_row_id;
  if (isUuid(alt)) {
    const { data, error } = await sb
      .from("bookings")
      .select("id")
      .eq("id", alt)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) return data.id;
  }

  // 3) most common: the "block id" is stored in bookings.booking_id (text)
  const bookingIdText = String(b?.booking_id || groupKey || "").trim();
  if (bookingIdText) {
    const { data, error } = await sb
      .from("bookings")
      .select("id")
      .eq("booking_id", bookingIdText)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) return data.id;
  }

  throw new Error(
    "Could not resolve bookings.id for confirmation (need real booking uuid or a booking_id that exists in bookings.booking_id)"
  );
};

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    let channel = String(body.channel || "email").toLowerCase().trim();
    const template = body.template;
    const bookings = Array.isArray(body.bookings) ? body.bookings : [];
    const timezone = body.timezone || "Europe/London";

    if (channel === "whats_app") channel = "whatsapp";
    if (!["email", "sms", "whatsapp"].includes(channel)) {
      return { statusCode: 400, body: `Invalid channel: ${channel}` };
    }

    if (!template) return { statusCode: 400, body: "Missing message template" };
    if (!bookings.length) return { statusCode: 400, body: "No bookings provided" };

    const formatDate = (iso) =>
      new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: timezone })
        .format(new Date(iso));

    const formatTime = (iso) =>
      new Intl.DateTimeFormat("en-GB", { timeStyle: "short", timeZone: timezone })
        .format(new Date(iso));

    const renderBase = (tpl, b) =>
      String(tpl || "")
        .replaceAll("{{first_name}}", b?.client?.first_name || "")
        .replaceAll("{{last_name}}", b?.client?.last_name || "")
        .replaceAll("{{date}}", formatDate(b.start_time))
        .replaceAll("{{time}}", formatTime(b.start_time));

    const senders = {
      email: async (b, text) => {
        const user = process.env.BOOKING_EMAIL_USER || process.env.EMAIL_USER;
        const pass = process.env.BOOKING_EMAIL_PASS || process.env.EMAIL_PASS;

        const from = process.env.FROM_EMAIL || process.env.EMAIL_FROM || user;

        if (!user || !pass) throw new Error("BOOKING_EMAIL_USER/BOOKING_EMAIL_PASS not set");
        if (!b?.client?.email) throw new Error("Missing client email");

        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: { user, pass },
        });

        await transporter.sendMail({
          from,
          to: b.client.email,
          subject: "Appointment reminder",
          text,
          replyTo: process.env.REPLY_TO || undefined,
        });

        return true;
      },

      sms: async (b, text) => {
        const sid = process.env.TWILIO_ACCOUNT_SID;
        const token = process.env.TWILIO_AUTH_TOKEN;
        const messagingSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

        if (!sid || !token) throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set");
        if (!messagingSid) throw new Error("TWILIO_MESSAGING_SERVICE_SID not set (needed for SMS)");
        if (!b?.client?.phone) throw new Error("Missing client phone");

        const { default: twilio } = await import("twilio");
        const client = twilio(sid, token);

        await client.messages.create({
          body: text,
          to: normalizeUkMobileToE164(b.client.phone),
          messagingServiceSid: messagingSid,
        });

        return true;
      },

      whatsapp: async (b, text) => {
        const sid = process.env.TWILIO_ACCOUNT_SID;
        const token = process.env.TWILIO_AUTH_TOKEN;

        const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
        const messagingSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

        if (!sid || !token) throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set");
        if (!b?.client?.phone) throw new Error("Missing client phone");

        const e164 = normalizeUkMobileToE164(b.client.phone);
        const to = `whatsapp:${e164}`;

        const { default: twilio } = await import("twilio");
        const client = twilio(sid, token);

        const payload = {
          body: text,
          to,
          ...(whatsappFrom ? { from: whatsappFrom } : messagingSid ? { messagingServiceSid: messagingSid } : {}),
        };

        if (!payload.from && !payload.messagingServiceSid) {
          throw new Error("No WhatsApp sender set. Add TWILIO_WHATSAPP_FROM='whatsapp:+4478....' (recommended).");
        }

        await client.messages.create(payload);
        return true;
      },
    };

    const baseUrl = getBaseUrl();
    // ✅ Only required if you're sending LINKS (we keep links for WhatsApp)
    if (!baseUrl && channel === "whatsapp") {
      throw new Error("Missing PUBLIC_SITE_URL (or Netlify URL/DEPLOY_PRIME_URL) for WhatsApp confirm/cancel links");
    }

    // ✅ Group SMS/WhatsApp so you do NOT spam clients with multiple texts for the same booking block
    // 🔧 small fix: do NOT require id to be a bookings.id uuid (sometimes it’s the block id)
    const groups = new Map();
    for (const b of bookings) {
      const groupKey = String(b.booking_id || b?.id || "");
      if (!groupKey) throw new Error("Each booking must include booking_id or id");
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push(b);
    }

    const sb = supabaseAdmin();

    let ok = 0;
    let fail = 0;
    const results = [];

    const sendOne = async (repBooking, groupKey) => {
      let text = renderBase(template, repBooking);

      // ✅ SMS: NO LINKS. Create a pending confirmation + ask YES/NO
      if (channel === "sms") {
        const token = crypto.randomBytes(24).toString("base64url");
        const e164 = normalizeUkMobileToE164(repBooking.client.phone);
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48); // 48h

        // 🔧 FIX: ensure booking_id is the REAL bookings.id uuid (FK-safe)
        const bookingUuid = await resolveBookingUuid(sb, repBooking, groupKey);

        const { error: insErr } = await sb
          .from("booking_confirmations")
          .insert({
            booking_id: bookingUuid,
            token,
            client_phone: e164,
            channel: "sms",
            expires_at: expiresAt.toISOString(),
          });

        if (insErr) throw insErr;

        text += `\n\nReply YES to confirm or NO to cancel.`;
      }

      // ✅ WhatsApp: keep your existing link logic exactly as before
      if (channel === "whatsapp") {
        const token = crypto.randomBytes(24).toString("base64url");
        const e164 = normalizeUkMobileToE164(repBooking.client.phone);
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48); // 48h

        // 🔧 FIX: ensure booking_id is the REAL bookings.id uuid (FK-safe)
        const bookingUuid = await resolveBookingUuid(sb, repBooking, groupKey);

        const { error: insErr } = await sb
          .from("booking_confirmations")
          .insert({
            booking_id: bookingUuid,
            token,
            client_phone: e164,
            channel: "whatsapp",
            expires_at: expiresAt.toISOString(),
          });

        if (insErr) throw insErr;

        const confirmUrl = `${baseUrl}/.netlify/functions/bookingResponse?token=${encodeURIComponent(token)}&r=confirm`;
        const cancelUrl = `${baseUrl}/.netlify/functions/bookingResponse?token=${encodeURIComponent(token)}&r=cancel`;

        if (text.includes("{{confirm_url}}") || text.includes("{{cancel_url}}")) {
          text = text
            .replaceAll("{{confirm_url}}", confirmUrl)
            .replaceAll("{{cancel_url}}", cancelUrl);
        } else {
          text += `\n\nConfirm: ${confirmUrl}\nCancel: ${cancelUrl}`;
        }
      }

      const fn = senders[channel];
      if (!fn) throw new Error("Unsupported channel");
      await fn(repBooking, text);
    };

    for (const [groupKey, items] of groups.entries()) {
      const rep = items[0]; // the “first booking” identifies the rest
      try {
        await sendOne(rep, groupKey);
        results.push({ group_key: groupKey, booking_ids: items.map((x) => x.id), ok: true });
        ok++;
      } catch (err) {
        results.push({
          group_key: groupKey,
          booking_ids: items.map((x) => x?.id || null),
          ok: false,
          error: err?.message || String(err),
        });
        fail++;
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({
        total_groups: groups.size,
        success: ok,
        failed: fail,
        results,
      }),
    };
  } catch (e) {
  return {
    statusCode: 400,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify({ message: e?.message || "Bad request" }),
  };
}

};
