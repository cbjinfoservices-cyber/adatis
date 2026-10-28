-- ============================================================================
-- Migration 014 — les projets viennent d'Ascender
--
-- Les projets du catalogue (crm, cloud, soc2, hr, observability) étaient une
-- liste fixe de démonstration, sans lien avec Ascender. Le projet d'un service
-- est désormais celui de son job template dans Ascender (summary_fields.project),
-- lu avec le jeton de l'utilisateur : rien n'est plus stocké dans le portail.
-- ============================================================================

BEGIN;

ALTER TABLE services DROP COLUMN IF EXISTS project_id;  -- son index suit
DROP TABLE IF EXISTS projects;

COMMIT;
