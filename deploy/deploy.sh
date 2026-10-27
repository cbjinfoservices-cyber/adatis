#!/usr/bin/env bash
# =============================================================================
# ASP Automation Service Portal — déploiement Kubernetes
#
#   ./deploy/deploy.sh                       # build + push/load + apply complet
#   ./deploy/deploy.sh --skip-build          # réutilise les images déjà publiées
#   ./deploy/deploy.sh --reset-db            # rejoue schéma + données de départ
#   ./deploy/deploy.sh --no-ingress          # cluster sans contrôleur Ingress
#
# Variables d'environnement reconnues :
#   REGISTRY            préfixe d'images (ex. registry.example.com/asp) — vide = images locales
#   TAG                 tag des images (défaut : date + hash court)
#   NAMESPACE           namespace (défaut : asp-portal)
#   DOMAIN              hôte public (ex. portal.acme.fr) — active l'Ingress
#   BASE_PATH           chemin de base du SPA (défaut : /)
#   API_URL             URL de l'API vue par le navigateur (défaut : /api)
#   ALLOWED_ORIGINS     origines tierces autorisées (défaut : vide = même origine via l'Ingress)
#   DB_NAME / DB_USER   identifiants de la base (défaut : asp_portal / asp)
#   HTTPS (obligatoire dès que DOMAIN est fourni), une des sources suivantes :
#     LETSENCRYPT_EMAIL   certificat Let's Encrypt automatique via cert-manager
#                         (LETSENCRYPT_STAGING=true pour l'environnement de test)
#     CERT_MANAGER_ISSUER nom d'un ClusterIssuer cert-manager existant
#     TLS_CERT_FILE / TLS_KEY_FILE  certificat et clé PEM fournis
#     ou un secret TLS asp-portal-tls déjà présent dans le namespace
#   ASCENDER_CA_FILE    certificat PEM de l'autorité interne qui signe Ascender
#   FORCE_DB_PASSWORD   impose un mot de passe (sinon réutilisé/créé automatiquement)
#   PORTAL_URL          URL publique en https:// (défaut : https://${DOMAIN}) — obligatoire
#
#   SSO Ascender (obligatoire : l'API refuse de démarrer sans) :
#   AWX_BASE_URL        URL de base d'Ascender, en https:// (ex. https://awx.acme.fr)
#   AWX_CLIENT_ID       application OAuth2 créée dans Ascender
#   AWX_CLIENT_SECRET   secret de l'application (secret asp-auth ; réutilisé s'il existe)
#   AWX_SCOPES          scopes demandés (défaut : read write)
#   AWX_ADMIN_USERS     identifiants Ascender promus admin (séparés par des virgules)
#   AWX_REDIRECT_URI    défaut : ${PORTAL_URL}/api/auth/callback
#
#   Sessions et chiffrement :
#   SESSION_TTL_HOURS   durée maximale d'une session (défaut : 12)
#   SESSION_IDLE_MINUTES expiration après inactivité (défaut : 30)
#   TOKEN_ENCRYPTION_KEY clé AES-256 des jetons en base (32 octets base64 ; sinon conservée ou générée)
#   TOKEN_ENCRYPTION_KEYS_PREVIOUS anciennes clés (rotation) : les données sont
#                       re-chiffrées automatiquement après le déploiement
#
#   Réseau :
#   INGRESS_NAMESPACE   namespace de Traefik, contrôleur Ingress requis (défaut : détecté, sinon kube-system)
#   API_EGRESS_CIDR     réseau joignable par l'API : Ascender, SMTP, connecteurs (défaut : 0.0.0.0/0)
#   CONNECTOR_ALLOWED_HOSTS hôtes que le test de connecteur peut appeler (ex. jenkins.acme.fr,*.ci.acme.fr)
#
#   Alertes email :
#   ALERT_EMAIL_TO      destinataire des alertes de disponibilité (défaut : vide)
#   ALERT_EMAIL_FROM    expéditeur des alertes
#   SMTP_HOST / SMTP_PORT / SMTP_SECURE  serveur SMTP interne (TLS obligatoire)
#   SMTP_USER / SMTP_PASSWORD            identifiants SMTP (secret asp-mail)
#   RESEND_API_KEY      service externe Resend : refusé sauf ALLOW_EXTERNAL_MAIL=true
#
#   Images tierces (épinglées par empreinte ; install.sh les remplace par le tag importé) :
#   POSTGRES_IMAGE / BUSYBOX_IMAGE
# =============================================================================
set -euo pipefail

NAMESPACE="${NAMESPACE:-asp-portal}"
REGISTRY="${REGISTRY:-}"
TAG="${TAG:-$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD 2>/dev/null || echo local)}"
DOMAIN="${DOMAIN:-}"
BASE_PATH="${BASE_PATH:-/}"
API_URL="${API_URL:-/api}"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-}"
DB_NAME="${DB_NAME:-asp_portal}"
DB_USER="${DB_USER:-asp}"
CERT_MANAGER_ISSUER="${CERT_MANAGER_ISSUER:-}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
LETSENCRYPT_STAGING="${LETSENCRYPT_STAGING:-false}"
TLS_CERT_FILE="${TLS_CERT_FILE:-}"
TLS_KEY_FILE="${TLS_KEY_FILE:-}"
TLS_SECRET="asp-portal-tls"
TLS_MODE=""
ALERT_EMAIL_TO="${ALERT_EMAIL_TO:-}"
ALERT_EMAIL_FROM="${ALERT_EMAIL_FROM:-}"
RESEND_API_KEY="${RESEND_API_KEY:-}"
ALLOW_EXTERNAL_MAIL="${ALLOW_EXTERNAL_MAIL:-false}"
SMTP_HOST="${SMTP_HOST:-}"
SMTP_PORT="${SMTP_PORT:-}"
SMTP_SECURE="${SMTP_SECURE:-}"
SMTP_USER="${SMTP_USER:-}"
SMTP_PASSWORD="${SMTP_PASSWORD:-}"
PORTAL_URL="${PORTAL_URL:-${DOMAIN:+https://${DOMAIN}}}"
AUTH_MODE="${AUTH_MODE:-awx}"
AWX_BASE_URL="${AWX_BASE_URL:-}"
AWX_CLIENT_ID="${AWX_CLIENT_ID:-}"
AWX_CLIENT_SECRET="${AWX_CLIENT_SECRET:-}"
AWX_SCOPES="${AWX_SCOPES:-read write}"
AWX_ADMIN_USERS="${AWX_ADMIN_USERS:-}"
AWX_REDIRECT_URI="${AWX_REDIRECT_URI:-${PORTAL_URL:+${PORTAL_URL}/api/auth/callback}}"
SESSION_TTL_HOURS="${SESSION_TTL_HOURS:-12}"
SESSION_IDLE_MINUTES="${SESSION_IDLE_MINUTES:-30}"
TOKEN_ENCRYPTION_KEYS_PREVIOUS="${TOKEN_ENCRYPTION_KEYS_PREVIOUS:-}"
CONNECTOR_ALLOWED_HOSTS="${CONNECTOR_ALLOWED_HOSTS:-}"
INGRESS_NAMESPACE="${INGRESS_NAMESPACE:-}"
API_EGRESS_CIDR="${API_EGRESS_CIDR:-0.0.0.0/0}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:16.15-alpine@sha256:0cefaabd882e42bcb2a2f3dc56d3ce4770560ba62fd7f197f1a2e008fd5731ab}"
BUSYBOX_IMAGE="${BUSYBOX_IMAGE:-busybox:1.36.1@sha256:73aaf090f3d85aa34ee199857f03fa3a95c8ede2ffd4cc2cdb5b94e566b11662}"

SKIP_BUILD=false
RESET_DB=false
WITH_INGRESS=true

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RENDER_DIR="$(mktemp -d)"
trap 'rm -rf "${RENDER_DIR}"' EXIT

C_RESET='\033[0m'; C_INFO='\033[0;36m'; C_OK='\033[0;32m'; C_WARN='\033[0;33m'; C_ERR='\033[0;31m'
log()   { printf "${C_INFO}▸ %s${C_RESET}\n" "$*"; }
ok()    { printf "${C_OK}✔ %s${C_RESET}\n" "$*"; }
warn()  { printf "${C_WARN}! %s${C_RESET}\n" "$*"; }
fail()  { printf "${C_ERR}✖ %s${C_RESET}\n" "$*" >&2; exit 1; }

for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    --reset-db)   RESET_DB=true ;;
    --no-ingress) WITH_INGRESS=false ;;
    -h|--help)    sed -n '2,/^# =====/p' "$0"; exit 0 ;;
    *)            fail "Option inconnue : $arg" ;;
  esac
done

# ---------------------------------------------------------------------------
# 1. Préflight
# ---------------------------------------------------------------------------
log "Vérification des prérequis"
command -v kubectl >/dev/null 2>&1 || fail "kubectl est introuvable"
if ! KUBECTL_ERR="$(kubectl cluster-info 2>&1 >/dev/null)"; then
  fail "Cluster injoignable avec le kubeconfig ${KUBECONFIG:-~/.kube/config} (variable KUBECONFIG pour un autre fichier) : ${KUBECTL_ERR##*$'\n'}"
fi
if [ "${SKIP_BUILD}" = false ]; then
  command -v docker >/dev/null 2>&1 || fail "docker est introuvable"
fi
ok "Cluster : $(kubectl config current-context)"

# HTTPS : vérifié avant toute construction d'image. Un portail exposé sur un
# domaine n'est jamais déployé sans certificat (le contrôleur servirait sinon
# son « Fake Certificate » sans rien signaler).
if [ "${WITH_INGRESS}" = true ] && [ -n "${DOMAIN}" ]; then
  kubectl get crd middlewares.traefik.io >/dev/null 2>&1 \
    || fail "Traefik (CRD traefik.io) introuvable : contrôleur Ingress requis (inclus dans k3s), ou --no-ingress"
  if [ -n "${TLS_CERT_FILE}" ] || [ -n "${TLS_KEY_FILE}" ]; then
    [ -f "${TLS_CERT_FILE}" ] || fail "TLS_CERT_FILE introuvable : ${TLS_CERT_FILE}"
    [ -f "${TLS_KEY_FILE}" ] || fail "TLS_KEY_FILE introuvable : ${TLS_KEY_FILE}"
    TLS_MODE="files"
  elif [ -n "${CERT_MANAGER_ISSUER}" ]; then
    kubectl get clusterissuer "${CERT_MANAGER_ISSUER}" >/dev/null 2>&1 \
      || fail "ClusterIssuer ${CERT_MANAGER_ISSUER} introuvable (cert-manager installé ?)"
    TLS_MODE="issuer"
  elif [ -n "${LETSENCRYPT_EMAIL}" ]; then
    kubectl get crd clusterissuers.cert-manager.io >/dev/null 2>&1 \
      || fail "cert-manager n'est pas installé : https://cert-manager.io/docs/installation/ (ou fournis TLS_CERT_FILE / TLS_KEY_FILE)"
    TLS_MODE="letsencrypt"
    CERT_MANAGER_ISSUER="asp-letsencrypt"
  elif kubectl -n "${NAMESPACE}" get secret "${TLS_SECRET}" >/dev/null 2>&1; then
    TLS_MODE="existing"
  else
    fail "HTTPS obligatoire pour ${DOMAIN} : fournis LETSENCRYPT_EMAIL, CERT_MANAGER_ISSUER, TLS_CERT_FILE/TLS_KEY_FILE ou un secret ${TLS_SECRET}"
  fi
  ok "HTTPS : certificat via ${TLS_MODE}"
fi

# Configuration de sécurité : l'API (NODE_ENV=production) refuse de démarrer
# si l'un de ces points manque ; on échoue ici, avant tout changement.
case "${PORTAL_URL}" in
  https://*) ;;
  *) fail "PORTAL_URL doit être en https:// (fournis DOMAIN, ou PORTAL_URL derrière un équilibreur HTTPS externe)" ;;
esac
[ "${AUTH_MODE}" = "awx" ] || fail "AUTH_MODE doit valoir awx : le SSO Ascender est obligatoire en production"
case "${AWX_BASE_URL}" in
  https://*) ;;
  "") fail "AWX_BASE_URL est obligatoire (ex. https://awx.acme.fr)" ;;
  *) fail "AWX_BASE_URL doit être en https:// (jetons et mots de passe y transitent)" ;;
esac
[ -n "${AWX_CLIENT_ID}" ] || fail "AWX_CLIENT_ID est obligatoire"
if [ -z "${AWX_CLIENT_SECRET}" ]; then
  AWX_CLIENT_SECRET="$(kubectl -n "${NAMESPACE}" get secret asp-auth \
    -o jsonpath='{.data.AWX_CLIENT_SECRET}' 2>/dev/null | base64 -d 2>/dev/null || true)"
  [ -n "${AWX_CLIENT_SECRET}" ] || fail "AWX_CLIENT_SECRET est obligatoire (aucun secret asp-auth existant)"
  log "AWX_CLIENT_SECRET existant réutilisé"
fi
if [ -n "${RESEND_API_KEY}" ] && [ "${ALLOW_EXTERNAL_MAIL}" != true ]; then
  fail "RESEND_API_KEY envoie les emails par un service externe : utilise SMTP_HOST, ou ALLOW_EXTERNAL_MAIL=true pour l'accepter"
fi
command -v openssl >/dev/null 2>&1 || fail "openssl est introuvable (certificats TLS de PostgreSQL)"
if [ -n "${ASCENDER_CA_FILE:-}" ]; then
  [ -f "${ASCENDER_CA_FILE}" ] || fail "ASCENDER_CA_FILE introuvable : ${ASCENDER_CA_FILE}"
fi
if [ -z "${INGRESS_NAMESPACE}" ]; then
  INGRESS_NAMESPACE="$(kubectl get pods -A -l app.kubernetes.io/name=traefik \
    -o jsonpath='{.items[0].metadata.namespace}' 2>/dev/null || true)"
  INGRESS_NAMESPACE="${INGRESS_NAMESPACE:-kube-system}"
fi
ok "Traefik attendu dans le namespace ${INGRESS_NAMESPACE} (NetworkPolicy)"

CLUSTER_KIND="$(kubectl config view --minify -o jsonpath='{.contexts[0].context.cluster}' 2>/dev/null || true)"
IS_KIND=false
if command -v kind >/dev/null 2>&1 && kind get clusters 2>/dev/null | grep -qx "${CLUSTER_KIND}"; then
  IS_KIND=true
  ok "Cluster kind détecté : les images seront chargées localement"
fi

if [ -z "${REGISTRY}" ] && [ "${IS_KIND}" = false ]; then
  warn "REGISTRY non défini : les images seront construites localement (OK pour minikube/kind uniquement)"
fi

image_ref() {
  local name="$1"
  if [ -n "${REGISTRY}" ]; then echo "${REGISTRY}/${name}:${TAG}"; else echo "${name}:${TAG}"; fi
}

API_IMAGE="$(image_ref asp-api)"
WEB_IMAGE="$(image_ref asp-web)"

# ---------------------------------------------------------------------------
# 2. Build des images
# ---------------------------------------------------------------------------
if [ "${SKIP_BUILD}" = false ]; then
  log "Construction de l'image API (${API_IMAGE})"
  docker build -t "${API_IMAGE}" -f "${ROOT_DIR}/api/Dockerfile" "${ROOT_DIR}/api"

  log "Construction de l'image frontend (${WEB_IMAGE}) — BASE_PATH=${BASE_PATH}"
  docker build \
    --build-arg "BASE_PATH=${BASE_PATH}" \
    -t "${WEB_IMAGE}" \
    -f "${ROOT_DIR}/Dockerfile" "${ROOT_DIR}"

  if [ -n "${REGISTRY}" ]; then
    log "Push des images vers ${REGISTRY}"
    docker push "${API_IMAGE}"
    docker push "${WEB_IMAGE}"
  elif [ "${IS_KIND}" = true ]; then
    log "Chargement des images dans le cluster kind"
    kind load docker-image "${API_IMAGE}" --name "${CLUSTER_KIND}"
    kind load docker-image "${WEB_IMAGE}" --name "${CLUSTER_KIND}"
  else
    warn "Images non publiées : assure-toi que le cluster peut les récupérer (minikube image load…)"
  fi
  ok "Images prêtes"
else
  log "Build ignoré (--skip-build) — images : ${API_IMAGE} / ${WEB_IMAGE}"
fi

# ---------------------------------------------------------------------------
# 3. Namespace & configuration
# ---------------------------------------------------------------------------
log "Application du namespace ${NAMESPACE}"
kubectl apply -f "${ROOT_DIR}/deploy/k8s/00-namespace.yaml"

if [ -n "${ASCENDER_CA_FILE:-}" ]; then
  log "Autorité de certification d'Ascender (ConfigMap asp-ascender-ca)"
  kubectl -n "${NAMESPACE}" create configmap asp-ascender-ca \
    --from-file=ca.crt="${ASCENDER_CA_FILE}" \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null
fi

log "Mise à jour de la configuration applicative"
# Derrière l'Ingress HTTPS, le cookie de session est toujours « Secure ».
COOKIE_SECURE=""
if [ "${WITH_INGRESS}" = true ] && [ -n "${DOMAIN}" ]; then COOKIE_SECURE="true"; fi
kubectl -n "${NAMESPACE}" create configmap asp-config \
  --from-literal=COOKIE_SECURE="${COOKIE_SECURE}" \
  --from-literal=ALLOWED_ORIGINS="${ALLOWED_ORIGINS}" \
  --from-literal=API_URL="${API_URL}" \
  --from-literal=ALERT_EMAIL_TO="${ALERT_EMAIL_TO}" \
  --from-literal=PORTAL_URL="${PORTAL_URL}" \
  --from-literal=AUTH_MODE="${AUTH_MODE}" \
  --from-literal=AWX_BASE_URL="${AWX_BASE_URL}" \
  --from-literal=AWX_CLIENT_ID="${AWX_CLIENT_ID}" \
  --from-literal=AWX_SCOPES="${AWX_SCOPES}" \
  --from-literal=AWX_ADMIN_USERS="${AWX_ADMIN_USERS}" \
  --from-literal=SESSION_TTL_HOURS="${SESSION_TTL_HOURS}" \
  --from-literal=SESSION_IDLE_MINUTES="${SESSION_IDLE_MINUTES}" \
  --from-literal=CONNECTOR_ALLOWED_HOSTS="${CONNECTOR_ALLOWED_HOSTS}" \
  --from-literal=ALERT_EMAIL_FROM="${ALERT_EMAIL_FROM}" \
  --from-literal=SMTP_HOST="${SMTP_HOST}" \
  --from-literal=SMTP_PORT="${SMTP_PORT}" \
  --from-literal=SMTP_SECURE="${SMTP_SECURE}" \
  --from-literal=ALLOW_EXTERNAL_MAIL="${ALLOW_EXTERNAL_MAIL}" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null
if [ -z "${CONNECTOR_ALLOWED_HOSTS}" ]; then
  warn "CONNECTOR_ALLOWED_HOSTS vide : le test de joignabilité des connecteurs est désactivé"
fi

# Mot de passe : réutilisé s'il existe déjà, sinon généré et conservé dans le cluster
EXISTING_PASSWORD=""
if kubectl -n "${NAMESPACE}" get secret asp-db >/dev/null 2>&1; then
  EXISTING_PASSWORD="$(kubectl -n "${NAMESPACE}" get secret asp-db \
    -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d 2>/dev/null || true)"
fi
DB_PASSWORD="${FORCE_DB_PASSWORD:-${EXISTING_PASSWORD}}"
if [ -z "${DB_PASSWORD}" ]; then
  DB_PASSWORD="$(openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)"
  ok "Nouveau mot de passe de base généré (stocké dans le secret asp-db)"
else
  log "Mot de passe de base existant réutilisé"
fi

kubectl -n "${NAMESPACE}" create secret generic asp-db \
  --from-literal=POSTGRES_DB="${DB_NAME}" \
  --from-literal=POSTGRES_USER="${DB_USER}" \
  --from-literal=POSTGRES_PASSWORD="${DB_PASSWORD}" \
  --from-literal=DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null

# Alertes email : SMTP interne (identifiants dans asp-mail), ou Resend si
# explicitement accepté. Sans transport, les alertes restent en base.
SMTP_USER="${SMTP_USER:-$(kubectl -n "${NAMESPACE}" get secret asp-mail -o jsonpath='{.data.SMTP_USER}' 2>/dev/null | base64 -d 2>/dev/null || true)}"
SMTP_PASSWORD="${SMTP_PASSWORD:-$(kubectl -n "${NAMESPACE}" get secret asp-mail -o jsonpath='{.data.SMTP_PASSWORD}' 2>/dev/null | base64 -d 2>/dev/null || true)}"
kubectl -n "${NAMESPACE}" create secret generic asp-mail \
  --from-literal=SMTP_USER="${SMTP_USER}" \
  --from-literal=SMTP_PASSWORD="${SMTP_PASSWORD}" \
  --from-literal=RESEND_API_KEY="${RESEND_API_KEY}" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n "${NAMESPACE}" delete secret asp-alerts --ignore-not-found >/dev/null 2>&1 || true
if [ -n "${SMTP_HOST}" ]; then
  ok "Alertes email : SMTP interne ${SMTP_HOST}"
elif [ -n "${RESEND_API_KEY}" ]; then
  warn "Alertes email : service externe Resend (ALLOW_EXTERNAL_MAIL=true)"
else
  warn "Aucun transport email (SMTP_HOST) : les alertes seront enregistrées sans envoi"
fi

# SSO Ascender et clé de chiffrement des jetons : fournie, sinon reprise du
# secret existant, sinon générée.
log "Mise à jour du secret asp-auth (SSO Ascender, chiffrement)"
if [ -z "${TOKEN_ENCRYPTION_KEY:-}" ]; then
  TOKEN_ENCRYPTION_KEY="$(kubectl -n "${NAMESPACE}" get secret asp-auth \
    -o jsonpath='{.data.TOKEN_ENCRYPTION_KEY}' 2>/dev/null | base64 -d 2>/dev/null || true)"
fi
if [ -z "${TOKEN_ENCRYPTION_KEY}" ]; then
  TOKEN_ENCRYPTION_KEY="$(openssl rand -base64 32)"
  ok "Clé de chiffrement générée (secret asp-auth)"
fi
kubectl -n "${NAMESPACE}" create secret generic asp-auth \
  --from-literal=AWX_CLIENT_SECRET="${AWX_CLIENT_SECRET}" \
  --from-literal=AWX_REDIRECT_URI="${AWX_REDIRECT_URI}" \
  --from-literal=TOKEN_ENCRYPTION_KEY="${TOKEN_ENCRYPTION_KEY}" \
  --from-literal=TOKEN_ENCRYPTION_KEYS_PREVIOUS="${TOKEN_ENCRYPTION_KEYS_PREVIOUS}" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null
ok "SSO Ascender configuré — URL de redirection à déclarer dans Ascender : ${AWX_REDIRECT_URI}"

# PostgreSQL en TLS : autorité interne (10 ans) et certificat serveur (2 ans)
# pour le nom « postgres ». Conservés d'un déploiement à l'autre, renouvelés
# 30 jours avant expiration ; la clé de l'autorité reste dans le secret pour
# re-signer sans changer la confiance de l'API.
PG_TLS_RENEWED=false
ensure_pg_tls() {
  local dir="${RENDER_DIR}/pg-tls"
  mkdir -p "${dir}"
  if kubectl -n "${NAMESPACE}" get secret asp-pg-tls >/dev/null 2>&1; then
    for key in ca.crt ca.key tls.crt; do
      kubectl -n "${NAMESPACE}" get secret asp-pg-tls -o "jsonpath={.data.${key//./\\.}}" | base64 -d > "${dir}/${key}"
    done
    if openssl x509 -checkend $((30 * 24 * 3600)) -noout -in "${dir}/tls.crt" >/dev/null 2>&1; then
      log "Certificat TLS PostgreSQL valide (expire le $(openssl x509 -enddate -noout -in "${dir}/tls.crt" | cut -d= -f2))"
      return
    fi
    warn "Certificat TLS PostgreSQL proche de l'expiration : renouvellement"
  else
    log "Création de l'autorité interne PostgreSQL"
    MSYS_NO_PATHCONV=1 openssl req -x509 -new -nodes -newkey rsa:3072 -sha256 -days 3650 \
      -subj "/CN=asp-portal PostgreSQL CA" -keyout "${dir}/ca.key" -out "${dir}/ca.crt" >/dev/null 2>&1
  fi
  MSYS_NO_PATHCONV=1 openssl req -new -nodes -newkey rsa:3072 -sha256 -subj "/CN=postgres" \
    -keyout "${dir}/tls.key" -out "${dir}/tls.csr" >/dev/null 2>&1
  printf 'subjectAltName=DNS:postgres,DNS:postgres.%s.svc,DNS:postgres.%s.svc.cluster.local\nextendedKeyUsage=serverAuth\nkeyUsage=digitalSignature,keyEncipherment\n' \
    "${NAMESPACE}" "${NAMESPACE}" > "${dir}/ext.cnf"
  openssl x509 -req -in "${dir}/tls.csr" -CA "${dir}/ca.crt" -CAkey "${dir}/ca.key" -CAcreateserial \
    -sha256 -days 730 -extfile "${dir}/ext.cnf" -out "${dir}/tls.crt" >/dev/null 2>&1
  kubectl -n "${NAMESPACE}" create secret generic asp-pg-tls \
    --from-file=ca.crt="${dir}/ca.crt" --from-file=ca.key="${dir}/ca.key" \
    --from-file=tls.crt="${dir}/tls.crt" --from-file=tls.key="${dir}/tls.key" \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  PG_TLS_RENEWED=true
  ok "Certificat TLS PostgreSQL émis (valable 2 ans)"
}
ensure_pg_tls

log "Injection du schéma, du jeu de données et du script de migration dans la ConfigMap asp-db-init"
kubectl -n "${NAMESPACE}" create configmap asp-db-init \
  --from-file="${ROOT_DIR}/db/" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null

# ---------------------------------------------------------------------------
# Rendu des manifestes (images épinglées, domaine, réseau)
# ---------------------------------------------------------------------------
log "Rendu des manifestes (images + domaine + réseau)"
cp "${ROOT_DIR}"/deploy/k8s/*.yaml "${RENDER_DIR}/"
sed -i.bak "s|IMAGE_API|${API_IMAGE}|g" "${RENDER_DIR}/20-api.yaml"
sed -i.bak "s|IMAGE_WEB|${WEB_IMAGE}|g" "${RENDER_DIR}/30-web.yaml"
sed -i.bak "s|IMAGE_POSTGRES|${POSTGRES_IMAGE}|g; s|IMAGE_BUSYBOX|${BUSYBOX_IMAGE}|g" \
  "${RENDER_DIR}/10-postgres.yaml" "${RENDER_DIR}/15-migrate-job.yaml" "${RENDER_DIR}/20-api.yaml"
sed -i.bak "s|INGRESS_NAMESPACE|${INGRESS_NAMESPACE}|g; s|API_EGRESS_CIDR|${API_EGRESS_CIDR}|g" \
  "${RENDER_DIR}/40-network-policies.yaml"
if [ -n "${DOMAIN}" ]; then
  sed -i.bak "s|DOMAIN_PLACEHOLDER|${DOMAIN}|g" "${RENDER_DIR}/50-ingress.yaml"
  if [ "${TLS_MODE}" = "issuer" ] || [ "${TLS_MODE}" = "letsencrypt" ]; then
    sed -i.bak "s|    # TLS_ISSUER_ANNOTATION|    cert-manager.io/cluster-issuer: ${CERT_MANAGER_ISSUER}|" "${RENDER_DIR}/50-ingress.yaml"
  else
    sed -i.bak "/# TLS_ISSUER_ANNOTATION/d" "${RENDER_DIR}/50-ingress.yaml"
  fi
fi
rm -f "${RENDER_DIR}"/*.bak

log "Cloisonnement réseau (NetworkPolicy : tout refusé sauf les flux du portail)"
kubectl apply -f "${RENDER_DIR}/40-network-policies.yaml" >/dev/null

# ---------------------------------------------------------------------------
# 4. PostgreSQL
# ---------------------------------------------------------------------------
log "Déploiement de PostgreSQL (TLS obligatoire)"
kubectl apply -f "${RENDER_DIR}/10-postgres.yaml"
if [ "${PG_TLS_RENEWED}" = true ]; then
  kubectl -n "${NAMESPACE}" rollout restart statefulset/postgres >/dev/null
fi

kubectl -n "${NAMESPACE}" rollout status statefulset/postgres --timeout=300s

log "Attente de la disponibilité de la base"
for attempt in $(seq 1 40); do
  if kubectl -n "${NAMESPACE}" exec postgres-0 -- \
      psql -U "${DB_USER}" -d "${DB_NAME}" -tAc 'SELECT 1' >/dev/null 2>&1; then
    ok "PostgreSQL répond"
    break
  fi
  [ "${attempt}" -eq 40 ] && fail "PostgreSQL ne répond pas après 80 s"
  sleep 2
done

if [ "${RESET_DB}" = true ]; then
  warn "Réinitialisation complète du schéma et des données (--reset-db)"
  kubectl -n "${NAMESPACE}" exec -i postgres-0 -- \
    psql -v ON_ERROR_STOP=1 -U "${DB_USER}" -d "${DB_NAME}" < "${ROOT_DIR}/db/001_schema.sql" >/dev/null
  kubectl -n "${NAMESPACE}" exec -i postgres-0 -- \
    psql -v ON_ERROR_STOP=1 -U "${DB_USER}" -d "${DB_NAME}" < "${ROOT_DIR}/db/002_seed.sql" >/dev/null
  # Les scripts viennent d'être rejoués : le job de migration les marquera comme appliqués.
  kubectl -n "${NAMESPACE}" exec postgres-0 -- \
    psql -U "${DB_USER}" -d "${DB_NAME}" -c 'DROP TABLE IF EXISTS schema_migrations' >/dev/null
  ok "Base réinitialisée"
fi

# ---------------------------------------------------------------------------
# 4bis. Job de migration SQL (exécuté avant chaque démarrage de l'API)
# ---------------------------------------------------------------------------
log "Migration SQL (Job automatique : schéma au premier démarrage, puis incréments)"
kubectl -n "${NAMESPACE}" delete job asp-db-migrate --ignore-not-found >/dev/null 2>&1 || true
kubectl apply -f "${RENDER_DIR}/15-migrate-job.yaml"
if kubectl -n "${NAMESPACE}" wait --for=condition=complete job/asp-db-migrate --timeout=300s; then
  kubectl -n "${NAMESPACE}" logs job/asp-db-migrate --tail=40 || true
  ok "Schéma de base à jour"
else
  kubectl -n "${NAMESPACE}" logs job/asp-db-migrate --tail=80 || true
  fail "Le job de migration a échoué : corrige le SQL puis relance le déploiement"
fi

# ---------------------------------------------------------------------------
# 5. API + frontend
# ---------------------------------------------------------------------------
log "Déploiement de l'API"
kubectl apply -f "${RENDER_DIR}/20-api.yaml"
if [ "${PG_TLS_RENEWED}" = true ]; then
  kubectl -n "${NAMESPACE}" rollout restart deployment/asp-api >/dev/null
fi
if ! kubectl -n "${NAMESPACE}" rollout status deployment/asp-api --timeout=240s; then
  kubectl -n "${NAMESPACE}" logs deploy/asp-api --tail=30 || true
  fail "L'API ne démarre pas (configuration de sécurité refusée ? voir les journaux ci-dessus)"
fi

# Rotation de clé : les données encore chiffrées avec une ancienne clé sont
# re-chiffrées avec la clé courante.
if [ -n "${TOKEN_ENCRYPTION_KEYS_PREVIOUS}" ]; then
  log "Rotation de clé : re-chiffrement des données"
  kubectl -n "${NAMESPACE}" exec deploy/asp-api -- node scripts/rotate-keys.js \
    || fail "Rotation de clé échouée"
  ok "Données re-chiffrées : retire TOKEN_ENCRYPTION_KEYS_PREVIOUS au prochain déploiement"
fi

log "Déploiement du portail"
kubectl apply -f "${RENDER_DIR}/30-web.yaml"
kubectl -n "${NAMESPACE}" rollout status deployment/asp-web --timeout=240s

# ---------------------------------------------------------------------------
# 6. Ingress
# ---------------------------------------------------------------------------
if [ "${WITH_INGRESS}" = true ] && [ -n "${DOMAIN}" ]; then
  case "${TLS_MODE}" in
    files)
      log "Secret TLS ${TLS_SECRET} depuis les fichiers fournis"
      kubectl -n "${NAMESPACE}" create secret tls "${TLS_SECRET}" \
        --cert="${TLS_CERT_FILE}" --key="${TLS_KEY_FILE}" \
        --dry-run=client -o yaml | kubectl apply -f - >/dev/null
      ;;
    letsencrypt)
      ACME_SERVER="https://acme-v02.api.letsencrypt.org/directory"
      [ "${LETSENCRYPT_STAGING}" = true ] && ACME_SERVER="https://acme-staging-v02.api.letsencrypt.org/directory"
      log "ClusterIssuer ${CERT_MANAGER_ISSUER} (Let's Encrypt, ${LETSENCRYPT_EMAIL})"
      cat <<YAML | kubectl apply -f - >/dev/null
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: ${CERT_MANAGER_ISSUER}
spec:
  acme:
    email: ${LETSENCRYPT_EMAIL}
    server: ${ACME_SERVER}
    privateKeySecretRef:
      name: ${CERT_MANAGER_ISSUER}-account
    solvers:
      - http01:
          ingress:
            ingressClassName: traefik
YAML
      ;;
  esac

  log "Déploiement de l'Ingress pour ${DOMAIN} (HTTPS, redirection HTTP -> HTTPS)"
  kubectl apply -f "${RENDER_DIR}/50-ingress.yaml"

  if [ "${TLS_MODE}" = "issuer" ] || [ "${TLS_MODE}" = "letsencrypt" ]; then
    log "Attente du certificat ${TLS_SECRET} (cert-manager, jusqu'à 5 min)"
    if kubectl -n "${NAMESPACE}" wait --for=condition=Ready "certificate/${TLS_SECRET}" --timeout=300s >/dev/null 2>&1; then
      ok "Certificat émis"
    else
      warn "Certificat pas encore émis : kubectl -n ${NAMESPACE} describe certificate ${TLS_SECRET} (DNS de ${DOMAIN} vers l'Ingress ?)"
    fi
  fi

  if command -v curl >/dev/null 2>&1; then
    if curl -fsS --max-time 10 "https://${DOMAIN}/api/system/health" >/dev/null 2>&1; then
      ok "HTTPS opérationnel : https://${DOMAIN}"
    else
      warn "https://${DOMAIN} ne répond pas encore avec un certificat valide (DNS, propagation ou émission en cours)"
    fi
  fi
else
  warn "Ingress non déployé (--no-ingress ou DOMAIN vide) : accès local en HTTP via port-forward uniquement"
fi

# ---------------------------------------------------------------------------
# 7. Vérifications et résumé
# ---------------------------------------------------------------------------
log "Contrôle de santé de l'API"
# Pod conforme au profil « restricted » du namespace, autorisé par la
# NetworkPolicy healthcheck-egress à joindre l'API seulement.
HEALTH_OVERRIDES="$(cat <<JSON
{"spec":{"automountServiceAccountToken":false,
 "securityContext":{"runAsNonRoot":true,"runAsUser":65534,"seccompProfile":{"type":"RuntimeDefault"}},
 "containers":[{"name":"health","image":"${BUSYBOX_IMAGE}","stdin":true,
  "command":["wget","-qO-","http://asp-api/api/system/health"],
  "securityContext":{"allowPrivilegeEscalation":false,"readOnlyRootFilesystem":true,"capabilities":{"drop":["ALL"]}}}]}}
JSON
)"
kubectl -n "${NAMESPACE}" run "health-$(date +%s)" --rm -i --restart=Never \
  --labels=app.kubernetes.io/name=asp-healthcheck --image="${BUSYBOX_IMAGE}" \
  --overrides="${HEALTH_OVERRIDES}" --quiet >/dev/null 2>&1 \
  && ok "L'API répond sur /api/system/health" \
  || warn "Le test interne a échoué : vérifie les logs avec kubectl -n ${NAMESPACE} logs deploy/asp-api"

printf "\n${C_OK}Déploiement terminé${C_RESET}\n"
printf "  Namespace : %s\n" "${NAMESPACE}"
printf "  API       : %s\n" "${API_IMAGE}"
printf "  Frontend  : %s\n" "${WEB_IMAGE}"
if [ "${WITH_INGRESS}" = true ] && [ -n "${DOMAIN}" ]; then
  printf "  URL       : https://%s\n" "${DOMAIN}"
else
  printf "  Accès local : kubectl -n %s port-forward svc/asp-web 8080:80\n" "${NAMESPACE}"
  printf "                kubectl -n %s port-forward svc/asp-api 8081:80\n" "${NAMESPACE}"
fi
printf "\n  Base      : postgres-0:%s/%s (utilisateur %s)\n" "5432" "${DB_NAME}" "${DB_USER}"
printf "  Logs      : kubectl -n %s logs -f deploy/asp-api\n\n" "${NAMESPACE}"