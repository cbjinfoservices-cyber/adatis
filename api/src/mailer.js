const nodemailer = require('nodemailer');

/**
 * Envoi d'emails d'exploitation (alertes de disponibilité).
 *
 * Transport, par ordre de priorité :
 *   1. SMTP interne (SMTP_HOST) : les messages ne quittent pas le réseau de
 *      l'entreprise. TLS obligatoire : implicite si SMTP_SECURE=true (465),
 *      sinon STARTTLS exigé ; certificat vérifié (autorité interne possible
 *      via NODE_EXTRA_CA_CERTS).
 *   2. Resend (RESEND_API_KEY) : service externe. En production, refusé au
 *      démarrage sauf ALLOW_EXTERNAL_MAIL=true (cf. security.js).
 *
 * Les identifiants ne vivent que côté serveur (secrets Kubernetes) : la page
 * Système expose seulement `emailConfigured` (booléen).
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const senderAddress = () => {
  const explicit = (process.env.ALERT_EMAIL_FROM || '').trim();
  if (explicit) return explicit;
  const domain = (process.env.RESEND_FROM_DOMAIN || '').trim();
  return domain ? `alertes@${domain}` : '';
};

/** 'smtp', 'resend' ou '' (aucun transport). */
const transportKind = () => {
  if ((process.env.SMTP_HOST || '').trim()) return 'smtp';
  if (process.env.RESEND_API_KEY) return 'resend';
  return '';
};

/** Vrai si un transport et une adresse d'expédition sont disponibles. */
const emailConfigured = () => Boolean(transportKind() && senderAddress());

let smtpTransport = null;

const smtp = () => {
  if (smtpTransport) return smtpTransport;
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
  const user = (process.env.SMTP_USER || '').trim();
  smtpTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST.trim(),
    port: Number(process.env.SMTP_PORT || (secure ? 465 : 587)),
    secure,
    requireTLS: !secure,
    ...(user ? { auth: { user, pass: process.env.SMTP_PASSWORD || '' } } : {}),
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  return smtpTransport;
};

const sendSmtp = async ({ from, to, subject, text }) => {
  try {
    await smtp().sendMail({
      from, to, subject, text,
    });
    return { sent: true, error: null };
  } catch (err) {
    return { sent: false, error: `smtp: ${String(err.message).slice(0, 180)}` };
  }
};

const sendResend = async ({ from, to, subject, text }) => {
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

const sendEmail = async ({ to, subject, text }) => {
  const kind = transportKind();
  if (!kind) {
    return { sent: false, error: 'mail_transport_missing' };
  }
  const from = senderAddress();
  if (!from) {
    return { sent: false, error: 'sender_address_missing' };
  }
  if (!to) {
    return { sent: false, error: 'recipient_missing' };
  }
  return kind === 'smtp'
    ? sendSmtp({
      from, to, subject, text,
    })
    : sendResend({
      from, to, subject, text,
    });
};

module.exports = {
  sendEmail, emailConfigured, senderAddress, transportKind,
};
