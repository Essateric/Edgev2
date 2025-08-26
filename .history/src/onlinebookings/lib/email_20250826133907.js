// Thin client wrapper to call your Supabase Edge Function (server-side email)
export async function sendBookingEmails(supabase, payload) {
  // payload: { customerEmail, businessEmail, booking, service, provider, business }
  // Edge Function name: send-booking-emails
  const { data, error } = await supabase.functions.invoke("send-booking-emails", {
    body: payload,
  });
  if (error) {
    console.error("Email function error:", error);
    return { ok: false, error };
  }
  return { ok: true, data };
}
