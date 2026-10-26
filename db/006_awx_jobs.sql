-- ============================================================================
-- Migration 006 — commande de service exécutée par un job template AWX
--
--   * services.awx_job_template_id : modèle de job à lancer pour ce service
--   * requests.awx_*               : job réellement lancé, avec son URL AWX
--
-- Le lancement utilise le jeton OAuth de l'utilisateur connecté (jamais un
-- compte de service partagé). Si aucun modèle n'est défini sur le service,
-- la variable d'environnement AWX_JOB_TEMPLATE_ID sert de repli.
-- ============================================================================

BEGIN;

ALTER TABLE services ADD COLUMN IF NOT EXISTS awx_job_template_id integer;
ALTER TABLE services ADD COLUMN IF NOT EXISTS awx_job_template_name text NOT NULL DEFAULT '';

ALTER TABLE requests ADD COLUMN IF NOT EXISTS awx_job_id bigint;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS awx_job_url text NOT NULL DEFAULT '';
ALTER TABLE requests ADD COLUMN IF NOT EXISTS awx_job_template_id integer;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS awx_job_template_name text NOT NULL DEFAULT '';
ALTER TABLE requests ADD COLUMN IF NOT EXISTS awx_status text NOT NULL DEFAULT '';
ALTER TABLE requests ADD COLUMN IF NOT EXISTS awx_started_at timestamptz;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS awx_launched_by text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS requests_awx_job_idx ON requests (awx_job_id);

COMMIT;