// netlify/functions/bookingResponse.mjs
import { createClient } from "@supabase/supabase-js";

const env = (key, fallbacks = []) => {
  const direct = process.env[key];
  if (direct) return direct;
  for (const k of fallbacks) {
    const v = process.env[k];
    if (v) return v;
  }
  return undefined;
};

const supabaseAdmin = () => {
  const url = env("SUPABASE_URL", ["VITE_SUPABASE_URL"]);
  const key = env("SUPABASE_SERVICE_ROLE_KEY", ["SUPABASE_SECRET_KEY"]);
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false },
  });
};

const escapeHtml = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const html = (title, msg) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;padding:24px;max-width:720px;margin:0 auto;}
      .card{border:1px solid #e5e7eb;border-radius:16px;padding:18px;background:#fff;}
      .muted{color:#6b7280}
      .ok{color:#065f46}
      .bad{color:#991b1b}
    </style>
  </head>
  <body>
    <div class="card">
      <h2 style="margin:0 0 10px;">${escapeHtml(title)}</h2>
      <p style="margin:0;">${escapeHtml(msg)}</p>
      <p class="muted" style="margin:14px 0 0;font-size:13px;">You can now close this page.</p>
    </div>
  </body>
</html>`;

const pickResponse = (rRaw) => {
  const r = String(rRaw || "").toLowerCase().trim();
  if (r === "confirm") return "confirm";
  if (r === "cancel") return "cancel";
  return null;
};

export const handler = async (event) => {
  // This endpoint is normally hit via a browser link (GET), but allow POST too.
  if (!["GET", "POST"].includes(event.httpMethod || "GET")) {
    return {
      statusCode: 405,
      headers: { "Content-Type": "text/plain" },
      body: "Method not allowed",
    };
  }

  try {
    const token = event.queryStringParameters?.token;
    const response = pickResponse(event.queryStringParameters?.r);

    if (!token) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "text/html", "Cache-Control": "no-store" },
        body: html("Missing token", "This link is missing a token."),
      };
    }

    if (!response) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "text/html", "Cache-Control": "no-store" },
        body: html("Invalid response", "This link is not valid."),
      };
    }

    const sb = supabaseAdmin();
    const nowIso = new Date().toISOString();

    // 1) Load confirmation by token
    const { data: conf, error: confErr } = await sb
      .from("booking_confirmations")
      .select("id, booking_id, expires_at, responded_at, response, channel")
      .eq("token", token)
      .maybeSingle();

    if (confErr) throw confErr;

    if (!conf) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "text/html", "Cache-Control": "no-store" },
        body: html("Link not found", "This link is not valid."),
      };
    }

    // expired?
    if (conf.expires_at && new Date(conf.expires_at) < new Date()) {
      return {
        statusCode: 410,
        headers: { "Content-Type": "text/html", "Cache-Control": "no-store" },
        body: html("Link expired", "This link has expired. Please contact the salon."),
      };
    }

    // idempotent
    if (conf.responded_at) {
      const already = conf.response === "confirm" ? "confirmed" : "cancelled";
      return {
        statusCode: 200,
        headers: { "Content-Type": "text/html", "Cache-Control": "no-store" },
        body: html("Already recorded", `Your response was already recorded as ${already}.`),
      };
    }

    // 2) Load the booking row referenced by booking_confirmations.booking_id (uuid)
    const { data: booking, error: bErr } = await sb
      .from("bookings")
      .select("id, booking_id, client_id")
      .eq("id", conf.booking_id)
      .maybeSingle();

    if (bErr) throw bErr;

    if (!booking) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "text/html", "Cache-Control": "no-store" },
        body: html("Booking missing", "We couldn't find the booking for this link."),
      };
    }

    // 3) Affect ALL slots in the same block (same bookings.booking_id text)
    let affectedIds = [booking.id];

    if (booking.booking_id) {
      const { data: allSlots, error: aErr } = await sb
        .from("bookings")
        .select("id")
        .eq("booking_id", booking.booking_id);

      if (aErr) throw aErr;
      affectedIds = (allSlots || []).map((x) => x.id);
      if (!affectedIds.length) affectedIds = [booking.id];
    }

    // 4) Update bookings + notes + confirmation
    if (response === "confirm") {
      const { error: upErr } = await sb
        .from("bookings")
        .update({ status: "confirmed" })
        .in("id", affectedIds);

      if (upErr) throw upErr;

      await sb.from("client_notes").insert({
        client_id: booking.client_id,
        booking_id: booking.id,
        note_content: "Client confirmed appointment via reminder link.",
        created_by: "client",
      });

      await sb
        .from("booking_confirmations")
        .update({
          responded_at: nowIso,
          response: "confirm",
        })
        .eq("id", conf.id);

      return {
        statusCode: 200,
        headers: { "Content-Type": "text/html", "Cache-Control": "no-store" },
        body: html("Confirmed ✅", "Thanks! Your appointment has been confirmed."),
      };
    }

    // CANCEL
    // IMPORTANT: use a non-filtered status so it can stay visible on the calendar if you want.
    // If you want it to disappear, change this back to "cancelled".
    const cancelledStatus = "client_cancelled";

    const { error: upErr } = await sb
      .from("bookings")
      .update({ status: cancelledStatus })
      .in("id", affectedIds);

    if (upErr) throw upErr;

    await sb.from("client_notes").insert({
      client_id: booking.client_id,
      booking_id: booking.id,
      note_content: "Client cancelled appointment via reminder link.",
      created_by: "client",
    });

    await sb
      .from("booking_confirmations")
      .update({
        responded_at: nowIso,
        response: "cancel",
      })
      .eq("id", conf.id);

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html", "Cache-Control": "no-store" },
      body: html("Cancelled", "Your appointment has been cancelled."),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html", "Cache-Control": "no-store" },
      body: html("Server error", e?.message || "Something went wrong."),
    };
  }
};
