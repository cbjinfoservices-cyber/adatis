#!/bin/sh
# =============================================================================
# Migration SQL idempotente — exécutée par le Job Kubernetes asp-db-migrate
# avant chaque démarrage de l'API.
#
#   * première exécution sur une base vide  -> 001_schema.sql puis 002_seed.sql
#   * base déjà initialisée hors de ce mécanisme -> baseline (marque 001/002
#     comme appliquées) puis exécution des fichiers suivants uniquement
#   * toute migration déjà enregistrée dans schema_migrations est ignorée
#
# Aucun fichier n'est rejoué deux fois : les scripts destructifs (DROP TABLE)
# ne peuvent donc pas effacer des données existantes.
# =============================================================================
set -eu

echo "[migrate] cible ${PGUSER}@${PGHOST}:${PGPORT}/${PGDATABASE}"

psql -v ON_ERROR_STOP=1 -q -c \
  "CREATE TABLE IF NOT EXISTS schema_migrations (
     version    text PRIMARY KEY,
     applied_at timestamptz NOT NULL DEFAULT now()
   )"

echo "[migrate] attente de PostgreSQL"
attempt=0
until psql -tAc 'SELECT 1' >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "${attempt}" -ge 40 ]; then
    echo "[migrate] PostgreSQL ne répond pas" >&2
    exit 1
  fi
  sleep 2
done

if [ -n "$(psql -tAc "SELECT to_regclass('public.services')")" ]; then
  echo "[migrate] schéma existant détecté : baseline des scripts initiaux"
  for version in 001_schema.sql 002_seed.sql; do
    psql -v ON_ERROR_STOP=1 -q -c \
      "INSERT INTO schema_migrations (version) VALUES ('${version}') ON CONFLICT DO NOTHING"
  done
fi

for file in /sql/*.sql; do
  [ -f "${file}" ] || continue
  version="$(basename "${file}")"
  applied="$(psql -tAc "SELECT 1 FROM schema_migrations WHERE version = '${version}'" || true)"
  if [ "${applied}" = "1" ]; then
    echo "[migrate] ${version} : déjà appliquée"
    continue
  fi
  echo "[migrate] ${version} : application"
  psql -v ON_ERROR_STOP=1 -f "${file}"
  psql -v ON_ERROR_STOP=1 -q -c \
    "INSERT INTO schema_migrations (version) VALUES ('${version}') ON CONFLICT DO NOTHING"
done

echo "[migrate] schéma à jour"