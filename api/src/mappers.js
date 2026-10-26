/**
 * Traduction des lignes PostgreSQL (snake_case, colonnes _fr/_en)
 * vers les objets consommés par l'interface (camelCase, {fr,en}).
 */

const t = (fr, en) => ({ fr: fr || '', en: en || en || fr || '' });
const num = (value) => (value === null || value === undefined ? 0 : Number(value));
const iso = (value) => (value instanceof Date ? value.toISOString() : value || null);

function project(row) {
  return { id: row.id, icon: row.icon };
}

function category(row) {
  return { id: row.id, icon: row.icon };
}

function service(row) {
  return {
    id: row.id,
    project: row.project_id,
    category: row.category_id,
    name: t(row.name_fr, row.name_en),
    description: t(row.description_fr, row.description_en),
    icon: row.icon,
    approval: row.approval,
    estimatedMinutes: num(row.estimated_minutes),
    popularity: num(row.popularity),
    formId: row.form_id,
    tags: row.tags || [],
  };
}

function formSchema(row) {
  return {
    id: row.id,
    title: t(row.title_fr, row.title_en),
    fields: row.fields || [],
  };
}

function request(row) {
  return {
    id: row.id,
    serviceId: row.service_id,
    service: t(row.name_fr, row.name_en),
    category: row.category_id,
    user: row.user_name || 'Utilisateur',
    initials: row.initials || '??',
    tenant: row.tenant_name || '',
    environment: row.environment,
    status: row.status,
    progress: num(row.progress),
    createdAt: iso(row.created_at),
    durationSec: num(row.duration_sec),
    approval: row.approval,
    approvalState: row.approval_state,
    businessType: row.business_type,
    awx: row.awx_job_id ? {
      jobId: Number(row.awx_job_id),
      jobUrl: row.awx_job_url || '',
      kind: row.awx_job_kind === 'workflow' ? 'workflow' : 'job',
      templateId: Number(row.awx_job_template_id) || null,
      templateName: row.awx_job_template_name || '',
      status: row.awx_status || '',
      startedAt: iso(row.awx_started_at),
      launchedBy: row.awx_launched_by || '',
    } : null,
  };
}

function executionDetail(row) {
  return {
    timeline: row.timeline || [],
    logs: row.logs || [],
    result: row.result || undefined,
    error: row.error || undefined,
  };
}

function approval(row, levels = []) {
  return {
    id: row.id,
    requestId: row.request_ref,
    serviceId: row.service_id,
    service: t(row.name_fr, row.name_en),
    category: row.category_id,
    user: row.user_name || '',
    initials: row.initials || '??',
    role: t(row.role_fr, row.role_en),
    tenant: row.tenant_name || '',
    environment: row.environment,
    submittedAt: iso(row.submitted_at),
    dueAt: iso(row.due_at),
    risk: row.risk,
    myTurn: row.my_turn,
    decision: row.decision,
    decidedAt: iso(row.decided_at),
    justification: t(row.justification_fr, row.justification_en),
    impacts: row.impacts || [],
    levels,
  };
}

function approvalLevel(row) {
  const level = {
    key: row.key,
    status: row.status,
    approver: row.approver || undefined,
    decidedAt: iso(row.decided_at) || undefined,
  };
  if (row.comment_fr || row.comment_en) level.comment = t(row.comment_fr, row.comment_en);
  return level;
}

function auditEvent(row) {
  return {
    id: row.id,
    at: iso(row.at),
    actor: row.actor_name || '',
    actorRole: t(row.actor_role_fr, row.actor_role_en),
    level: row.level,
    decision: row.decision,
    service: t(row.name_fr, row.name_en),
    ref: row.ref,
    tenant: row.tenant_name || '',
    comment: t(row.comment_fr, row.comment_en),
    risk: row.risk,
  };
}

function connector(row, related = {}) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    endpoint: row.endpoint,
    endpointDefault: row.endpoint_default,
    authMode: row.auth_mode,
    version: row.version,
    notes: row.notes,
    configured: row.configured,
    managed: Boolean(row.managed),
    health: row.health,
    latencyMs: num(row.latency_ms),
    uptime: num(row.uptime),
    lastSync: iso(row.last_sync),
    jobs24h: num(row.jobs_24h),
    successRate: num(row.success_rate),
    scope: row.scope,
    retestRequiredAt: iso(row.retest_required_at),
    capabilities: row.capabilities || [],
    tests: related.tests || [],
    checks: related.checks || [],
    history: related.history || [],
    catalog: related.catalog || [],
  };
}

function batchTest(row) {
  return {
    id: row.id,
    at: iso(row.at),
    total: num(row.total),
    ok: num(row.ok),
    failed: num(row.failed),
    avgLatencyMs: num(row.avg_latency_ms),
    durationMs: num(row.duration_ms),
  };
}

function tenant(row) {
  return {
    id: row.id,
    name: row.name,
    plan: row.plan,
    platformName: row.platform_name,
    tagline: row.tagline,
    logo: row.logo,
    palette: row.palette,
    domain: row.domain,
    domainStatus: row.domain_status,
    domainCheckedAt: iso(row.domain_checked_at),
    portalUrl: row.portal_url,
    emailSubject: row.email_subject,
    emailBody: row.email_body,
    users: num(row.users_count),
    services: num(row.services_count),
    awxOrganization: row.awx_organization || '',
  };
}

module.exports = {
  project,
  category,
  service,
  formSchema,
  request,
  executionDetail,
  approval,
  approvalLevel,
  auditEvent,
  connector,
  batchTest,
  tenant,
};