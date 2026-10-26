const crypto = require('crypto');
const { q } = require('./db');
const awxJobs = require('./awxJobs');
const { latestSessionForUser, sessionUser } = require('./auth');

/**
 * Circuit d'approbation des demandes.
 *
 * Une demande dont le service exige une approbation crée une approbation et
 * sa chaîne de niveaux ; le job Ascender n'est lancé qu'après la décision
 * finale, avec le jeton du demandeur (ses droits Ascender, pas ceux de
 * l'approbateur).
 */

const LEVELS = {
  manager: ['manager'],
  technical: ['technical'],
  security: ['security'],
  multi: ['manager', 'technical', 'security'],
};

/** États d'approbation qui autorisent le lancement du job. */
const LAUNCHABLE = ['not_required', 'granted'];

const riskFor = (environment) => {
  if (environment === 'prod') return 'high';
  if (environment === 'staging') return 'medium';
  return 'low';
};

const auditId = () => `AU-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

/** Crée l'approbation d'une demande (dans la transaction de création). */
const createApproval = async (client, {
  requestId, serviceId, approval, userId, tenantId, environment, payload,
}) => {
  const keys = LEVELS[approval];
  if (!keys) return null;

  const id = `AP-${requestId.replace(/^REQ-/, '')}`;
  const justification = String(payload?.justification || payload?.reason || '').slice(0, 2000);
  await client.query(
    `INSERT INTO approvals (id, request_ref, service_id, user_id, tenant_id, environment,
                            submitted_at, due_at, risk, my_turn, decision,
                            justification_fr, justification_en)
     VALUES ($1, $2, $3, $4, $5, $6, now(), now() + interval '24 hours', $7, true, 'pending', $8, $8)`,
    [id, requestId, serviceId, userId, tenantId, environment, riskFor(environment), justification],
  );
  for (const [index, key] of keys.entries()) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `INSERT INTO approval_levels (approval_id, key, status, sort_order)
       VALUES ($1, $2, $3, $4)`,
      [id, key, index === 0 ? 'current' : 'waiting', index + 1],
    );
  }
  return id;
};

/**
 * Enregistre une décision sur le niveau courant. `actor` vient de la session.
 * Renvoie { ok, final, granted } ou { error, status }.
 */
const decide = async (client, { approvalId, decision, comment, actor }) => {
  const approvalRes = await client.query(
    'SELECT * FROM approvals WHERE id = $1 FOR UPDATE',
    [approvalId],
  );
  if (!approvalRes.rows.length) return { error: 'approval_not_found', status: 404 };
  const approval = approvalRes.rows[0];

  if (approval.decision !== 'pending') return { error: 'approval_already_decided', status: 409 };
  if (actor.enforced && approval.user_id && approval.user_id === actor.id) {
    return { error: 'self_approval_forbidden', status: 403 };
  }

  const levelsRes = await client.query(
    'SELECT * FROM approval_levels WHERE approval_id = $1 ORDER BY sort_order',
    [approval.id],
  );
  const levels = levelsRes.rows;
  const current = levels.find((l) => l.status === 'current');
  if (!current) return { error: 'no_current_level', status: 409 };

  await client.query(
    `UPDATE approval_levels
        SET status = $1, approver = $2, decided_at = now(), comment_fr = $3, comment_en = $3
      WHERE id = $4`,
    [decision, actor.name, comment, current.id],
  );

  const nextLevel = decision === 'approved'
    ? levels.find((l) => l.sort_order > current.sort_order)
    : null;

  if (nextLevel) {
    await client.query("UPDATE approval_levels SET status = 'current' WHERE id = $1", [nextLevel.id]);
  } else {
    // Niveaux restants inutiles après un refus.
    await client.query(
      "UPDATE approval_levels SET status = 'skipped' WHERE approval_id = $1 AND status = 'waiting'",
      [approval.id],
    );
    await client.query(
      'UPDATE approvals SET decision = $1, decided_at = now(), my_turn = false WHERE id = $2',
      [decision, approval.id],
    );
    await client.query(
      `UPDATE requests
          SET approval_state = $2,
              status = CASE WHEN $2 = 'rejected' THEN 'canceled' ELSE status END
        WHERE id = $1`,
      [approval.request_ref, decision === 'approved' ? 'granted' : 'rejected'],
    );
  }

  await client.query(
    `INSERT INTO audit_events (id, at, actor_id, actor_role_fr, actor_role_en, level, decision,
                               service_id, ref, tenant_id, comment_fr, comment_en, risk)
     VALUES ($1, now(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11)`,
    [
      auditId(), actor.id, actor.roleFr, actor.roleEn, current.key, decision,
      approval.service_id, approval.request_ref, approval.tenant_id, comment, approval.risk,
    ],
  );

  return {
    ok: true,
    approvalId: approval.id,
    requestId: approval.request_ref,
    nextLevel: nextLevel ? nextLevel.key : null,
    final: !nextLevel,
    granted: !nextLevel && decision === 'approved',
  };
};

const LAUNCH_SELECT = `
  SELECT id, name_fr, name_en, approval,
         awx_job_template_id, awx_job_template_name,
         awx_workflow_job_template_id, awx_workflow_job_template_name
    FROM services WHERE id = $1`;

/**
 * Après l'approbation finale : lance le job avec la session encore valide du
 * demandeur. Sans session, le demandeur le lancera depuis sa demande.
 */
const launchAfterApproval = async (requestId) => {
  const { rows } = await q('SELECT * FROM requests WHERE id = $1', [requestId]);
  const request = rows[0];
  if (!request || request.awx_job_id) return { skipped: 'already_launched' };

  const session = await latestSessionForUser(request.user_id);
  if (!session) return { skipped: 'requester_session_missing' };

  const service = await q(LAUNCH_SELECT, [request.service_id]);
  if (!service.rows.length) return { skipped: 'service_not_found' };

  return awxJobs.launchForRequest({
    request: {
      id: request.id, serviceId: request.service_id, environment: request.environment, payload: request.payload,
    },
    service: service.rows[0],
    session,
    user: sessionUser(session),
  });
};

module.exports = {
  LAUNCHABLE,
  createApproval,
  decide,
  launchAfterApproval,
};
