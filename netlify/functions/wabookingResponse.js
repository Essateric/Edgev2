import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
};

export const handler = async (event) => {
  try {
    const sb = supabaseAdmin();

    const token = event.queryStringParameters?.token;
    const r = String(event.queryStringParameters?.r || "").toLowerCase();

    if (!token) return html(400, "Missing token");
    if (!["confirm", "cancel"].includes(r)) return html(400, "Invalid response");

    const { data: conf, error } = await sb
      .from("booking_confirmations")
      .select("id, booking_id, status, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (error) throw error;
    if (!conf) return html(404, "Link not found");
    if (conf.status && conf.status !== "pending") return html(200, `Already ${conf.status}`);
    if (conf.expires_at && new Date(conf.expires_at).getTime() < Date.now()) {
      await sb.from("booking_confirmations").update({ status: "expired" }).eq("id", conf.id);
      return html(410, "This link has expired");
    }

    const newStatus = r === "confirm" ? "confirmed" : "cancelled";
    const now = new Date().toISOString();

    // update confirmation row
    const { error: u1 } = await sb
      .from("booking_confirmations")
      .update({ status: newStatus, responded_at: now, response_text: r })
      .eq("id", conf.id);
    if (u1) throw u1;

    // update booking row (THIS drives the green slot)
    const bookingPatch =
      newStatus === "confirmed"
        ? { confirmation_status: "confirmed", confirmed_at: now }
        : { confirmation_status: "cancelled", cancelled_at: now };

    const { error: u2 } = await sb.from("bookings").update(bookingPatch).eq("id", conf.booking_id);
    if (u2) throw u2;

    return html(200, newStatus === "confirmed" ? "✅ Booking confirmed." : "❌ Booking cancelled.");
  } catch (e) {
    return html(500, e?.message || "Server error");
  }
};

const html = (statusCode, message) => ({
  statusCode,
  headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  body: `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="font-family:system-ui;padding:24px"><h2>${escapeHtml(
    message
  )}</h2></body></html>`,
});

const escapeHtml = (s) =>
  String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
