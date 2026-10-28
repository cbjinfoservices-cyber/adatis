/**
 * Client AWX — OAuth2 « Authorization Code ».
 *
 * Toutes les valeurs sensibles (client secret, jetons utilisateur) restent
 * côté serveur : le navigateur ne reçoit qu'un cookie de session opaque.
 *
 * Variables d'environnement :
 *   AWX_BASE_URL        ex. https://awx.acme.fr           (obligatoire)
 *   AWX_CLIENT_ID       application OAuth2 créée dans AWX (obligatoire)
 *   AWX_CLIENT_SECRET   secret de l'application AWX       (obligatoire)
 *   AWX_SCOPES          défaut « read write »
 *   AWX_REDIRECT_URI    défaut https://<portail>/api/auth/callback
 *   AWX_ADMIN_USERS     liste d'identifiants AWX promus admin (séparés par ,)
 *   AWX_TIMEOUT_MS      délai max des appels AWX (défaut 10000)
 */

const trimSlash = (value) => String(value || '').trim().replace(/\/+$/, '');

const readConfig = () => {
  const baseUrl = trimSlash(process.env.AWX_BASE_URL);
  const clientId = String(process.env.AWX_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.AWX_CLIENT_SECRET || '').trim();
  const scopes = String(process.env.AWX_SCOPES || 'read write').trim() || 'read write';
  const portalUrl = trimSlash(process.env.PORTAL_URL);
  const redirectUri = String(process.env.AWX_REDIRECT_URI || '').trim()
    || (portalUrl ? `${portalUrl}/api/auth/callback` : '');

  return {
    baseUrl,
    clientId,
    clientSecret,
    scopes,
    portalUrl,
    redirectUri,
    configured: Boolean(baseUrl && clientId && clientSecret),
  };
};

const timeoutMs = () => {
  const parsed = Number(process.env.AWX_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10000;
};

/** Rôle portail des administrateurs déclarés hors AWX (variable d'env). */
const adminUsernames = () => String(process.env.AWX_ADMIN_USERS || '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

const basicAuth = (clientId, clientSecret) => Buffer
  .from(`${clientId}:${clientSecret}`)
  .toString('base64');

const postForm = async (url, form, clientId, clientSecret) => {
  const body = new URLSearchParams(form).toString();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
    },
    body,
    signal: AbortSignal.timeout(timeoutMs()),
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail = payload?.error_description || payload?.error || payload?.detail || text.slice(0, 200);
    const error = Object.assign(new Error(`Ascender a refusé la requête OAuth (${response.status}) : ${detail || 'sans détail'}`), { status: response.status, awx: payload });
    throw error;
  }
  return payload || {};
};

const authorizeUrl = ({ state, redirectUri }) => {
  const config = readConfig();
  if (!config.baseUrl) throw new Error('AWX_BASE_URL non configuré');
  const url = new URL(`${config.baseUrl}/o/authorize/`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', redirectUri || config.redirectUri);
  url.searchParams.set('scope', config.scopes);
  url.searchParams.set('state', state);
  return url.toString();
};

const exchangeCode = async ({ code, redirectUri }) => {
  const config = readConfig();
  return postForm(
    `${config.baseUrl}/o/token/`,
    {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri || config.redirectUri,
    },
    config.clientId,
    config.clientSecret,
  );
};

const refreshAccessToken = async (refreshToken) => {
  const config = readConfig();
  return postForm(
    `${config.baseUrl}/o/token/`,
    {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    },
    config.clientId,
    config.clientSecret,
  );
};

/**
 * Appel authentifié générique à l'API AWX.
 * @param {string} path
 * @param {string} accessToken
 * @param {{ method?: string, body?: string }} [options]
 */
const apiRequest = async (path, accessToken, { method = 'GET', body } = {}) => {
  const config = readConfig();
  const response = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body } : {}),
    signal: AbortSignal.timeout(timeoutMs()),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const detail = payload?.detail || payload?.error || text.slice(0, 200);
    const error = Object.assign(new Error(`Ascender a répondu ${response.status} sur ${path}${detail ? ` : ${detail}` : ''}`), { status: response.status, awx: payload });
    throw error;
  }
  return payload;
};

const apiGet = (path, accessToken) => apiRequest(path, accessToken);

/**
 * Sonde de disponibilité : /api/v2/ping/ répond sans jeton sur AWX comme sur
 * Ascender. Sert au test réel du connecteur Ascender.
 */
const ping = async () => {
  const config = readConfig();
  if (!config.baseUrl) throw new Error('AWX_BASE_URL non configuré');
  const started = Date.now();
  const response = await fetch(`${config.baseUrl}/api/v2/ping/`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs()),
  });
  const latencyMs = Date.now() - started;
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = Object.assign(new Error(`Ascender a répondu ${response.status} sur /api/v2/ping/`), { status: response.status });
    throw error;
  }
  return {
    latencyMs,
    version: String(payload?.version || ''),
    activeNode: String(payload?.active_node || ''),
  };
};

/** Statut AWX -> statut portail (null = à ignorer). */
const JOB_STATUS_MAP = {
  new: 'queued',
  pending: 'queued',
  waiting: 'queued',
  running: 'running',
  successful: 'success',
  failed: 'failed',
  error: 'failed',
  canceled: 'canceled',
};

const portalStatus = (awxStatus) => JOB_STATUS_MAP[String(awxStatus || '').toLowerCase()] || null;

/** Lance un job template AVEC le jeton de l'utilisateur (droits AWX respectés). */
const launchJobTemplate = async ({
  templateId, accessToken, extraVars = {}, limit = '',
}) => {
  const id = Number(templateId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Modèle de job Ascender invalide');

  const payload = await apiRequest(`/api/v2/job_templates/${id}/launch/`, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      extra_vars: extraVars,
      ...(limit ? { limit } : {}),
    }),
  });

  const jobId = Number(payload?.job ?? payload?.id);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    const error = Object.assign(new Error("Ascender n'a pas renvoyé d'identifiant de job"), { status: 502 });
    throw error;
  }
  return { jobId, status: String(payload?.status || 'pending') };
};

/** Lance un workflow template AVEC le jeton de l'utilisateur. */
const launchWorkflowTemplate = async ({ templateId, accessToken, extraVars = {} }) => {
  const id = Number(templateId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Modèle de workflow Ascender invalide');

  const payload = await apiRequest(`/api/v2/workflow_job_templates/${id}/launch/`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ extra_vars: extraVars }),
  });

  const workflowJobId = Number(payload?.workflow_job ?? payload?.id);
  if (!Number.isInteger(workflowJobId) || workflowJobId <= 0) {
    const error = Object.assign(new Error("Ascender n'a pas renvoyé d'identifiant de workflow"), { status: 502 });
    throw error;
  }
  return { workflowJobId, status: String(payload?.status || 'pending') };
};

/** État courant d'un job AWX. */
const fetchJob = async (jobId, accessToken) => {
  const payload = await apiRequest(`/api/v2/jobs/${Number(jobId)}/`, accessToken);
  return {
    jobId: Number(payload?.id) || Number(jobId),
    status: String(payload?.status || ''),
    started: payload?.started || null,
    finished: payload?.finished || null,
    elapsed: Number(payload?.elapsed) || 0,
    failed: Boolean(payload?.failed),
    limit: String(payload?.limit || ''),
    templateId: Number(payload?.summary_fields?.job_template?.id) || null,
    templateName: String(payload?.summary_fields?.job_template?.name || ''),
  };
};

/** État courant d'un workflow AWX. */
const fetchWorkflowJob = async (workflowJobId, accessToken) => {
  const payload = await apiRequest(`/api/v2/workflow_jobs/${Number(workflowJobId)}/`, accessToken);
  const started = payload?.started || null;
  const finished = payload?.finished || null;
  let elapsed = 0;
  if (started) {
    const end = finished ? new Date(finished).getTime() : Date.now();
    elapsed = Math.max(0, Math.round((end - new Date(started).getTime()) / 1000));
  }
  return {
    jobId: Number(payload?.id) || Number(workflowJobId),
    status: String(payload?.status || ''),
    started,
    finished,
    elapsed,
    failed: Boolean(payload?.failed),
    limit: '',
    templateId: Number(payload?.summary_fields?.workflow_job_template?.id) || null,
    templateName: String(payload?.summary_fields?.workflow_job_template?.name || ''),
  };
};

/**
 * Nœuds d'un workflow AWX, avec le statut réel de chaque étape.
 * AWX expose chaque nœud avec le job qu'il a engendré : c'est ce job qui
 * porte le statut (pending, running, successful, failed…).
 */
const fetchWorkflowNodes = async (workflowJobId, accessToken) => {
  const id = Number(workflowJobId);
  if (!Number.isInteger(id) || id <= 0) return [];
  const payload = await apiGet(
    `/api/v2/workflow_jobs/${id}/workflow_nodes/?page_size=100&order_by=id`,
    accessToken,
  );
  return (payload?.results || []).map((node) => {
    const job = node?.summary_fields?.job || null;
    const nodeJobId = Number(job?.id) || null;
    return {
      id: Number(node?.id) || 0,
      name: String(
        node?.summary_fields?.workflow_job_template_node?.identifier
        || job?.name
        || node?.identifier
        || `#${node?.id}`,
      ),
      type: String(job?.type || node?.unified_job_template?.type || 'job_template'),
      status: String(job?.status || 'pending'),
      jobId: nodeJobId,
      jobUrl: nodeJobId ? jobUrl(nodeJobId) : '',
      startedAt: job?.started || null,
      finishedAt: job?.finished || null,
      elapsed: Number(job?.elapsed) || 0,
      failed: Boolean(job?.failed),
    };
  });
};

/**
 * Annule un job ou un workflow en cours, avec le jeton de l'utilisateur.
 * AWX répond 405 quand le job ne peut plus être annulé (déjà terminé).
 */
const cancelJob = async ({ kind, jobId, accessToken }) => {
  const id = Number(jobId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Job Ascender invalide');
  const resource = kind === 'workflow' ? 'workflow_jobs' : 'jobs';
  await apiRequest(`/api/v2/${resource}/${id}/cancel/`, accessToken, { method: 'POST', body: '{}' });
};

/** Taille maximale de sortie renvoyée à l'interface (la fin du journal). */
const OUTPUT_MAX_BYTES = 256 * 1024;

/**
 * Sortie texte d'un job (ANSI retiré par AWX avec format=txt). Seule la fin
 * est conservée au-delà de OUTPUT_MAX_BYTES.
 */
const fetchJobOutput = async (jobId, accessToken) => {
  const id = Number(jobId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Job Ascender invalide');
  const config = readConfig();
  const path = `/api/v2/jobs/${id}/stdout/?format=txt`;
  const response = await fetch(`${config.baseUrl}${path}`, {
    headers: { Accept: 'text/plain', Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(timeoutMs()),
  });
  const text = await response.text();
  if (!response.ok) {
    const error = Object.assign(new Error(`Ascender a répondu ${response.status} sur ${path}`), { status: response.status });
    throw error;
  }
  const truncated = Buffer.byteLength(text) > OUTPUT_MAX_BYTES;
  return {
    text: truncated ? Buffer.from(text).subarray(-OUTPUT_MAX_BYTES).toString() : text,
    truncated,
  };
};

/** Lien direct vers l'écran du job dans l'interface AWX. */
const jobUrl = (jobId) => {
  const config = readConfig();
  const id = Number(jobId);
  if (!config.baseUrl || !Number.isInteger(id) || id <= 0) return '';
  return `${config.baseUrl}/#/jobs/playbook/${id}`;
};

/** Lien direct vers l'écran d'un workflow dans l'interface AWX. */
const workflowJobUrl = (workflowJobId) => {
  const config = readConfig();
  const id = Number(workflowJobId);
  if (!config.baseUrl || !Number.isInteger(id) || id <= 0) return '';
  return `${config.baseUrl}/#/jobs/workflow/${id}`;
};

/**
 * Modèles réellement accessibles à l'utilisateur (RBAC AWX).
 * AWX ne renvoie déjà que ce que le jeton peut voir : on retire en plus ceux
 * dont les capacités interdisent explicitement le lancement.
 */
const stripBaseUrl = (url) => {
  const config = readConfig();
  const text = String(url || '');
  if (!text) return '';
  return text.startsWith(config.baseUrl) ? text.slice(config.baseUrl.length) : text;
};

/**
 * Ids des modèles lançables, et le projet Ascender de chacun (un job template
 * appartient à un projet SCM ; un workflow n'en a pas).
 * @returns {Promise<{ ids: Set<number>, projects: Map<number, { id: number, name: string }> }>}
 */
const collectTemplateIds = async (accessToken, path) => {
  const ids = new Set();
  const projects = new Map();
  let next = path;
  for (let page = 0; next && page < 5; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const payload = await apiGet(next, accessToken);
    (payload?.results || []).forEach((tpl) => {
      const id = Number(tpl?.id);
      const caps = tpl?.summary_fields?.user_capabilities || {};
      const canStart = caps.start !== false && caps.execute !== false;
      if (!Number.isInteger(id) || id <= 0 || !canStart) return;
      ids.add(id);
      const project = tpl?.summary_fields?.project;
      const projectId = Number(project?.id ?? tpl?.project);
      if (Number.isInteger(projectId) && projectId > 0) {
        projects.set(id, { id: projectId, name: String(project?.name || `#${projectId}`) });
      }
    });
    next = payload?.next ? stripBaseUrl(payload.next) : '';
  }
  return { ids, projects };
};

/** Droits AWX de l'utilisateur et projet de chaque job template visible. */
const listAccessibleTemplates = async (accessToken) => {
  const [jobs, workflows] = await Promise.all([
    collectTemplateIds(accessToken, '/api/v2/job_templates/?page_size=200&order_by=id'),
    collectTemplateIds(accessToken, '/api/v2/workflow_job_templates/?page_size=200&order_by=id'),
  ]);
  return { templates: jobs.ids, workflows: workflows.ids, projectOfTemplate: jobs.projects };
};

/** Modèles accessibles avec leur libellé : utilisé par l'administration. */
const collectTemplateList = async (accessToken, path, kind) => {
  const out = [];
  let next = path;
  for (let page = 0; next && page < 3; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const payload = await apiGet(next, accessToken);
    (payload?.results || []).forEach((tpl) => {
      const id = Number(tpl?.id);
      if (!Number.isInteger(id) || id <= 0) return;
      const caps = tpl?.summary_fields?.user_capabilities || {};
      if (caps.start === false || caps.execute === false) return;
      out.push({
        id,
        kind,
        name: String(tpl?.name || `#${id}`),
        description: String(tpl?.description || ''),
        organization: String(tpl?.summary_fields?.organization?.name || ''),
      });
    });
    next = payload?.next ? stripBaseUrl(payload.next) : '';
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
};

const listTemplatesDetailed = async (accessToken) => {
  const [templates, workflows] = await Promise.all([
    collectTemplateList(accessToken, '/api/v2/job_templates/?page_size=200&order_by=name', 'job'),
    collectTemplateList(accessToken, '/api/v2/workflow_job_templates/?page_size=200&order_by=name', 'workflow'),
  ]);
  return { templates, workflows };
};

/** Délai maximum d'attente d'un job template (secondes, optionnel). */
const launchTimeoutSec = () => {
  const parsed = Number(process.env.AWX_LAUNCH_TIMEOUT_SEC);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const summarizeOrganizations = (me) => {
  const results = me?.summary_fields?.organizations?.results || [];
  return results
    .map((org) => ({ id: org.id, name: String(org.name || '').trim() }))
    .filter((org) => org.name);
};

const summarizeTeams = (me) => {
  const results = me?.summary_fields?.teams?.results || [];
  return results
    .map((team) => ({
      id: team.id,
      name: String(team.name || '').trim(),
      organization: String(
        team.summary_fields?.organization?.name
        || team.organization?.name
        || team.summary_fields?.organization_name
        || '',
      ).trim(),
    }))
    .filter((team) => team.name);
};

/** Liste paginée de l'utilisateur (organisations ou équipes), 200 max. */
const listForUser = async (userId, accessToken, resource) => {
  if (!userId) return [];
  try {
    const payload = await apiGet(`/api/v2/users/${Number(userId)}/${resource}/?page_size=200`, accessToken);
    return payload?.results || [];
  } catch {
    return [];
  }
};

const fetchIdentity = async (accessToken) => {
  // AWX et Ascender renvoient /api/v2/me/ sous forme de liste paginée.
  const payload = await apiGet('/api/v2/me/', accessToken);
  const me = Array.isArray(payload?.results) ? payload.results[0] || {} : payload || {};

  // Organisations et équipes : summary_fields quand ils existent, sinon les
  // sous-ressources de l'utilisateur.
  let organizations = summarizeOrganizations(me);
  let teams = summarizeTeams(me);
  if (!me?.summary_fields?.organizations) {
    const results = await listForUser(me?.id, accessToken, 'organizations');
    organizations = summarizeOrganizations({ summary_fields: { organizations: { results } } });
  }
  if (!me?.summary_fields?.teams) {
    const results = await listForUser(me?.id, accessToken, 'teams');
    teams = summarizeTeams({ summary_fields: { teams: { results } } });
  }
  return {
    awxUserId: Number(me?.id) || null,
    username: String(me?.username || '').trim(),
    email: String(me?.email || '').trim(),
    firstName: String(me?.first_name || '').trim(),
    lastName: String(me?.last_name || '').trim(),
    isSuperuser: Boolean(me?.is_superuser),
    isSystemAuditor: Boolean(me?.is_system_auditor),
    organizations,
    teams,
    lastLogin: me?.last_login || null,
  };
};

module.exports = {
  readConfig,
  authorizeUrl,
  exchangeCode,
  refreshAccessToken,
  fetchIdentity,
  adminUsernames,
  ping,
  launchJobTemplate,
  launchWorkflowTemplate,
  fetchJob,
  fetchWorkflowJob,
  fetchWorkflowNodes,
  cancelJob,
  fetchJobOutput,
  jobUrl,
  workflowJobUrl,
  listAccessibleTemplates,
  listTemplatesDetailed,
  portalStatus,
  launchTimeoutSec,
};