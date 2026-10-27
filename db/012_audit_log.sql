-- ============================================================================
-- Journal d'audit : toute écriture sur l'API (création, modification,
-- suppression, décision, connexion) avec son auteur, son adresse et son issue.
--
-- Ajout seul : UPDATE, DELETE et TRUNCATE sont refusés par trigger. Chaque
-- ligne porte l'empreinte SHA-256 de la précédente (prev_hash) et la sienne
-- (hash) : toute ligne modifiée ou retirée hors de l'API casse la chaîne,
-- ce que GET /api/system/audit/verify détecte.
-- Le corps des requêtes n'est jamais stocké (il peut contenir des secrets) :
-- seulement la liste des champs envoyés.
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  actor_id    text NOT NULL DEFAULT '',
  actor_name  text NOT NULL DEFAULT '',
  actor_role  text NOT NULL DEFAULT '',
  ip          text NOT NULL DEFAULT '',
  method      text NOT NULL DEFAULT '',
  path        text NOT NULL DEFAULT '',
  action      text NOT NULL,
  target      text NOT NULL DEFAULT '',
  status      integer NOT NULL DEFAULT 0,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash   text NOT NULL,
  hash        text NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_log_at_idx ON audit_log (at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log (actor_id);

CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log est en ajout seul';
END;
$$;

DROP TRIGGER IF EXISTS audit_log_no_change ON audit_log;
CREATE TRIGGER audit_log_no_change
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log;
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only();
