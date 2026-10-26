/**
 * Test de joignabilité d'un connecteur (Jenkins, Terraform, GitLab…).
 *
 * Le portail n'exécute rien sur ces moteurs : il vérifie seulement que l'URL
 * configurée répond. Toute réponse HTTP < 500 compte comme joignable (un 401
 * ou 403 prouve que le service existe ; aucun identifiant n'est envoyé).
 * Réservé aux administrateurs (routes /connectors en écriture).
 */

const TIMEOUT_MS = () => {
  const parsed = Number(process.env.CONNECTOR_PROBE_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
};

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

  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { Accept: 'application/json, text/html;q=0.8, */*;q=0.5' },
      signal: AbortSignal.timeout(TIMEOUT_MS()),
    });
    const latency = Date.now() - started;
    await response.body?.cancel().catch(() => {});
    if (response.status >= 500) {
      return { ok: false, latency, error: `HTTP ${response.status}`, health: 'degraded' };
    }
    return { ok: true, latency, error: null, health: 'healthy' };
  } catch (err) {
    const cause = err?.cause?.code || (err?.name === 'TimeoutError' ? `délai dépassé (${TIMEOUT_MS()} ms)` : err?.message);
    return { ok: false, latency: 0, error: `Injoignable : ${cause || 'erreur réseau'}`.slice(0, 300), health: 'down' };
  }
};

module.exports = { probeEndpoint };
