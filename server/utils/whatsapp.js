const normalizePhoneNumber = (value) => {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';

  const digits = trimmed.replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) return digits;

  const defaultCountryCode = (process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '+233').trim();
  const normalizedCountryCode = defaultCountryCode.startsWith('+') ? defaultCountryCode : `+${defaultCountryCode}`;

  if (digits.startsWith('0')) {
    return `${normalizedCountryCode}${digits.slice(1)}`;
  }

  if (normalizedCountryCode.replace('+', '') && digits.startsWith(normalizedCountryCode.replace('+', ''))) {
    return `+${digits}`;
  }

  return `${normalizedCountryCode}${digits}`;
};

const isWhatsAppConfigured = () => {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID
    && process.env.TWILIO_AUTH_TOKEN
    && process.env.TWILIO_WHATSAPP_FROM
  );
};

export const canSendWhatsApp = () => isWhatsAppConfigured();

export const sendWhatsAppMessage = async ({ to, body }) => {
  if (!isWhatsAppConfigured()) {
    return { ok: false, skipped: true, error: 'WhatsApp provider is not configured' };
  }

  const normalizedTo = normalizePhoneNumber(to);
  if (!normalizedTo) {
    return { ok: false, skipped: true, error: 'Recipient phone number is missing or invalid' };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const authHeader = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
      To: `whatsapp:${normalizedTo}`,
      Body: body,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      skipped: false,
      error: payload?.message || 'WhatsApp send failed',
    };
  }

  return {
    ok: true,
    skipped: false,
    sid: payload?.sid || '',
  };
};
