const express = require('express');
const { q } = require('../db');

const router = express.Router();

/** Indicateurs du tableau de bord, calculés par les vues v_dashboard_* (db/). */
router.get('/dashboard', async (_req, res, next) => {
  try {
    const [kpi, statuses, daily, topServices, topUsers, topTenants] = await Promise.all([
      q('SELECT * FROM v_dashboard_kpi'),
      q('SELECT status AS key, value FROM v_dashboard_status'),
      q('SELECT day, value FROM v_dashboard_daily ORDER BY day'),
      q('SELECT * FROM v_dashboard_top_services'),
      q('SELECT * FROM v_dashboard_top_users'),
      q('SELECT * FROM v_dashboard_top_tenants'),
    ]);

    const k = kpi.rows[0] || {};
    res.json({
      totalJobs: Number(k.total_jobs || 0),
      successRate: Number(k.success_rate || 0),
      failures: Number(k.failures || 0),
      avgDurationSec: Number(k.avg_duration_sec || 0),
      trendTotal: daily.rows.map((r) => Number(r.value)),
      statusDistribution: statuses.rows.map((r) => ({ key: r.key, value: Number(r.value) })),
      topServices: topServices.rows.map((r) => ({
        name: { fr: r.name_fr, en: r.name_en },
        value: Number(r.value),
      })),
      topUsers: topUsers.rows.map((r) => ({
        name: r.name,
        initials: r.initials,
        role: r.role_fr,
        roleI18n: { fr: r.role_fr, en: r.role_en },
        jobs: Number(r.jobs),
        rate: Number(r.rate),
      })),
      topTenants: topTenants.rows.map((r) => ({
        name: r.name,
        plan: r.plan,
        jobs: Number(r.jobs),
        rate: Number(r.rate),
      })),
    });
  } catch (err) { next(err); }
});

module.exports = router;
