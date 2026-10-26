const express = require('express');
const dns = require('dns').promises;
const { q } = require('../db');
const m = require('../mappers');

const router = express.Router();

const lookupWithTimeout = (host) => new Promise((resolve) => {
  const timer = setTimeout(() => resolve(false), 3000);
  dns.lookup(host)
    .then(() => { clearTimeout(timer); resolve(true); })
    .catch(() => { clearTimeout(timer); resolve(false); });
});

router.get('/tenants', async (_req, res, next) => {
  try {
    const { rows } = await q('SELECT * FROM tenants ORDER BY name');
    res.json(rows.map(m.tenant));
  } catch (err) { next(err); }
});

router.get('/tenants/:id', async (req, res, next) => {
  try {
    const { rows } = await q('SELECT * FROM tenants WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'tenant_not_found' });
    return res.json(m.tenant(rows[0]));
  } catch (err) { return next(err); }
});

const FIELD_MAP = {
  platformName: 'platform_name',
  tagline: 'tagline',
  logo: 'logo',
  palette: 'palette',
  domain: 'domain',
  portalUrl: 'portal_url',
  emailSubject: 'email_subject',
  emailBody: 'email_body',
  usersCount: 'users_count',
  servicesCount: 'services_count',
  awxOrganization: 'awx_organization',
};

router.patch('/tenants/:id', async (req, res, next) => {
  try {
    const current = await q('SELECT * FROM tenants WHERE id = $1', [req.params.id]);
    if (!current.rows.length) return res.status(404).json({ error: 'tenant_not_found' });

    const sets = [];
    const params = [];
    const body = req.body || {};

    Object.entries(FIELD_MAP).forEach(([key, column]) => {
      if (body[key] === undefined) return;
      let value = body[key];
      if (key === 'domain') value = String(value).trim().toLowerCase();
      if (key === 'portalUrl') value = String(value).trim();
      if (key === 'awxOrganization') value = String(value || '').trim().slice(0, 120);
      if (key === 'usersCount' || key === 'servicesCount') value = Number(value) || 0;
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    });

    if (!sets.length) return res.status(400).json({ error: 'nothing_to_update' });

    // Un nouveau domaine repart systématiquement en attente de vérification DNS.
    if (body.domain !== undefined && String(body.domain).trim().toLowerCase() !== current.rows[0].domain) {
      sets.push("domain_status = 'pending'");
      sets.push('domain_checked_at = NULL');
    }

    params.push(req.params.id);
    const { rows } = await q(
      `UPDATE tenants SET ${sets.join(', ')}
       WHERE id = $${params.length} RETURNING *`,
      params,
    );
    if (!rows.length) return res.status(404).json({ error: 'tenant_not_found' });
    return res.json(m.tenant(rows[0]));
  } catch (err) {
    // Une organisation Ascender ne peut être reliée qu'à un seul tenant.
    if (err.code === '23505') return res.status(409).json({ error: 'organization_taken' });
    return next(err);
  }
});

router.post('/tenants/:id/verify-domain', async (req, res, next) => {
  try {
    const current = await q('SELECT * FROM tenants WHERE id = $1', [req.params.id]);
    if (!current.rows.length) return res.status(404).json({ error: 'tenant_not_found' });

    const domain = (current.rows[0].domain || '').trim().toLowerCase();
    if (!domain) return res.status(400).json({ error: 'domain_missing' });

    const resolved = await lookupWithTimeout(domain);
    const { rows } = await q(
      `UPDATE tenants
       SET domain_status = $1, domain_checked_at = now()
       WHERE id = $2 RETURNING *`,
      [resolved ? 'verified' : 'pending', req.params.id],
    );

    return res.json({ ...m.tenant(rows[0]), dnsResolved: resolved });
  } catch (err) { return next(err); }
});

module.exports = router;