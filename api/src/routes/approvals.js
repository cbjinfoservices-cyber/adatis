const express = require('express');
const { q, withTransaction } = require('../db');
const m = require('../mappers');
const approvalFlow = require('../approvalFlow');
const { authMode } = require('../auth');
const { scopeOf, scopeSql, canSee } = require('../access');

const router = express.Router();

const APPROVAL_SELECT = `
  SELECT a.*, s.name_fr, s.name_en, s.category_id,
         u.name AS user_name, u.initials,
         t.name AS tenant_name
  FROM approvals a
  LEFT JOIN services s ON s.id = a.service_id
  LEFT JOIN users u ON u.id = a.user_id
  LEFT JOIN tenants t ON t.id = a.tenant_id
`;

/**
 * Auteur de la décision : l'utilisateur de la session. Sans SSO (mode
 * développement), l'identifiant envoyé par le client est accepté.
 */
async function resolveActor(req) {
  const user = req.auth?.user;
  if (user) {
    return {
      id: user.id, name: user.name, roleFr: user.roleFr, roleEn: user.roleEn, enforced: true,
    };
  }
  if (authMode() !== 'disabled') return null;
  const actorId = String(req.body?.actorId || 'u-camille');
  const { rows } = await q('SELECT id, name, role_fr, role_en FROM users WHERE id = $1', [actorId]);
  const row = rows[0];
  return row
    ? { id: row.id, name: row.name, roleFr: row.role_fr, roleEn: row.role_en, enforced: false }
    : { id: null, name: 'Utilisateur local', roleFr: '', roleEn: '', enforced: false };
}

async function levelsFor(ids) {
  if (!ids.length) return new Map();
  const { rows } = await q(
    'SELECT * FROM approval_levels WHERE approval_id = ANY($1) ORDER BY approval_id, sort_order',
    [ids],
  );
  const map = new Map();
  rows.forEach((row) => {
    if (!map.has(row.approval_id)) map.set(row.approval_id, []);
    map.get(row.approval_id).push(m.approvalLevel(row));
  });
  return map;
}

router.get('/approvals', async (req, res, next) => {
  try {
    const { decision, mine, limit = 50 } = req.query;
    const where = [];
    const params = [];

    if (decision) { params.push(decision); where.push(`a.decision = $${params.length}`); }
    if (mine === 'true') where.push('a.my_turn = true');
    const scoped = scopeSql(scopeOf(req), 'a', params);
    if (scoped) where.push(scoped);

    params.push(Math.min(Number(limit) || 50, 200));
    const { rows } = await q(
      `${APPROVAL_SELECT}
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY a.my_turn DESC, a.submitted_at DESC
       LIMIT $${params.length}`,
      params,
    );

    const levels = await levelsFor(rows.map((r) => r.id));
    res.json(rows.map((row) => m.approval(row, levels.get(row.id) || [])));
  } catch (err) { next(err); }
});

router.get('/approvals/:id', async (req, res, next) => {
  try {
    const { rows } = await q(`${APPROVAL_SELECT} WHERE a.id = $1`, [req.params.id]);
    if (!rows.length || !canSee(scopeOf(req), rows[0])) return res.status(404).json({ error: 'approval_not_found' });
    const levels = await levelsFor([rows[0].id]);
    return res.json(m.approval(rows[0], levels.get(rows[0].id) || []));
  } catch (err) { return next(err); }
});

router.post('/approvals/:id/decision', async (req, res, next) => {
  try {
    const { decision, comment = '' } = req.body || {};
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'invalid_decision' });
    }

    const actor = await resolveActor(req);
    if (!actor) return res.status(401).json({ error: 'auth_required' });

    const outcome = await withTransaction((client) => approvalFlow.decide(client, {
      approvalId: req.params.id,
      decision,
      comment: String(comment).slice(0, 1000),
      actor,
    }));
    if (outcome.error) return res.status(outcome.status).json({ error: outcome.error });

    // Approbation finale : le job part avec le jeton du demandeur.
    const launch = outcome.granted ? await approvalFlow.launchAfterApproval(outcome.requestId) : null;

    const { rows } = await q(`${APPROVAL_SELECT} WHERE a.id = $1`, [req.params.id]);
    const levels = await levelsFor([req.params.id]);
    return res.json({
      ...outcome,
      launch,
      approval: m.approval(rows[0], levels.get(req.params.id) || []),
    });
  } catch (err) { return next(err); }
});

router.get('/audit', async (req, res, next) => {
  try {
    const { decision, level, q: search, limit = 100 } = req.query;
    const where = [];
    const params = [];

    if (decision) { params.push(decision); where.push(`e.decision = $${params.length}`); }
    if (level) { params.push(level); where.push(`e.level = $${params.length}`); }
    if (search) {
      params.push(`%${String(search).trim()}%`);
      const i = params.length;
      where.push(`(e.ref ILIKE $${i} OR u.name ILIKE $${i} OR s.name_fr ILIKE $${i}
                   OR s.name_en ILIKE $${i} OR e.comment_fr ILIKE $${i})`);
    }

    // L'audit suit le périmètre des demandes qu'il référence.
    const scoped = scopeSql(scopeOf(req), 'rq', params);
    if (scoped) where.push(`e.ref IN (SELECT rq.id FROM requests rq WHERE ${scoped})`);

    params.push(Math.min(Number(limit) || 100, 300));
    const { rows } = await q(
      `SELECT e.*, u.name AS actor_name, s.name_fr, s.name_en, t.name AS tenant_name
       FROM audit_events e
       LEFT JOIN users u ON u.id = e.actor_id
       LEFT JOIN services s ON s.id = e.service_id
       LEFT JOIN tenants t ON t.id = e.tenant_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY e.at DESC
       LIMIT $${params.length}`,
      params,
    );
    res.json(rows.map(m.auditEvent));
  } catch (err) { next(err); }
});

module.exports = router;