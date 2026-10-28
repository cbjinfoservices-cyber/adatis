const dns = require('dns');
const http = require('http');
const https = require('https');
const net = require('net');

/**
 * Test de joignabilité d'un connecteur (Jenkins, Terraform, GitLab…).
 *
 * Le portail n'exécute rien sur ces moteurs : il vérifie seulement que l'URL
 * configurée répond. Toute réponse HTTP < 500 compte comme joignable (un 401
 * ou 403 prouve que le service existe ; aucun identifiant n'est envoyé).
 * Réservé aux administrateurs (routes /connectors en écriture).
 *
 * Protection SSRF : l'URL est saisie par un administrateur mais appelée par
 * le serveur, depuis son réseau.
 * - CONNECTOR_ALLOWED_HOSTS (noms séparés par des virgules, « *.domaine »
 *   accepté) : seuls ces hôtes sont testés. Obligatoire en production.
 * - Adresses de métadonnées cloud, link-local, multicast et non spécifiées :
 *   toujours refusées, quel que soit le nom qui y mène.
 * - L'adresse est vérifiée après résolution DNS, au moment de la connexion
 *   (pas de contournement par rebinding DNS), et les redirections ne sont
 *   pas suivies.
 */

const TIMEOUT_MS = () => {
  const parsed = Number(process.env.CONNECTOR_PROBE_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
};

const allowedHosts = () => String(process.env.CONNECTOR_ALLOWED_HOSTS || '')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

const hostAllowed = (hostname) => {
  const list = allowedHosts();
  if (!list.length) return process.env.NODE_ENV !== 'production';
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return list.some((rule) => (rule.startsWith('*.') ? host.endsWith(rule.slice(1)) : host === rule));
};

const ipv4Forbidden = (ip) => {
  const [a, b] = ip.split('.').map(Number);
  return a === 0 // non spécifiée
    || (a === 169 && b === 254) // link-local, métadonnées cloud (169.254.169.254)
    || (a === 100 && b === 100 && ip === '100.100.100.200') // métadonnées Alibaba
    || a >= 224; // multicast, réservé, diffusion
};

/** Vrai pour une adresse qu'aucun connecteur ne peut cibler. */
const isForbiddenAddress = (address) => {
  const ip = String(address || '').toLowerCase();
  if (net.isIPv4(ip)) return ipv4Forbidden(ip);
  if (!net.isIPv6(ip)) return true;
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Forbidden(mapped[1]);
  return ip === '::'
    || /^fe[89ab]/.test(ip) // link-local fe80::/10
    || ip.startsWith('ff') // multicast
    || ip === 'fd00:ec2::254'; // métadonnées AWS en IPv6
};

/** Résolution DNS qui refuse les adresses interdites (vérifiée à la connexion). */
const guardedLookup = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, /** @type {import('node:dns').LookupAddress[]} */ addresses) => {
    if (err) return callback(err);
    const forbidden = addresses.find((entry) => isForbiddenAddress(entry.address));
    if (forbidden) {
      const error = Object.assign(new Error(`adresse ${forbidden.address} interdite`), { code: 'EADDRFORBIDDEN' });
      return callback(error);
    }
    if (options?.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
};

const get = (url) => new Promise((resolve, reject) => {
  const client = url.protocol === 'https:' ? https : http;
  const req = client.request(url, {
    method: 'GET',
    lookup: guardedLookup,
    headers: { Accept: 'application/json, text/html;q=0.8, */*;q=0.5' },
    signal: AbortSignal.timeout(TIMEOUT_MS()),
  }, (res) => {
    res.resume();
    resolve(res.statusCode);
  });
  req.on('error', reject);
  req.end();
});

/** { ok, latency, error, health } — health : healthy | degraded | down | pending */
const probeEndpoint = async (endpoint) => {
  const raw = String(endpoint || '').trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, latency: 0, error: 'Aucune URL valide configurée', health: 'pending' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, latency: 0, error: 'Seules les URL http(s) sont testées', health: 'pending' };
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!hostAllowed(hostname)) {
    return {
      ok: false, latency: 0, error: `Hôte ${hostname} hors de CONNECTOR_ALLOWED_HOSTS : test refusé`, health: 'pending',
    };
  }
  // Une adresse IP littérale ne passe pas par la résolution DNS.
  if (net.isIP(hostname) && isForbiddenAddress(hostname)) {
    return { ok: false, latency: 0, error: `Adresse ${hostname} interdite`, health: 'pending' };
  }

  const started = Date.now();
  try {
    const status = await get(url);
    const latency = Date.now() - started;
    if (status >= 500) {
      return { ok: false, latency, error: `HTTP ${status}`, health: 'degraded' };
    }
    return { ok: true, latency, error: null, health: 'healthy' };
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    const cause = timedOut ? `délai dépassé (${TIMEOUT_MS()} ms)` : (err?.code || err?.message);
    return { ok: false, latency: 0, error: `Injoignable : ${cause || 'erreur réseau'}`.slice(0, 300), health: 'down' };
  }
};

module.exports = { probeEndpoint, isForbiddenAddress };
