-- ============================================================================
-- Migration 009 — tenant déduit de l'organisation Ascender
--
-- Chaque tenant peut être relié à une organisation Ascender (AWX). À chaque
-- connexion SSO, l'utilisateur reçoit le tenant relié à l'une de ses
-- organisations : ses demandes y sont rattachées et un approbateur ne voit
-- que les demandes de son tenant.
-- ============================================================================

BEGIN;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS awx_organization text NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS tenants_awx_organization_idx
  ON tenants (lower(awx_organization))
  WHERE awx_organization <> '';

COMMIT;
