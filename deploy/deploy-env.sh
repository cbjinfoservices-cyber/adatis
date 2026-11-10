#!/usr/bin/env bash
# =============================================================================
# ASP Automation Service Portal — déploiement par environnement (dev, staging, prod)
#
#   ./deploy/deploy-env.sh --env dev     --target compose
#   ./deploy/deploy-env.sh --env staging --target k8s [--skip-build] [--reset-db]
#   ./deploy/deploy-env.sh --env prod    --target k8s --dry-run
#
#   --env          dev | staging | prod   (profil : deploy/environments/<env>.env)
#   --target       k8s (deploy/deploy.sh) | compose (deploy/compose)
#   --skip-build   réutilise les images déjà publiées
#   --reset-db     réinitialise la base (k8s ; interdit en prod)
#   --no-ingress   cluster sans contrôleur Ingress (k8s)
#   --dry-run      valide le profil et affiche le résultat sans rien déployer
#
# Règles : prod n'est pas déployable avec Compose ; staging et prod exigent
# HTTPS, le SSO Ascender et NODE_ENV=production. Chaque environnement a son
# propre cluster (KUBE_CONTEXT) car les manifestes utilisent le namespace asp-portal.
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_NAME=""
TARGET=""
SKIP_BUILD=false
RESET_DB=false
NO_INGRESS=false
DRY_RUN=false

fail() { printf '✖ %s\n' "$*" >&2; exit 1; }
ok()   { printf '✔ %s\n' "$*"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --env)        ENV_NAME="${2:-}"; shift ;;
    --target)     TARGET="${2:-}"; shift ;;
    --skip-build) SKIP_BUILD=true ;;
    --reset-db)   RESET_DB=true ;;
    --no-ingress) NO_INGRESS=true ;;
    --dry-run)    DRY_RUN=true ;;
    -h|--help)    sed -n '2,/^# =====/p' "$0"; exit 0 ;;
    *)            fail "Option inconnue : $1" ;;
  esac
  shift
done

case "${ENV_NAME}" in dev|staging|prod) ;; *) fail "--env doit valoir dev, staging ou prod" ;; esac
case "${TARGET}" in k8s|compose) ;; *) fail "--target doit valoir k8s ou compose" ;; esac

PROFILE="${ROOT_DIR}/deploy/environments/${ENV_NAME}.env"
[ -f "${PROFILE}" ] || fail "Profil introuvable : ${PROFILE} (copier ${ENV_NAME}.env.example)"

# Lecture du profil sans l'exécuter : seules les lignes CLE=valeur sont acceptées.
while IFS= read -r line || [ -n "${line}" ]; do
  line="${line%$'\r'}"
  case "${line}" in
    ''|'#'*) continue ;;
  esac
  [[ "${line}" =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]] || fail "Ligne invalide dans ${PROFILE} : ${line}"
  export "${BASH_REMATCH[1]}=${BASH_REMATCH[2]}"
done < "${PROFILE}"

[ "${APP_ENV:-}" = "${ENV_NAME}" ] || fail "APP_ENV doit valoir '${ENV_NAME}' dans ${PROFILE}"

if [ "${ENV_NAME}" != dev ]; then
  [ "${NODE_ENV:-}" = production ] || fail "${ENV_NAME} : NODE_ENV doit valoir production"
  [ "${AUTH_MODE:-}" = awx ]       || fail "${ENV_NAME} : AUTH_MODE doit valoir awx (SSO Ascender)"
  [ "${COOKIE_SECURE:-}" = true ]  || fail "${ENV_NAME} : COOKIE_SECURE doit valoir true"
  case "${PORTAL_URL:-}" in https://*) ;; *) fail "${ENV_NAME} : PORTAL_URL doit être en https://" ;; esac
  case "${AWX_BASE_URL:-}" in https://*) ;; *) fail "${ENV_NAME} : AWX_BASE_URL doit être en https://" ;; esac
fi

if [ "${TARGET}" = k8s ]; then
  [ -n "${KUBE_CONTEXT:-}" ] || fail "KUBE_CONTEXT est obligatoire pour --target k8s"
  [ -z "${NAMESPACE:-}" ] || [ "${NAMESPACE}" = asp-portal ] \
    || fail "NAMESPACE doit valoir asp-portal (manifestes fixes) : un cluster par environnement"
  if [ "${ENV_NAME}" = prod ]; then
    case "${API_EGRESS_CIDR:-}" in
      ""|0.0.0.0/0|::/0) fail "prod : API_EGRESS_CIDR doit limiter l'egress aux réseaux Ascender, SMTP et connecteurs" ;;
    esac
  fi
  if [ "${RESET_DB}" = true ] && [ "${ENV_NAME}" = prod ]; then
    fail "--reset-db est interdit en prod"
  fi

  if [ "${DRY_RUN}" = false ]; then
    command -v kubectl >/dev/null || fail "kubectl introuvable"
    CURRENT_CONTEXT="$(kubectl config current-context)"
    [ "${CURRENT_CONTEXT}" = "${KUBE_CONTEXT}" ] \
      || fail "Contexte kubectl actuel '${CURRENT_CONTEXT}' ≠ KUBE_CONTEXT '${KUBE_CONTEXT}' (kubectl config use-context ${KUBE_CONTEXT})"
  else
    ok "Profil ${ENV_NAME} valide (k8s, contexte attendu : ${KUBE_CONTEXT})"
    exit 0
  fi

  DEPLOY_ARGS=()
  if [ "${SKIP_BUILD}" = true ]; then DEPLOY_ARGS+=(--skip-build); fi
  if [ "${RESET_DB}" = true ]; then DEPLOY_ARGS+=(--reset-db); fi
  if [ "${NO_INGRESS}" = true ]; then DEPLOY_ARGS+=(--no-ingress); fi

  ok "Déploiement ${ENV_NAME} sur le contexte ${KUBE_CONTEXT}"
  bash "${ROOT_DIR}/deploy/deploy.sh" ${DEPLOY_ARGS[@]+"${DEPLOY_ARGS[@]}"}
else
  [ "${ENV_NAME}" != prod ] || fail "prod ne se déploie pas avec Docker Compose (pas de TLS PostgreSQL) : utiliser --target k8s"
  [ "${RESET_DB}" = false ]   || fail "--reset-db n'est pas disponible avec compose"
  [ "${NO_INGRESS}" = false ] || fail "--no-ingress n'est pas disponible avec compose"
  [ -n "${DB_PASSWORD:-}" ]   || fail "DB_PASSWORD est obligatoire avec compose"
  if [ "${ENV_NAME}" != dev ]; then
    [ -n "${TOKEN_ENCRYPTION_KEY:-}" ] || fail "TOKEN_ENCRYPTION_KEY est obligatoire pour ${ENV_NAME}"
  fi

  COMPOSE=(docker compose -p "asp-portal-${ENV_NAME}" -f "${ROOT_DIR}/deploy/compose/docker-compose.yml" --env-file "${PROFILE}")

  if [ "${DRY_RUN}" = true ]; then
    "${COMPOSE[@]}" config --quiet
    ok "Profil ${ENV_NAME} valide (compose)"
    exit 0
  fi

  UP_ARGS=(up -d)
  if [ "${SKIP_BUILD}" = false ]; then UP_ARGS+=(--build); fi

  ok "Déploiement ${ENV_NAME} avec Docker Compose (projet asp-portal-${ENV_NAME})"
  "${COMPOSE[@]}" "${UP_ARGS[@]}"
fi
