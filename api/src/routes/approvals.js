const express = require('express');
const { q, withTransaction } = require('../db');
const m = require('../mappers');

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
    if (!rows.length) return res.status(404).json({ error: 'approval_not_found' });
    const levels = await levelsFor([rows[0].id]);
    return res.json(m.approval(rows[0], levels.get(rows[0].id) || []));
  } catch (err) { return next(err); }
});

router.post('/approvals/:id/decision', async (req, res, next) => {
  try {
    const { decision, comment = '', actorId = 'u-camille' } = req.body || {};
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'invalid_decision' });
    }

    const outcome = await withTransaction(async (client) => {
      const approvalRes = await client.query(
        `SELECT a.*, s.name_fr, s.name_en FROM approvals a
         LEFT JOIN services s ON s.id = a.service_id
         WHERE a.id = $1 FOR UPDATE`,
        [req.params.id],
      );
      if (!approvalRes.rows.length) return { error: 'approval_not_found' };
      const approval = approvalRes.rows[0];

      const actorRes = await client.query('SELECT id, name, role_fr, role_en FROM users WHERE id = $1', [actorId]);
      const actor = actorRes.rows[0] || { id: null, name: 'Camille Laurent', role_fr: 'Manager', role_en: 'Manager' };

      const levelsRes = await client.query(
        'SELECT * FROM approval_levels WHERE approval_id = $1 ORDER BY sort_order',
        [approval.id],
      );
      const levels = levelsRes.rows;
      const current = levels.find((l) => l.status === 'current');

      if (!current) return { error: 'no_current_level' };

      await client.query(
        `UPDATE approval_levels
         SET status = $1, approver = $2, decided_at = now(), comment_fr = $3, comment_en = $3
         WHERE id = $4`,
        [decision, actor.name, comment, current.id],
      );

      const ended = decision === 'rejected';
      let nextLevel = null;
      if (!ended) {
        nextLevel = levels.find((l) => l.sort_order > current.sort_order);
      }

      if (nextLevel) {
        await client.query('UPDATE approval_levels SET status = \'current\' WHERE id = $1', [nextLevel.id]);
        await client.query('UPDATE approvals SET my_turn = true WHERE id = $1', [approval.id]);
      } else {
        await client.query(
          `UPDATE approvals SET decision = $1, decided_at = now(), my_turn = false WHERE id = $2`,
          [decision, approval.id],
        );
      }

      await client.query(
        `INSERT INTO audit_events (id, at, actor_id, actor_role_fr, actor_role_en, level, decision,
                                   service_id, ref, tenant_id, comment_fr, comment_en, risk)
         VALUES ($1, now(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11)`,
        [
          `AU-${Date.now()}`, actor.id, actor.role_fr, actor.role_en, current.key,
          decision, approval.service_id, approval.request_ref, approval.tenant_id, comment, approval.risk,
        ],
      );

      return { ok: true, approvalId: approval.id, nextLevel: nextLevel ? nextLevel.key : null };
    });

    if (outcome.error === 'approval_not_found') return res.status(404).json(outcome);
    if (outcome.error) return res.status(409).json(outcome);

    const { rows } = await q(`${APPROVAL_SELECT} WHERE a.id = $1`, [req.params.id]);
    const levels = await levelsFor([req.params.id]);
    return res.json({ ...outcome, approval: m.approval(rows[0], levels.get(req.params.id) || []) });
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