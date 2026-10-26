-- =============================================================================
-- 003 — Historique de disponibilité
-- Chaque sonde de santé (/api/system/health) et chaque contrôle du moniteur
-- interne dépose une ligne. L'API agrège ensuite ces points en tranches de
-- 15 minutes pour alimenter le mini-historique 24 h de la page Système.
-- =============================================================================

CREATE TABLE IF NOT EXISTS health_probes (
  id           bigserial PRIMARY KEY,
  checked_at   timestamptz NOT NULL DEFAULT now(),
  database_up  boolean     NOT NULL,
  latency_ms   integer
);

CREATE INDEX IF NOT EXISTS idx_health_probes_checked_at
  ON health_probes (checked_at DESC);