export async function sendBookingEmails(payload) {
  const base = import.meta.env.VITE_FUNCTIONS_URL || "";
  const url = base
    ? `${base}/send-booking-emails`
    : "/.netlify/functions/send-booking-emails"; // ✅ Netlify path

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return res.json();
}
