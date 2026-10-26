-- =============================================================================
-- 004 — Réglages de supervision + journal des alertes
--
--   system_settings : petits réglages modifiables depuis la page Système
--                     (rétention des sondes, seuil d'alerte, destinataire).
--   health_alerts   : une ligne par fenêtre d'une heure dont la disponibilité
--                     est passée sous le seuil. La contrainte d'unicité sur
--                     window_start garantit un seul email par heure.
-- =============================================================================

CREATE TABLE IF NOT EXISTS system_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO system_settings (key, value) VALUES
  ('probe_retention_days', '7'::jsonb),
  ('alert_threshold_pct', '99'::jsonb),
  ('alert_email', 'null'::jsonb),
  ('alerts_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS health_alerts (
  id            bigserial PRIMARY KEY,
  window_start  timestamptz NOT NULL,
  window_end    timestamptz NOT NULL,
  uptime_pct    numeric(5,2) NOT NULL,
  threshold_pct numeric(5,2) NOT NULL,
  checks        integer NOT NULL,
  down_checks   integer NOT NULL,
  recipient     text,
  email_sent    boolean NOT NULL DEFAULT false,
  email_error   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_health_alerts_window
  ON health_alerts (window_start);

CREATE INDEX IF NOT EXISTS idx_health_alerts_created_at
  ON health_alerts (created_at DESC);