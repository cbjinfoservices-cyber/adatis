-- ============================================================================
-- Migration 015 — rôle chef de projet et visibilité des modèles par projet
-- ============================================================================

BEGIN;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'approver', 'requester', 'project_manager'));

ALTER TABLE awx_role_mappings DROP CONSTRAINT IF EXISTS awx_role_mappings_role_check;
ALTER TABLE awx_role_mappings ADD CONSTRAINT awx_role_mappings_role_check
  CHECK (role IN ('admin', 'approver', 'requester', 'project_manager'));

CREATE TABLE IF NOT EXISTS awx_template_visibility (
  template_kind text NOT NULL CHECK (template_kind = 'job'),
  template_id integer NOT NULL CHECK (template_id > 0),
  project_id integer NOT NULL CHECK (project_id > 0),
  project_name text NOT NULL DEFAULT '',
  template_name text NOT NULL DEFAULT '',
  allowed_roles text[] NOT NULL DEFAULT '{}'
    CHECK (allowed_roles <@ ARRAY['approver', 'requester', 'project_manager']::text[]),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_kind, template_id)
);

COMMIT;
