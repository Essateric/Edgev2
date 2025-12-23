import { createClient } from "@supabase/supabase-js";

const sbAdmin = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
};

const twiml = (msg) =>
  `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${String(msg)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")}</Message></Response>`;

const parseReply = (bodyRaw) => {
  const t = String(bodyRaw || "").trim().toLowerCase();
  if (!t) return null;
  if (["y", "yes", "confirm", "confirmed"].includes(t)) return "confirm";
  if (["n", "no", "cancel", "cancelled", "c"].includes(t)) return "cancel";
  return null;
};

const normalizeFrom = (from) => String(from || "").trim().replace(/^whatsapp:/i, "");

export const handler = async (event) => {
  try {
    const bodyRaw = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");

    const params = new URLSearchParams(bodyRaw);
    const from = normalizeFrom(params.get("From")); // +447...
    const body = params.get("Body");
    const messageSid = params.get("MessageSid");

    if (!from) {
      return { statusCode: 200, headers: { "Content-Type": "text/xml" }, body: twiml("Missing sender.") };
    }

    const response = parseReply(body);
    if (!response) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "text/xml" },
        body: twiml("Please reply YES to confirm or NO to cancel."),
      };
    }

    const sb = sbAdmin();
    const nowIso = new Date().toISOString();

    // ✅ newest pending confirmation for this phone
    const { data: conf, error: cErr } = await sb
      .from("booking_confirmations")
      .select("id, booking_id, expires_at, responded_at, channel, created_at")
      .eq("client_phone", from)
      .eq("channel", "sms")
      .is("responded_at", null)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cErr) throw cErr;

    if (!conf) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "text/xml" },
        body: twiml("No pending booking found. Please contact the salon."),
      };
    }

    const { data: booking, error: bErr } = await sb
      .from("bookings")
      .select("id, booking_id, client_id, client_name, start")
      .eq("id", conf.booking_id)
      .maybeSingle();

    if (bErr) throw bErr;
    if (!booking) {
      return { statusCode: 200, headers: { "Content-Type": "text/xml" }, body: twiml("Booking not found.") };
    }

    // ✅ update ALL rows in the same booking block
    let affectedIds = [booking.id];

    if (booking.booking_id) {
      const { data: allSlots, error: aErr } = await sb
        .from("bookings")
        .select("id")
        .eq("booking_id", booking.booking_id);

      if (aErr) throw aErr;
      affectedIds = (allSlots || []).map((x) => x.id);
    }

    // Try to load client details for a friendlier reply
    let clientFirstName = "";
    let clientLastName = "";

    if (booking.client_id) {
      try {
        const { data: clientRow, error: cErr } = await sb
          .from("clients")
          .select("first_name, last_name")
          .eq("id", booking.client_id)
          .maybeSingle();
        if (cErr) throw cErr;
        clientFirstName = clientRow?.first_name || "";
        clientLastName = clientRow?.last_name || "";
      } catch (e) {
        // fallback to booking.client_name below
      }
    }

    if (!clientFirstName && booking.client_name) {
      const parts = String(booking.client_name).trim().split(" ");
      clientFirstName = parts[0] || "";
      clientLastName = parts.slice(1).join(" ");
    }

    const formatDate = (iso) =>
      new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeZone: "Europe/London",
      }).format(new Date(iso));

    const formatTime = (iso) =>
      new Intl.DateTimeFormat("en-GB", {
        timeStyle: "short",
        timeZone: "Europe/London",
      }).format(new Date(iso));

    const startLabel = booking?.start ? `${formatDate(booking.start)} at ${formatTime(booking.start)}` : "your appointment";
  const nameLabel = clientFirstName || "there";

    if (response === "confirm") {
      const { error: upErr } = await sb
        .from("bookings")
        .update({ status: "confirmed" })
        .in("id", affectedIds);
      if (upErr) throw upErr;

      await sb.from("client_notes").insert({
        client_id: booking.client_id,
        booking_id: booking.id,
        note_content: "Client confirmed appointment via SMS reply (YES).",
        created_by: "client",
      });

      await sb.from("booking_confirmations").update({
        responded_at: nowIso,
        response: "confirm",
        inbound_message_sid: messageSid || null,
      }).eq("id", conf.id);
   return {
        statusCode: 200,
        headers: { "Content-Type": "text/xml" },
        body: twiml(`Thanks ${nameLabel}, your appointment on ${startLabel} has been confirmed ✅`),
      };
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
      note_content: "Client cancelled appointment via SMS reply (NO).",
      created_by: "client",
    });

    await sb.from("booking_confirmations").update({
      responded_at: nowIso,
      response: "cancel",
      inbound_message_sid: messageSid || null,
    }).eq("id", conf.id);

    return { statusCode: 200, headers: { "Content-Type": "text/xml" }, body: twiml("Your appointment has been cancelled.") };
  } catch (e) {
    return { statusCode: 200, headers: { "Content-Type": "text/xml" }, body: twiml(e?.message || "Error") };
  }
};
