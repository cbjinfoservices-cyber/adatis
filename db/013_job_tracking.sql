-- ============================================================================
-- Migration 013 — suivi réel des jobs Ascender
--
--   * requests.awx_launch_error : motif d'un lancement refusé ou en erreur
--     (la demande passe alors en « failed », visible dans le suivi)
--   * requests.awx_launcher_id  : utilisateur dont la session lance et
--     synchronise le job (synchronisation de fond avec SES droits)
--   * requests.awx_finished_at  : fin réelle du job
--   * requests.awx_synced_at    : dernière lecture de l'état dans Ascender
--   * requests.awx_notified_at  : notification de fin envoyée (une seule fois,
--     même avec plusieurs réplicas de l'API)
--   * job_attempts              : historique des lancements d'une demande
--     (relance après échec ou annulation)
-- ============================================================================

BEGIN;

ALTER TABLE requests ADD COLUMN IF NOT EXISTS awx_launch_error text NOT NULL DEFAULT '';
ALTER TABLE requests ADD COLUMN IF NOT EXISTS awx_launcher_id text;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS awx_finished_at timestamptz;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS awx_synced_at timestamptz;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS awx_notified_at timestamptz;

CREATE TABLE IF NOT EXISTS job_attempts (
  id            bigserial PRIMARY KEY,
  request_id    text NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  attempt       integer NOT NULL,
  awx_job_id    bigint,
  kind          text NOT NULL DEFAULT 'job',
  template_id   integer,
  template_name text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT '',
  error         text NOT NULL DEFAULT '',
  launched_by   text NOT NULL DEFAULT '',
  launched_at   timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  elapsed_sec   integer NOT NULL DEFAULT 0,
  UNIQUE (request_id, attempt)
);

CREATE INDEX IF NOT EXISTS job_attempts_job_idx ON job_attempts (awx_job_id);

-- Jobs déjà lancés : une première tentative reprise de la demande.
INSERT INTO job_attempts (request_id, attempt, awx_job_id, kind, template_id, template_name,
                          status, launched_by, launched_at)
SELECT r.id, 1, r.awx_job_id, CASE WHEN r.awx_job_kind = 'workflow' THEN 'workflow' ELSE 'job' END,
       r.awx_job_template_id, r.awx_job_template_name, r.awx_status, r.awx_launched_by,
       COALESCE(r.awx_started_at, r.created_at)
  FROM requests r
 WHERE r.awx_job_id IS NOT NULL
ON CONFLICT (request_id, attempt) DO NOTHING;

-- Lanceur des jobs existants : le demandeur.
UPDATE requests SET awx_launcher_id = user_id
 WHERE awx_job_id IS NOT NULL AND awx_launcher_id IS NULL;

-- Ancien marquage d'échec (motif rangé dans awx_status) : demande en échec.
UPDATE requests
   SET awx_launch_error = awx_status, awx_status = 'launch_failed', status = 'failed'
 WHERE awx_job_id IS NULL
   AND (awx_status IN ('no_awx_token', 'rbac_forbidden') OR awx_status LIKE 'launch_error%');

-- Sélection des jobs à synchroniser par la tâche de fond.
CREATE INDEX IF NOT EXISTS requests_awx_sync_idx
  ON requests (awx_synced_at NULLS FIRST)
  WHERE awx_job_id IS NOT NULL AND status IN ('queued', 'running');

COMMIT;
