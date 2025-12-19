import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
};

const html = (title, msg) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${title}</title>
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;padding:24px;max-width:720px;margin:0 auto;}
      .card{border:1px solid #e5e7eb;border-radius:16px;padding:18px;background:#fff;}
      .muted{color:#6b7280}
    </style>
  </head>
  <body>
    <div class="card">
      <h2 style="margin:0 0 10px;">${title}</h2>
      <p style="margin:0;">${msg}</p>
      <p class="muted" style="margin:14px 0 0;font-size:13px;">You can now close this page.</p>
    </div>
  </body>
</html>`;

export const handler = async (event) => {
  try {
    const token = event.queryStringParameters?.token;
    const r = String(event.queryStringParameters?.r || "").toLowerCase();

    if (!token) return { statusCode: 400, headers: { "Content-Type": "text/plain" }, body: "Missing token" };
    if (!["confirm", "cancel"].includes(r)) {
      return { statusCode: 400, headers: { "Content-Type": "text/plain" }, body: "Invalid response" };
    }

    const sb = supabaseAdmin();

    // Load confirmation + booking
    const { data: conf, error: confErr } = await sb
      .from("booking_confirmations")
      .select("id, booking_id, expires_at, responded_at, response, client_phone, channel")
      .eq("token", token)
      .maybeSingle();

    if (confErr) throw confErr;
    if (!conf) {
      return { statusCode: 404, headers: { "Content-Type": "text/html" }, body: html("Link not found", "This link is not valid.") };
    }

    const now = new Date();
    if (new Date(conf.expires_at) < now) {
      return { statusCode: 410, headers: { "Content-Type": "text/html" }, body: html("Link expired", "This link has expired. Please contact the salon.") };
    }

    // Idempotent: if already responded, just show result
    if (conf.responded_at) {
      const already = conf.response === "confirm" ? "confirmed" : "cancelled";
      return { statusCode: 200, headers: { "Content-Type": "text/html" }, body: html("Already recorded", `Your response was already recorded as ${already}.`) };
    }

    const { data: booking, error: bErr } = await sb
      .from("bookings")
      .select("id, booking_id, client_id")
      .eq("id", conf.booking_id)
      .maybeSingle();

    if (bErr) throw bErr;
    if (!booking) {
      return { statusCode: 404, headers: { "Content-Type": "text/html" }, body: html("Booking missing", "We couldn't find the booking for this link.") };
    }

    // ✅ Find ALL slots in the same block (same bookings.booking_id text)
    let affected = [];
    if (booking.booking_id) {
      const { data, error } = await sb
        .from("bookings")
        .select("id, booking_id, client_id")
        .eq("booking_id", booking.booking_id);

      if (error) throw error;
      affected = data || [];
    } else {
      // Fallback: only the single booking
      affected = [{ id: booking.id, booking_id: null, client_id: booking.client_id }];
    }

    const affectedIds = affected.map((x) => x.id);

    if (r === "confirm") {
      const { error: upErr } = await sb
        .from("bookings")
        .update({ status: "confirmed" })
        .in("id", affectedIds);

      if (upErr) throw upErr;

      await sb.from("client_notes").insert({
        client_id: booking.client_id,
        booking_id: booking.id,
        note_content: "Client confirmed appointment via SMS link.",
        created_by: "client",
      });

      await sb.from("booking_confirmations").update({
        responded_at: new Date().toISOString(),
        response: "confirm",
      }).eq("id", conf.id);

      return { statusCode: 200, headers: { "Content-Type": "text/html" }, body: html("Confirmed ✅", "Thanks! Your appointment has been confirmed.") };
    }

    // cancel
    const { error: upErr } = await sb
      .from("bookings")
      .update({ status: "cancelled" })
      .in("id", affectedIds);

    if (upErr) throw upErr;

    await sb.from("client_notes").insert({
      client_id: booking.client_id,
      booking_id: booking.id,
      note_content: "Client cancelled appointment via SMS link.",
      created_by: "client",
    });

    await sb.from("booking_confirmations").update({
      responded_at: new Date().toISOString(),
      response: "cancel",
    }).eq("id", conf.id);

    return { statusCode: 200, headers: { "Content-Type": "text/html" }, body: html("Cancelled", "Your appointment has been cancelled.") };
  } catch (e) {
    return { statusCode: 500, headers: { "Content-Type": "text/plain" }, body: e?.message || "Server error" };
  }
};
