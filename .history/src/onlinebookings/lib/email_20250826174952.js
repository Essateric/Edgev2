// lib/email.js
export async function sendBookingEmails(payload) {
  const res = await fetch("/.netlify/functions/send-booking-emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || "Email function failed");
  }
  return data;
}
