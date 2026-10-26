-- ============================================================================
-- ASP Automation Service Portal — schéma PostgreSQL
-- Migration 001 · idempotente (DROP + CREATE), exécutée une seule fois sur une
-- base vide par l'image postgres (docker-entrypoint-initdb.d) ou par le Job
-- de migration du déploiement.
-- ============================================================================

BEGIN;

SET client_min_messages = warning;

DROP TABLE IF EXISTS connector_checks CASCADE;
DROP TABLE IF EXISTS connector_tests CASCADE;
DROP TABLE IF EXISTS connector_history CASCADE;
DROP TABLE IF EXISTS connector_catalog CASCADE;
DROP TABLE IF EXISTS connectors CASCADE;
DROP TABLE IF EXISTS adapters CASCADE;
DROP TABLE IF EXISTS batch_tests CASCADE;
DROP TABLE IF EXISTS execution_details CASCADE;
DROP TABLE IF EXISTS approval_levels CASCADE;
DROP TABLE IF EXISTS approvals CASCADE;
DROP TABLE IF EXISTS audit_events CASCADE;
DROP TABLE IF EXISTS requests CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;
DROP TABLE IF EXISTS services CASCADE;
DROP TABLE IF EXISTS form_schemas CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS projects CASCADE;

DROP VIEW IF EXISTS v_dashboard_kpi CASCADE;DROP SEQUENCE IF EXISTS request_ref_seq CASCADE;

DROP VIEW IF EXISTS v_dashboard_status CASCADE;
DROP VIEW IF EXISTS v_dashboard_daily CASCADE;
DROP VIEW IF EXISTS v_dashboard_top_services CASCADE;
DROP VIEW IF EXISTS v_dashboard_top_users CASCADE;
DROP VIEW IF EXISTS v_dashboard_top_tenants CASCADE;

-- ---------------------------------------------------------------------------
-- Référentiels
-- ---------------------------------------------------------------------------
CREATE TABLE projects (
  id          text PRIMARY KEY,
  icon        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0
);

CREATE TABLE categories (
  id          text PRIMARY KEY,
  icon        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0
);

CREATE TABLE form_schemas (
  id        text PRIMARY KEY,
  title_fr  text NOT NULL,
  title_en  text NOT NULL,
  fields    jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE services (
  id                text PRIMARY KEY,
  project_id        text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category_id       text NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name_fr           text NOT NULL,
  name_en           text NOT NULL,
  description_fr    text NOT NULL,
  description_en    text NOT NULL,
  icon              text NOT NULL DEFAULT 'ri-tools-line',
  approval          text NOT NULL DEFAULT 'none'
                    CHECK (approval IN ('none','manager','technical','security','multi')),
  estimated_minutes integer NOT NULL DEFAULT 5 CHECK (estimated_minutes >= 0),
  popularity        integer NOT NULL DEFAULT 0 CHECK (popularity >= 0),
  form_id           text REFERENCES form_schemas(id) ON DELETE SET NULL,
  tags              text[] NOT NULL DEFAULT ''
);

CREATE INDEX services_project_idx  ON services (project_id);
CREATE INDEX services_category_idx ON services (category_id);
CREATE INDEX services_popularity_idx ON services (popularity DESC);
CREATE INDEX services_tags_idx ON services USING gin (tags);

-- ---------------------------------------------------------------------------
-- Tenants & utilisateurs
-- ---------------------------------------------------------------------------
CREATE TABLE tenants (
  id                 text PRIMARY KEY,
  name               text NOT NULL,
  plan               text NOT NULL DEFAULT 'Business',
  platform_name      text NOT NULL,
  tagline            text NOT NULL DEFAULT 'Service Portal',
  logo               text NOT NULL DEFAULT '',
  palette            text NOT NULL DEFAULT 'teal',
  domain             text NOT NULL DEFAULT '',
  domain_status      text NOT NULL DEFAULT 'not_set'
                     CHECK (domain_status IN ('verified','pending','not_set')),
  domain_checked_at  timestamptz,
  portal_url         text NOT NULL DEFAULT '',
  email_subject      text NOT NULL DEFAULT '',
  email_body         text NOT NULL DEFAULT '',
  users_count        integer NOT NULL DEFAULT 0,
  services_count     integer NOT NULL DEFAULT 0
);

CREATE TABLE users (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  initials   text NOT NULL,
  email      text NOT NULL UNIQUE,
  role_fr    text NOT NULL DEFAULT '',
  role_en    text NOT NULL DEFAULT '',
  tenant_id  text REFERENCES tenants(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Demandes (requests) & exécutions
-- ---------------------------------------------------------------------------
CREATE TABLE requests (
  id              text PRIMARY KEY,
  service_id      text NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  user_id         text REFERENCES users(id) ON DELETE SET NULL,
  tenant_id       text REFERENCES tenants(id) ON DELETE SET NULL,
  environment     text NOT NULL DEFAULT 'dev'
                  CHECK (environment IN ('dev','qa','staging','prod')),
  status          text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','running','success','failed','canceled')),
  progress        integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  created_at      timestamptz NOT NULL DEFAULT now(),
  duration_sec    integer NOT NULL DEFAULT 0 CHECK (duration_sec >= 0),
  approval        text NOT NULL DEFAULT 'none'
                  CHECK (approval IN ('none','manager','technical','security','multi')),
  approval_state  text NOT NULL DEFAULT 'not_required'
                  CHECK (approval_state IN ('not_required','pending','granted','rejected')),
  business_type   text NOT NULL DEFAULT 'custom',
  payload         jsonb NOT NULL DEFAULT ''::jsonb
);

CREATE INDEX requests_created_idx  ON requests (created_at DESC);-- Référence lisible des nouvelles demandes (REQ-<année>-<séquence>)
CREATE SEQUENCE request_ref_seq START WITH 49000;

CREATE INDEX requests_status_idx   ON requests (status);
CREATE INDEX requests_service_idx  ON requests (service_id);
CREATE INDEX requests_tenant_idx   ON requests (tenant_id);

CREATE TABLE execution_details (
  request_id  text PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
  timeline    jsonb NOT NULL DEFAULT '[]'::jsonb,
  logs        jsonb NOT NULL DEFAULT '[]'::jsonb,
  result      jsonb,
  error       jsonb
);

-- ---------------------------------------------------------------------------
-- Approbations
-- ---------------------------------------------------------------------------
CREATE TABLE approvals (
  id                  text PRIMARY KEY,
  request_ref         text NOT NULL,
  service_id          text REFERENCES services(id) ON DELETE SET NULL,
  user_id             text REFERENCES users(id) ON DELETE SET NULL,
  tenant_id           text REFERENCES tenants(id) ON DELETE SET NULL,
  environment         text NOT NULL DEFAULT 'dev',
  submitted_at        timestamptz NOT NULL DEFAULT now(),
  due_at              timestamptz,
  risk                text NOT NULL DEFAULT 'low' CHECK (risk IN ('low','medium','high')),
  my_turn             boolean NOT NULL DEFAULT false,
  decision            text NOT NULL DEFAULT 'pending'
                      CHECK (decision IN ('pending','approved','rejected')),
  decided_at          timestamptz,
  justification_fr    text NOT NULL DEFAULT '',
  justification_en    text NOT NULL DEFAULT '',
  impacts             jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX approvals_decision_idx ON approvals (decision);
CREATE INDEX approvals_my_turn_idx  ON approvals (my_turn) WHERE my_turn;

CREATE TABLE approval_levels (
  id           bigserial PRIMARY KEY,
  approval_id  text NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
  key          text NOT NULL CHECK (key IN ('manager','technical','security')),
  status       text NOT NULL DEFAULT 'waiting'
               CHECK (status IN ('waiting','current','approved','rejected','skipped')),
  approver     text,
  decided_at   timestamptz,
  comment_fr   text,
  comment_en   text,
  sort_order   integer NOT NULL DEFAULT 0
);

CREATE INDEX approval_levels_approval_idx ON approval_levels (approval_id, sort_order);

CREATE TABLE audit_events (
  id           text PRIMARY KEY,
  at           timestamptz NOT NULL DEFAULT now(),
  actor_id     text REFERENCES users(id) ON DELETE SET NULL,
  actor_role_fr text NOT NULL DEFAULT '',
  actor_role_en text NOT NULL DEFAULT '',
  level        text NOT NULL CHECK (level IN ('manager','technical','security')),
  decision     text NOT NULL CHECK (decision IN ('approved','rejected')),
  service_id   text REFERENCES services(id) ON DELETE SET NULL,
  ref          text NOT NULL,
  tenant_id    text REFERENCES tenants(id) ON DELETE SET NULL,
  comment_fr   text NOT NULL DEFAULT '',
  comment_en   text NOT NULL DEFAULT '',
  risk         text NOT NULL DEFAULT 'low' CHECK (risk IN ('low','medium','high'))
);

CREATE INDEX audit_at_idx ON audit_events (at DESC);

-- ---------------------------------------------------------------------------
-- Connecteurs d'automatisation
-- ---------------------------------------------------------------------------
CREATE TABLE adapters (
  kind           text PRIMARY KEY,
  name           text NOT NULL,
  icon           text NOT NULL,
  description_fr text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT ''
);

CREATE TABLE connectors (
  id                  text PRIMARY KEY,
  kind                text NOT NULL REFERENCES adapters(kind) ON DELETE RESTRICT,
  name                text NOT NULL,
  endpoint            text NOT NULL,
  endpoint_default    text NOT NULL,
  auth_mode           text NOT NULL DEFAULT '',
  version             text NOT NULL DEFAULT '',
  notes               text NOT NULL DEFAULT '',
  configured          boolean NOT NULL DEFAULT false,
  health              text NOT NULL DEFAULT 'pending'
                      CHECK (health IN ('healthy','degraded','down','pending')),
  latency_ms          integer NOT NULL DEFAULT 0,
  uptime              numeric(5,2) NOT NULL DEFAULT 0,
  last_sync           timestamptz,
  jobs_24h            integer NOT NULL DEFAULT 0,
  success_rate        numeric(5,2) NOT NULL DEFAULT 0,
  scope               text NOT NULL DEFAULT 'tenant' CHECK (scope IN ('tenant','platform')),
  retest_required_at  timestamptz,
  capabilities        text[] NOT NULL DEFAULT '',
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE connector_checks (
  id            bigserial PRIMARY KEY,
  connector_id  text NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  label_fr      text NOT NULL,
  label_en      text NOT NULL,
  ok            boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0
);

CREATE INDEX connector_checks_connector_idx ON connector_checks (connector_id, sort_order);

CREATE TABLE connector_tests (
  id            bigserial PRIMARY KEY,
  connector_id  text NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  at            timestamptz NOT NULL DEFAULT now(),
  ok            boolean NOT NULL,
  latency       integer NOT NULL DEFAULT 0,
  error         text
);

CREATE INDEX connector_tests_connector_idx ON connector_tests (connector_id, at DESC);

CREATE TABLE connector_history (
  id            bigserial PRIMARY KEY,
  connector_id  text NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  at            timestamptz NOT NULL DEFAULT now(),
  author        text NOT NULL DEFAULT '',
  field         text NOT NULL,
  before_value  text NOT NULL DEFAULT '',
  after_value   text NOT NULL DEFAULT ''
);

CREATE INDEX connector_history_connector_idx ON connector_history (connector_id, at DESC);

CREATE TABLE connector_catalog (
  id            text PRIMARY KEY,
  connector_id  text NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  name_fr       text NOT NULL,
  name_en       text NOT NULL,
  engine_ref    text NOT NULL,
  category_id   text REFERENCES categories(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'mapped'
                CHECK (status IN ('mapped','review','ignored')),
  last_sync     timestamptz
);

CREATE INDEX connector_catalog_connector_idx ON connector_catalog (connector_id);

CREATE TABLE batch_tests (
  id              bigserial PRIMARY KEY,
  at              timestamptz NOT NULL DEFAULT now(),
  total           integer NOT NULL DEFAULT 0,
  ok              integer NOT NULL DEFAULT 0,
  failed          integer NOT NULL DEFAULT 0,
  avg_latency_ms  integer NOT NULL DEFAULT 0,
  duration_ms     integer NOT NULL DEFAULT 0
);

CREATE INDEX batch_tests_at_idx ON batch_tests (at DESC);

-- ---------------------------------------------------------------------------
-- Vues d'agrégation (tableau de bord)
-- ---------------------------------------------------------------------------
CREATE VIEW v_dashboard_kpi AS
SELECT
  count(*)                                                       AS total_jobs,
  COALESCE(round(100.0 * count(*) FILTER (WHERE status = 'success') / NULLIF(count(*), 0), 1), 0) AS success_rate,
  count(*) FILTER (WHERE status = 'failed')                      AS failures,
  COALESCE(round(avg(duration_sec) FILTER (WHERE duration_sec > 0)), 0) AS avg_duration_sec
FROM requests;

CREATE VIEW v_dashboard_status AS
SELECT status, count(*) AS value
FROM requests
GROUP BY status;

CREATE VIEW v_dashboard_daily AS
SELECT date_trunc('day', created_at)::date AS day, count(*) AS value
FROM requests
WHERE created_at >= (SELECT max(created_at) FROM requests) - interval '14 days'
GROUP BY 1
ORDER BY 1;

CREATE VIEW v_dashboard_top_services AS
SELECT s.id, s.name_fr, s.name_en, count(r.id) AS value
FROM services s
JOIN requests r ON r.service_id = s.id
GROUP BY s.id, s.name_fr, s.name_en
ORDER BY value DESC
LIMIT 6;

CREATE VIEW v_dashboard_top_users AS
SELECT u.id, u.name, u.initials, u.role_fr, u.role_en, count(r.id) AS jobs,
       COALESCE(round(100.0 * count(*) FILTER (WHERE r.status = 'success') / NULLIF(count(r.id), 0), 1), 0) AS rate
FROM users u
JOIN requests r ON r.user_id = u.id
GROUP BY u.id, u.name, u.initials, u.role_fr, u.role_en
ORDER BY jobs DESC
LIMIT 5;

CREATE VIEW v_dashboard_top_tenants AS
SELECT t.id, t.name, t.plan, count(r.id) AS jobs,
       COALESCE(round(100.0 * count(*) FILTER (WHERE r.status = 'success') / NULLIF(count(r.id), 0), 1), 0) AS rate
FROM tenants t
JOIN requests r ON r.tenant_id = t.id
GROUP BY t.id, t.name, t.plan
ORDER BY jobs DESC
LIMIT 5;

COMMIT;