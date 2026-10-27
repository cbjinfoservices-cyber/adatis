-- ============================================================================
-- Migration 010 — moteur d'exécution par service, jobs scindés par connecteur
--
--   * services.connector_id : connecteur (moteur) qui exécute le service
--   * requests.connector_id / connector_kind : moteur retenu à la commande
--     (instantané : réaffecter le service ne réécrit pas l'historique)
--
-- Les services existants sont rattachés au connecteur Ascender : c'est le
-- comportement actuel (seul Ascender exécute les jobs).
-- ============================================================================

BEGIN;

ALTER TABLE services ADD COLUMN IF NOT EXISTS connector_id text
  REFERENCES connectors(id) ON DELETE SET NULL;

ALTER TABLE requests ADD COLUMN IF NOT EXISTS connector_id text
  REFERENCES connectors(id) ON DELETE SET NULL;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS connector_kind text NOT NULL DEFAULT '';

UPDATE services
   SET connector_id = (SELECT id FROM connectors WHERE kind = 'ascender' ORDER BY id LIMIT 1)
 WHERE connector_id IS NULL;

-- Demandes déjà exécutées : par Ascender.
UPDATE requests
   SET connector_kind = 'ascender',
       connector_id = (SELECT id FROM connectors WHERE kind = 'ascender' ORDER BY id LIMIT 1)
 WHERE awx_job_id IS NOT NULL AND connector_kind = '';

CREATE INDEX IF NOT EXISTS requests_connector_kind_idx
  ON requests (connector_kind)
  WHERE connector_kind <> '';

COMMIT;
