// Sends email via Nodemailer (Gmail) and optionally SMS/WhatsApp via Twilio.
// Env vars (Netlify):
// - EMAIL_USER, EMAIL_PASS (Gmail/App Password), EMAIL_FROM
// - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID

import nodemailer from 'nodemailer';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const {
      channel = 'email',
      template,
      bookings = [],
      timezone = 'Europe/London',
    } = JSON.parse(event.body || '{}');

    if (!template) return { statusCode: 400, body: 'Missing message template' };
    if (!bookings.length) return { statusCode: 400, body: 'No bookings provided' };

    const formatDate = (iso) =>
      new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeZone: timezone,
      }).format(new Date(iso));

    const formatTime = (iso) =>
      new Intl.DateTimeFormat('en-GB', {
        timeStyle: 'short',
        timeZone: timezone,
      }).format(new Date(iso));

    const render = (tpl, b) =>
      tpl
        .replaceAll('{{first_name}}', b?.client?.first_name || '')
        .replaceAll('{{last_name}}', b?.client?.last_name || '')
        .replaceAll('{{date}}', formatDate(b.start_time))
        .replaceAll('{{time}}', formatTime(b.start_time));

    const senders = {
      email: async (b, text) => {
        const user = process.env.EMAIL_USER;
        const pass = process.env.EMAIL_PASS;
        const from = process.env.EMAIL_FROM || user;

        if (!user || !pass) throw new Error('EMAIL_USER/EMAIL_PASS not set');
        if (!b?.client?.email) throw new Error('Missing client email');

        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user, pass },
        });

        await transporter.sendMail({
          from,
          to: b.client.email,
          subject: 'Appointment reminder',
          text,
        });

        return true;
      },

      sms: async (b, text) => {
        const sid = process.env.TWILIO_ACCOUNT_SID;
        const token = process.env.TWILIO_AUTH_TOKEN;
        const messagingSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

        if (!sid || !token || !messagingSid) throw new Error('Twilio env vars not set');
        if (!b?.client?.phone) throw new Error('Missing client phone');

        // Lazy load Twilio only when needed (keeps Edge-safe and reduces cold start)
        const { default: twilio } = await import('twilio');
        const client = twilio(sid, token);

        await client.messages.create({
          body: text,
          to: b.client.phone,
          messagingServiceSid: messagingSid,
        });

        return true;
      },
whatsapp: async (b, text) => {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const messagingSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!sid || !token || !messagingSid) throw new Error('Twilio env vars not set');
  if (!b?.client?.phone) throw new Error('Missing client phone');

  // --- NEW: normalise UK mobiles to E.164 and add whatsapp: prefix ---
  const normalizeUkMobileToE164 = (raw) => {
    const digits = String(raw || '').replace(/[^\d]/g, '');
    if (!digits) throw new Error('Invalid client phone');

    if (digits.startsWith('0')) return `+44${digits.slice(1)}`;
    if (digits.startsWith('44')) return `+${digits}`;
    if (digits.startsWith('7')) return `+44${digits}`; // just in case
    if (raw.startsWith('+')) return raw;

    return `+${digits}`;
  };

  const e164 = normalizeUkMobileToE164(b.client.phone);
  const to = `whatsapp:${e164}`;
  // --- END NEW ---

  const { default: twilio } = await import('twilio');
  const client = twilio(sid, token);

  await client.messages.create({
    body: text,
    to,
    messagingServiceSid: messagingSid,
  });

  return true;
},

    };

    let ok = 0;
    let fail = 0;
    const results = [];

    for (const b of bookings) {
      const text = render(template, b);
      try {
        const fn = senders[channel];
        if (!fn) throw new Error('Unsupported channel');
        await fn(b, text);
        results.push({ booking_id: b.booking_id, ok: true });
        ok++;
      } catch (err) {
        results.push({ booking_id: b.booking_id, ok: false, error: err.message });
        fail++;
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', },
      body: JSON.stringify({ total: bookings.length, success: ok, failed: fail, results }),
    };
  } catch (e) {
    return { statusCode: 400, body: e?.message || 'Bad request' };
  }

};
