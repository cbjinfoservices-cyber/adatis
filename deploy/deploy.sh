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
#   AWX_ALLOW_HTTP      true pour accepter un AWX_BASE_URL en http:// (déconseillé)
#   FORCE_DB_PASSWORD   impose un mot de passe (sinon réutilisé/créé automatiquement)
#   ALERT_EMAIL_TO      destinataire des alertes de disponibilité (défaut : vide)
#   ALERT_EMAIL_FROM    expéditeur des alertes (défaut : alertes@<domaine Resend>)
#   RESEND_API_KEY      active l'envoi réel des alertes email (secret asp-alerts)
#   PORTAL_URL          URL publique reprise dans les emails (défaut : https://${DOMAIN})
#   AUTH_MODE           disabled (défaut) ou awx pour imposer le SSO AWX
#   AWX_BASE_URL        URL de base de l'AWX (ex. https://awx.acme.fr)
#   AWX_CLIENT_ID       application OAuth2 créée dans AWX
#   AWX_CLIENT_SECRET   secret de l'application (secret Kubernetes asp-auth)
#   TOKEN_ENCRYPTION_KEY clé AES-256 des jetons en base (32 octets base64 ; sinon conservée ou générée)
#   AWX_SCOPES          scopes demandés (défaut : read write)
#   AWX_ADMIN_USERS     identifiants AWX promus admin (séparés par des virgules)
#   AWX_REDIRECT_URI    défaut : ${PORTAL_URL}/api/auth/callback
#   SESSION_TTL_HOURS   durée de session portail (défaut : 12)
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
PORTAL_URL="${PORTAL_URL:-${DOMAIN:+https://${DOMAIN}}}"
AUTH_MODE="${AUTH_MODE:-disabled}"
AWX_BASE_URL="${AWX_BASE_URL:-}"
AWX_CLIENT_ID="${AWX_CLIENT_ID:-}"
AWX_CLIENT_SECRET="${AWX_CLIENT_SECRET:-}"
AWX_SCOPES="${AWX_SCOPES:-read write}"
AWX_ADMIN_USERS="${AWX_ADMIN_USERS:-}"
AWX_REDIRECT_URI="${AWX_REDIRECT_URI:-${PORTAL_URL:+${PORTAL_URL}/api/auth/callback}}"
SESSION_TTL_HOURS="${SESSION_TTL_HOURS:-12}"

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
kubectl cluster-info >/dev/null 2>&1 || fail "Aucun cluster joignable (vérifie ton kubeconfig)"
command -v docker >/dev/null 2>&1 || fail "docker est introuvable"
ok "Cluster : $(kubectl config current-context)"

# HTTPS : vérifié avant toute construction d'image. Un portail exposé sur un
# domaine n'est jamais déployé sans certificat (le contrôleur servirait sinon
# son « Fake Certificate » sans rien signaler).
if [ "${WITH_INGRESS}" = true ] && [ -n "${DOMAIN}" ]; then
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

# Portail -> Ascender : jetons et mots de passe y transitent, HTTPS exigé.
case "${AWX_BASE_URL:-}" in
  http://*)
    [ "${AWX_ALLOW_HTTP:-false}" = true ] \
      || fail "AWX_BASE_URL doit être en https:// (jetons et mots de passe y transitent) ; AWX_ALLOW_HTTP=true pour passer outre"
    warn "AWX_BASE_URL en HTTP accepté (AWX_ALLOW_HTTP=true)"
    ;;
esac
if [ -n "${ASCENDER_CA_FILE:-}" ]; then
  [ -f "${ASCENDER_CA_FILE}" ] || fail "ASCENDER_CA_FILE introuvable : ${ASCENDER_CA_FILE}"
fi

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
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null

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
  --from-literal=DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}?sslmode=disable" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null

# Alertes email : le secret n'est créé que si une clé Resend est fournie.
# Sans clé, l'API enregistre les alertes en base mais n'envoie rien.
if [ -n "${RESEND_API_KEY}" ]; then
  log "Mise à jour du secret asp-alerts (alertes email Resend)"
  kubectl -n "${NAMESPACE}" create secret generic asp-alerts \
    --from-literal=RESEND_API_KEY="${RESEND_API_KEY}" \
    --from-literal=ALERT_EMAIL_FROM="${ALERT_EMAIL_FROM}" \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  if [ -z "${ALERT_EMAIL_TO}" ]; then
    warn "ALERT_EMAIL_TO vide : définis le destinataire depuis la page Système après le déploiement"
  fi
  ok "Envoi des alertes email activé"
else
  warn "RESEND_API_KEY absent : les alertes seront enregistrées mais aucun email ne sera envoyé"
fi

# SSO Ascender : secret créé uniquement si le client secret est fourni.
# Sans lui, AUTH_MODE=awx ferme le portail (503) jusqu'à configuration complète.
if [ -n "${AWX_CLIENT_SECRET}" ]; then
  log "Mise à jour du secret asp-auth (SSO Ascender)"
  # Clé de chiffrement des jetons : fournie, sinon reprise du secret existant,
  # sinon générée (la changer déconnecte simplement les utilisateurs).
  if [ -z "${TOKEN_ENCRYPTION_KEY:-}" ]; then
    TOKEN_ENCRYPTION_KEY="$(kubectl -n "${NAMESPACE}" get secret asp-auth \
      -o jsonpath='{.data.TOKEN_ENCRYPTION_KEY}' 2>/dev/null | base64 -d 2>/dev/null || true)"
  fi
  if [ -z "${TOKEN_ENCRYPTION_KEY}" ]; then
    TOKEN_ENCRYPTION_KEY="$(openssl rand -base64 32)"
  fi
  kubectl -n "${NAMESPACE}" create secret generic asp-auth \
    --from-literal=AWX_CLIENT_SECRET="${AWX_CLIENT_SECRET}" \
    --from-literal=AWX_REDIRECT_URI="${AWX_REDIRECT_URI}" \
    --from-literal=TOKEN_ENCRYPTION_KEY="${TOKEN_ENCRYPTION_KEY}" \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  ok "SSO AWX configuré"
  if [ -n "${AWX_REDIRECT_URI}" ]; then
    log "URL de redirection à déclarer dans l'application OAuth2 AWX : ${AWX_REDIRECT_URI}"
  fi
else
  warn "AWX_CLIENT_SECRET absent : le SSO AWX restera désactivé"
fi

if [ "${AUTH_MODE}" = "awx" ] && { [ -z "${AWX_BASE_URL}" ] || [ -z "${AWX_CLIENT_ID}" ] || [ -z "${AWX_CLIENT_SECRET}" ]; }; then
  warn "AUTH_MODE=awx mais la configuration Ascender est incomplète : le portail restera fermé (503)"
fi

log "Injection du schéma, du jeu de données et du script de migration dans la ConfigMap asp-db-init"
kubectl -n "${NAMESPACE}" create configmap asp-db-init \
  --from-file="${ROOT_DIR}/db/" \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null

# ---------------------------------------------------------------------------
# 4. PostgreSQL
# ---------------------------------------------------------------------------
log "Déploiement de PostgreSQL"
kubectl apply -f "${ROOT_DIR}/deploy/k8s/10-postgres.yaml"

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
kubectl apply -f "${ROOT_DIR}/deploy/k8s/15-migrate-job.yaml"
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
log "Rendu des manifestes (images + domaine)"
cp "${ROOT_DIR}"/deploy/k8s/*.yaml "${RENDER_DIR}/"
sed -i.bak "s|IMAGE_API|${API_IMAGE}|g" "${RENDER_DIR}/20-api.yaml"
sed -i.bak "s|IMAGE_WEB|${WEB_IMAGE}|g" "${RENDER_DIR}/30-web.yaml"
if [ -n "${DOMAIN}" ]; then
  sed -i.bak "s|DOMAIN_PLACEHOLDER|${DOMAIN}|g" "${RENDER_DIR}/50-ingress.yaml"
  if [ "${TLS_MODE}" = "issuer" ] || [ "${TLS_MODE}" = "letsencrypt" ]; then
    sed -i.bak "s|    # TLS_ISSUER_ANNOTATION|    cert-manager.io/cluster-issuer: ${CERT_MANAGER_ISSUER}|" "${RENDER_DIR}/50-ingress.yaml"
  else
    sed -i.bak "/# TLS_ISSUER_ANNOTATION/d" "${RENDER_DIR}/50-ingress.yaml"
  fi
fi
rm -f "${RENDER_DIR}"/*.bak

log "Déploiement de l'API"
kubectl apply -f "${RENDER_DIR}/05-config.yaml"
kubectl apply -f "${RENDER_DIR}/20-api.yaml"
kubectl -n "${NAMESPACE}" rollout status deployment/asp-api --timeout=240s

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
            ingressClassName: nginx
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
kubectl -n "${NAMESPACE}" run "health-$(date +%s)" --rm -i --restart=Never \
  --image=busybox:1.36 --quiet -- sh -c 'wget -qO- http://asp-api/api/system/health' >/dev/null 2>&1 \
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