-- ============================================================================
-- Migration 007 — workflows AWX et suivi agrégé des jobs
--
--   * services.awx_workflow_job_template_id : modèle de workflow à lancer
--   * requests.awx_job_kind                 : 'job' ou 'workflow'
--
-- Un service peut pointer vers un job template simple ou vers un workflow
-- template. Le portail lance toujours avec le jeton OAuth de l'utilisateur,
-- donc strictement avec ses droits AWX (RBAC).
-- ============================================================================

BEGIN;

ALTER TABLE services ADD COLUMN IF NOT EXISTS awx_workflow_job_template_id integer;
ALTER TABLE services ADD COLUMN IF NOT EXISTS awx_workflow_job_template_name text NOT NULL DEFAULT '';

ALTER TABLE requests ADD COLUMN IF NOT EXISTS awx_job_kind text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS requests_awx_active_idx
  ON requests (awx_status)
  WHERE awx_job_id IS NOT NULL;

COMMIT;