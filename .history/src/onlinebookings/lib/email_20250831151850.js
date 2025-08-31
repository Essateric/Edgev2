// lib/email.js

// Decide where to call the function from.
// - In production: ""  (relative path, same as before)
// - In development: use VITE_FUNCTIONS_BASE if provided, otherwise "" (relative)
//   Set VITE_FUNCTIONS_BASE to something like "http://localhost:8888"
//   if you're running functions separately (e.g., `netlify functions:serve`).
const FUNCTIONS_BASE =
  (typeof window !== "undefined" && window.__FUNCTIONS_BASE__) || // optional runtime override
  import.meta.env.VITE_FUNCTIONS_BASE ||                          // .env override
  (import.meta.env.PROD ? "" : "");                               // default: keep relative

export async function sendBookingEmails(payload) {
  const url = `${FUNCTIONS_BASE}/.netlify/functions/send-booking-emails`;

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    // Same outward behavior: throw if it fails
    throw new Error(`Email function failed: ${networkErr?.message || "Network error"}`);
  }

  // Parse JSON if possible; ignore if not
  const data = await res.json().catch(() => ({}));

  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || "Email function failed");
  }

  return data;
}
