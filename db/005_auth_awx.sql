-- ============================================================================
-- Migration 005 — authentification SSO AWX (OAuth2 / OIDC)
--
--   * rôles portail sur les utilisateurs (admin / approver / requester)
--   * sessions serveur (cookie httpOnly) avec les jetons AWX de l'utilisateur
--   * mappings « organisation / équipe AWX » -> rôle portail
--   * journal des connexions (affiché dans Administration > Authentification)
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Utilisateurs : rôle portail + identité AWX
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'requester';
ALTER TABLE users ADD COLUMN IF NOT EXISTS awx_user_id integer;
ALTER TABLE users ADD COLUMN IF NOT EXISTS awx_username text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider text NOT NULL DEFAULT 'local';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS awx_organizations text[] NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS awx_teams text[] NOT NULL DEFAULT '';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'approver', 'requester'));

CREATE UNIQUE INDEX IF NOT EXISTS users_awx_user_idx
  ON users (awx_user_id) WHERE awx_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);

-- ---------------------------------------------------------------------------
-- Sessions : la valeur du cookie est un jeton opaque haché en SHA-256.
-- Les jetons OAuth AWX restent côté serveur, jamais dans le navigateur.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_sessions (
  id                  text PRIMARY KEY,
  user_id             text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  awx_username        text NOT NULL DEFAULT '',
  access_token        text NOT NULL DEFAULT '',
  refresh_token       text NOT NULL DEFAULT '',
  access_expires_at   timestamptz,
  refresh_expires_at  timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  ip                  text NOT NULL DEFAULT '',
  user_agent          text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_idx ON auth_sessions (expires_at);

-- ---------------------------------------------------------------------------
-- Mappings de rôles : une ligne = (organisation AWX, équipe AWX) -> rôle.
-- Chaîne vide = joker (« toutes les organisations » / « toutes les équipes »).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS awx_role_mappings (
  id          bigserial PRIMARY KEY,
  awx_org     text NOT NULL DEFAULT '',
  awx_team    text NOT NULL DEFAULT '',
  role        text NOT NULL DEFAULT 'requester'
              CHECK (role IN ('admin', 'approver', 'requester')),
  note        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS awx_role_mappings_unique_idx
  ON awx_role_mappings (lower(awx_org), lower(awx_team));

-- ---------------------------------------------------------------------------
-- Journal des connexions (succès, refus, déconnexions)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_events (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  kind        text NOT NULL,
  username    text NOT NULL DEFAULT '',
  role        text NOT NULL DEFAULT '',
  email       text NOT NULL DEFAULT '',
  ip          text NOT NULL DEFAULT '',
  detail      text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS auth_events_at_idx ON auth_events (at DESC);

COMMIT;