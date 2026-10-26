/**
 * Envoi d'emails d'exploitation via Resend.
 *
 * La clé ne vit que côté serveur (secret Kubernetes RESEND_API_KEY) et n'est
 * jamais renvoyée au navigateur : la page Système expose seulement
 * `emailConfigured` (booléen) pour indiquer si les alertes peuvent partir.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const senderAddress = () => {
  const explicit = (process.env.ALERT_EMAIL_FROM || '').trim();
  if (explicit) return explicit;
  const domain = (process.env.RESEND_FROM_DOMAIN || '').trim();
  return domain ? `alertes@${domain}` : '';
};

/** Vrai si une clé Resend et une adresse d'expédition sont disponibles. */
const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && senderAddress());

const sendEmail = async ({ to, subject, text }) => {
  if (!process.env.RESEND_API_KEY) {
    return { sent: false, error: 'resend_api_key_missing' };
  }
  const from = senderAddress();
  if (!from) {
    return { sent: false, error: 'sender_address_missing' };
  }
  if (!to) {
    return { sent: false, error: 'recipient_missing' };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    const body = await response.text();
    if (!response.ok) {
      return { sent: false, error: `resend_${response.status}: ${body.slice(0, 180)}` };
    }
    return { sent: true, error: null };
  } catch (err) {
    return { sent: false, error: err.message };
  }
};

module.exports = { sendEmail, emailConfigured, senderAddress };