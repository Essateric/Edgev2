// Calls the Netlify Function; works in dev (netlify dev) and production
export async function sendBookingEmails(payload) {
  const base = import.meta.env.VITE_FUNCTIONS_URL || ""; // optional override
  const url = base
    ? `${base}/send-booking-emails`
    : "/.netlify/functions/send-booking-emails";

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Email function failed with ${res.status}`);
  }
  return res.json();
}
