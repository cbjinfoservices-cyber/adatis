-- ============================================================================
-- Migration 008 — fusion AWX / Ascender en un seul connecteur réel
--
-- Ascender est une distribution d'AWX : même API /api/v2, même OAuth2.
-- Le portail l'utilisait déjà (SSO, lancement des jobs) sous le nom « AWX »,
-- tandis que les adaptateurs « ascender » et « ansible » restaient simulés.
--
--   * un seul adaptateur : ascender (l'adaptateur ansible y est fusionné)
--   * un seul connecteur ascender, marqué managed : sa configuration vient
--     des variables AWX_* et ses tests, contrôles et catalogue sont réels
--   * les données de démonstration de ce connecteur sont supprimées
-- ============================================================================

BEGIN;

ALTER TABLE connectors ADD COLUMN IF NOT EXISTS managed boolean NOT NULL DEFAULT false;

UPDATE adapters
   SET name = 'Ascender',
       icon = 'ri-flashlight-line',
       description_fr = 'Contrôleur Ascender / AWX : job templates, workflows et inventaires',
       description_en = 'Ascender / AWX controller: job templates, workflows and inventories'
 WHERE kind = 'ascender';

INSERT INTO adapters (kind, name, icon, description_fr, description_en)
VALUES ('ascender', 'Ascender', 'ri-flashlight-line',
        'Contrôleur Ascender / AWX : job templates, workflows et inventaires',
        'Ascender / AWX controller: job templates, workflows and inventories')
ON CONFLICT (kind) DO NOTHING;

-- Connecteurs « ansible » rattachés à l'adaptateur ascender, puis un seul
-- connecteur ascender conservé (le plus ancien identifiant).
UPDATE connectors SET kind = 'ascender' WHERE kind = 'ansible';
DELETE FROM connectors
 WHERE kind = 'ascender'
   AND id <> (SELECT min(id) FROM connectors WHERE kind = 'ascender');
DELETE FROM adapters WHERE kind = 'ansible';

INSERT INTO connectors (id, kind, name, endpoint, endpoint_default, auth_mode, version,
                        notes, configured, health, latency_ms, uptime, last_sync, jobs_24h,
                        success_rate, scope, capabilities)
SELECT 'cn-ascender', 'ascender', 'Ascender', '—', '—', 'OAuth2', '', '', false,
       'pending', 0, 0, NULL, 0, 0, 'platform', '{}'
 WHERE NOT EXISTS (SELECT 1 FROM connectors WHERE kind = 'ascender');

CREATE UNIQUE INDEX IF NOT EXISTS connectors_single_ascender_idx
  ON connectors (kind) WHERE kind = 'ascender';

-- Remise à zéro des valeurs simulées : elles sont désormais mesurées.
DELETE FROM connector_tests   WHERE connector_id IN (SELECT id FROM connectors WHERE kind = 'ascender');
DELETE FROM connector_checks  WHERE connector_id IN (SELECT id FROM connectors WHERE kind = 'ascender');
DELETE FROM connector_catalog WHERE connector_id IN (SELECT id FROM connectors WHERE kind = 'ascender');
DELETE FROM connector_history WHERE connector_id IN (SELECT id FROM connectors WHERE kind = 'ascender');

UPDATE connectors
   SET managed = true,
       name = CASE WHEN name = 'Ascender Automation Controller' THEN 'Ascender' ELSE name END,
       endpoint = '—', endpoint_default = '—', auth_mode = 'OAuth2',
       configured = false, health = 'pending', latency_ms = 0, uptime = 0,
       last_sync = NULL, jobs_24h = 0, success_rate = 0, version = '',
       retest_required_at = NULL, scope = 'platform',
       capabilities = ARRAY[
         'GET /api/v2/ping/',
         'GET /api/v2/me/',
         'GET /api/v2/job_templates/',
         'GET /api/v2/workflow_job_templates/',
         'POST /api/v2/job_templates/{id}/launch/',
         'POST /api/v2/workflow_job_templates/{id}/launch/',
         'GET /api/v2/jobs/{id}/',
         'GET /api/v2/workflow_jobs/{id}/workflow_nodes/'
       ]
 WHERE kind = 'ascender';

COMMIT;
