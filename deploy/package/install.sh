#!/usr/bin/env bash
# =============================================================================
# ASP Automation Service Portal — installation depuis le package de production
#
#   cp config.env.example config.env    # renseigner domaine, HTTPS, Ascender…
#   bash install.sh                     # construit/charge/réutilise les images puis déploie
#   bash install.sh --no-ingress        # options transmises à deploy/deploy.sh
#
# VM Linux vierge : sans cluster accessible, k3s (embarqué, hors ligne, avec
# son contrôleur Ingress Traefik) est installé (K3S_INSTALL=auto, défaut).
#
# Images : poussées vers REGISTRY s'il est défini (cluster multi-nœuds),
# sinon importées dans le runtime du nœud local (k3s, microk8s ou Docker).
# =============================================================================
set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARCHIVE="${PKG_DIR}/images/images.tar.gz"
# kubectl de k3s : /usr/local/bin, absent du PATH de certains sudo / root.
export PATH="${PATH}:/usr/local/bin"

C_RESET='\033[0m'; C_INFO='\033[0;36m'; C_OK='\033[0;32m'; C_WARN='\033[0;33m'; C_ERR='\033[0;31m'
log()  { printf "${C_INFO}▸ %s${C_RESET}\n" "$*"; }
ok()   { printf "${C_OK}✔ %s${C_RESET}\n" "$*"; }
warn() { printf "${C_WARN}! %s${C_RESET}\n" "$*"; }
fail() { printf "${C_ERR}✖ %s${C_RESET}\n" "$*" >&2; exit 1; }

as_root() {
  if [ "$(id -u)" -eq 0 ]; then "$@"; else
    command -v sudo >/dev/null 2>&1 || fail "Droits root requis : lance install.sh en root ou installe sudo"
    sudo "$@"
  fi
}

# Fichiers sensibles temporaires (kubeconfig copié, certificat auto-signé).
TMP_DIR="$(mktemp -d)"
chmod 700 "${TMP_DIR}"
trap 'rm -rf "${TMP_DIR}"' EXIT

for cmd in sha256sum gunzip openssl base64 sed awk sort find; do
  command -v "${cmd}" >/dev/null 2>&1 || fail "${cmd} est introuvable"
done

log "Vérification de l'intégrité du package"
[ -s "${PKG_DIR}/SHA256SUMS" ] || fail "SHA256SUMS absent ou vide"
[ -z "$(find "${PKG_DIR}" -type l -print -quit)" ] || fail "Liens symboliques interdits dans le package"
while IFS= read -r line || [ -n "${line}" ]; do
  [[ "${line}" =~ ^[0-9a-f]{64}\ ([\ \*])([^[:space:]]+)$ ]] || fail "SHA256SUMS : ligne invalide"
  rel="${BASH_REMATCH[2]}"
  rel="${rel#./}"
  case "/${rel}/" in
    *"/../"*|*"/./"*) fail "SHA256SUMS : chemin invalide : ${rel}" ;;
  esac
  case "${rel}" in /*|*\\*) fail "SHA256SUMS : chemin invalide : ${rel}" ;; esac
done < "${PKG_DIR}/SHA256SUMS"
MANIFEST_FILES="$(awk '{p = substr($0, 67); sub(/^\*/, "", p); sub(/^\.\//, "", p); print p}' "${PKG_DIR}/SHA256SUMS" | sort)"
PACKAGE_FILES="$(cd "${PKG_DIR}" && find . -type f ! -path ./SHA256SUMS ! -path ./config.env -print | sed 's#^\./##' | sort)"
[ "${MANIFEST_FILES}" = "${PACKAGE_FILES}" ] || fail "SHA256SUMS : fichiers manquants, surnuméraires ou dupliqués"
(cd "${PKG_DIR}" && sha256sum --quiet -c SHA256SUMS) || fail "SHA256SUMS : package altéré ou incomplet"
for required in VERSION config.env.example install.sh deploy/deploy.sh; do
  [ -f "${PKG_DIR}/${required}" ] || fail "Fichier requis absent : ${required}"
done

read_key_value_file() {
  local file="$1" allowed="$2" line key value seen=","
  while IFS= read -r line || [ -n "${line}" ]; do
    line="${line%$'\r'}"
    case "${line}" in ''|'#'*) continue ;; esac
    [[ "${line}" =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]] || fail "Ligne invalide dans ${file}"
    key="${BASH_REMATCH[1]}"
    case "${seen}" in *",${key},"*) fail "Clé ${key} dupliquée dans ${file}" ;; esac
    seen="${seen}${key},"
    value="${BASH_REMATCH[2]}"
    case ",${allowed}," in *",${key},"*) ;; *) fail "Clé ${key} non autorisée dans ${file}" ;; esac
    if [[ "${value}" =~ ^\"(.*)\"$ ]] || [[ "${value}" =~ ^\'(.*)\'$ ]]; then
      value="${BASH_REMATCH[1]}"
    fi
    export "${key}=${value}"
  done < "${file}"
}

read_key_value_file "${PKG_DIR}/VERSION" \
  "TAG,API_IMAGE,WEB_IMAGE,POSTGRES_IMAGE,BUSYBOX_IMAGE,K3S_VERSION,K3S_ARCH,K3S_BINARY,K3S_SOURCE_IMAGES_SHA256,THIRD_PARTY_IMAGES,BASE_PATH,PLATFORM,INCLUDE_IMAGES,BUILD_FROM_SOURCE,BUILT_AT,COMMIT"
PACKAGE_TAG="${TAG:-}"
[ -n "${PACKAGE_TAG}" ] || fail "TAG absent de VERSION"
INCLUDE_IMAGES="${INCLUDE_IMAGES:-true}"
case "${INCLUDE_IMAGES}" in true|false) ;; *) fail "INCLUDE_IMAGES invalide dans VERSION" ;; esac
BUILD_FROM_SOURCE="${BUILD_FROM_SOURCE:-false}"
case "${BUILD_FROM_SOURCE}" in true|false) ;; *) fail "BUILD_FROM_SOURCE invalide dans VERSION" ;; esac
if [ "${BUILD_FROM_SOURCE}" = true ]; then
  [ "${INCLUDE_IMAGES}" = false ] || fail "BUILD_FROM_SOURCE requiert INCLUDE_IMAGES=false"
  [ -f "${PKG_DIR}/Dockerfile" ] && [ -f "${PKG_DIR}/api/Dockerfile" ] \
    && [ -f "${PKG_DIR}/deploy/package/postgres.Dockerfile" ] \
    || fail "Sources ou Dockerfiles applicatifs absents du package"
  command -v docker >/dev/null 2>&1 || fail "docker est requis pour construire les images depuis les sources"
  docker info --format '{{.ServerVersion}}' >/dev/null 2>&1 \
    || fail "Docker ne repond pas : demarrer Docker avant l'installation"
fi
PACKAGE_API_IMAGE="${API_IMAGE:-}"
PACKAGE_WEB_IMAGE="${WEB_IMAGE:-}"
PACKAGE_POSTGRES_IMAGE="${POSTGRES_IMAGE:-}"
PACKAGE_BUSYBOX_IMAGE="${BUSYBOX_IMAGE:-}"
if [ "${INCLUDE_IMAGES}" = true ]; then
  [ -n "${API_IMAGE:-}" ] && [ -n "${WEB_IMAGE:-}" ] \
    || fail "API_IMAGE ou WEB_IMAGE absent de VERSION"
  [ -n "${POSTGRES_IMAGE:-}" ] && [ -n "${BUSYBOX_IMAGE:-}" ] \
    || fail "POSTGRES_IMAGE ou BUSYBOX_IMAGE absent de VERSION"
  [ -s "${PKG_DIR}/images/images.tar.gz" ] || fail "Archive d'images absente du package"
else
  [ ! -e "${PKG_DIR}/images/images.tar.gz" ] || fail "Archive d'images inattendue dans le package sans images"
  [ -z "${K3S_BINARY:-}" ] || fail "Un package sans images ne peut pas embarquer k3s"
fi
if [ -n "${K3S_BINARY:-}" ]; then
  [ "${K3S_VERSION:-}" = "v1.36.6+k3s1" ] \
    || fail "Version k3s non validée pour ce bundle d'images personnalisé"
  [[ "${K3S_SOURCE_IMAGES_SHA256:-}" =~ ^[0-9a-f]{64}$ ]] \
    || fail "K3S_SOURCE_IMAGES_SHA256 absent ou invalide dans VERSION"
  [ -f "${PKG_DIR}/k3s/k3s-airgap-images-${K3S_ARCH}.tar.gz" ] \
    || fail "Archive d'images k3s personnalisée absente"
  [ -f "${PKG_DIR}/k3s/K3S-IMAGE-OVERRIDES.txt" ] \
    || fail "Provenance des images k3s absente"
elif [ -n "${K3S_SOURCE_IMAGES_SHA256:-}" ]; then
  fail "K3S_SOURCE_IMAGES_SHA256 doit être vide si k3s n'est pas inclus"
fi
if [ -f "${PKG_DIR}/config.env" ]; then
  log "Configuration : config.env"
  chmod 600 "${PKG_DIR}/config.env" || fail "Impossible de protéger config.env (droits 600 requis)"
  read_key_value_file "${PKG_DIR}/config.env" \
    "KUBECONFIG,K3S_INSTALL,K3S_EXTRA_ARGS,REGISTRY,API_IMAGE,WEB_IMAGE,POSTGRES_IMAGE,BUSYBOX_IMAGE,NAMESPACE,DOMAIN,LETSENCRYPT_EMAIL,CERT_MANAGER_ISSUER,TLS_CERT_FILE,TLS_KEY_FILE,TLS_SELF_SIGNED,AWX_BASE_URL,AWX_CLIENT_ID,AWX_CLIENT_SECRET,AWX_ADMIN_USERS,ASCENDER_CA_FILE,SESSION_IDLE_MINUTES,SESSION_TTL_HOURS,INGRESS_NAMESPACE,API_EGRESS_CIDR,CONNECTOR_ALLOWED_HOSTS,SMTP_HOST,SMTP_PORT,SMTP_SECURE,SMTP_USER,SMTP_PASSWORD,ALERT_EMAIL_TO,ALERT_EMAIL_FROM,PORTAL_URL,AWX_REDIRECT_URI,AWX_SCOPES,TOKEN_ENCRYPTION_KEY,TOKEN_ENCRYPTION_KEYS_PREVIOUS,FORCE_DB_PASSWORD,ALLOWED_ORIGINS,API_URL,BASE_PATH,DB_NAME,DB_USER,RESEND_API_KEY,ALLOW_EXTERNAL_MAIL"
else
  fail "config.env requis : copier config.env.example et renseigner les paramètres de production"
fi
# La version vient du package ; config.env ne peut pas la remplacer.
TAG="${PACKAGE_TAG}"
image_ref() {
  local name="$1"
  if [ -n "${REGISTRY:-}" ]; then printf '%s/%s:%s' "${REGISTRY%/}" "${name}" "${TAG}"
  else printf '%s:%s' "${name}" "${TAG}"
  fi
}
if [ "${INCLUDE_IMAGES}" = false ]; then
  if [ -n "${REGISTRY:-}" ]; then
    API_IMAGE="${API_IMAGE:-$(image_ref asp-api)}"
    WEB_IMAGE="${WEB_IMAGE:-$(image_ref asp-web)}"
    POSTGRES_IMAGE="${POSTGRES_IMAGE:-$(image_ref asp-postgres)}"
  else
    API_IMAGE="${API_IMAGE:-${PACKAGE_API_IMAGE:-$(image_ref asp-api)}}"
    WEB_IMAGE="${WEB_IMAGE:-${PACKAGE_WEB_IMAGE:-$(image_ref asp-web)}}"
    POSTGRES_IMAGE="${POSTGRES_IMAGE:-${PACKAGE_POSTGRES_IMAGE:-$(image_ref asp-postgres)}}"
  fi
  BUSYBOX_IMAGE="${BUSYBOX_IMAGE:-${PACKAGE_BUSYBOX_IMAGE:-busybox:1.36.1@sha256:73aaf090f3d85aa34ee199857f03fa3a95c8ede2ffd4cc2cdb5b94e566b11662}}"
fi
[ -n "${API_EGRESS_CIDR:-}" ] || fail "API_EGRESS_CIDR doit limiter l'egress aux réseaux Ascender, SMTP et connecteurs"
case "${API_EGRESS_CIDR}" in 0.0.0.0/0|::/0) fail "API_EGRESS_CIDR ne peut pas être ouvert à tous les réseaux en production" ;; esac
if [ "${BUILD_FROM_SOURCE}" = true ]; then
  ok "Package ${TAG} intègre (construction depuis les sources)"
else
  ok "Package ${TAG} intègre"
fi

# ---------------------------------------------------------------------------
# Cluster k3s (VM vierge)
# ---------------------------------------------------------------------------
# auto : installé si aucun cluster n'est configuré (ni KUBECONFIG, ni
# ~/.kube/config, ni k3s / microk8s présent) et que le package l'embarque.
K3S_INSTALL="${K3S_INSTALL:-auto}"
if [ "${K3S_INSTALL}" = auto ]; then
  K3S_INSTALL=false
  if [ -n "${K3S_BINARY:-}" ] && [ -z "${KUBECONFIG:-}" ] && [ ! -f "${HOME}/.kube/config" ] \
     && ! command -v k3s >/dev/null 2>&1 && ! command -v microk8s >/dev/null 2>&1; then
    K3S_INSTALL=true
  fi
fi

if [ "${K3S_INSTALL}" = true ]; then
  [ -n "${K3S_BINARY:-}" ] || fail "k3s n'est pas inclus dans ce package (construit avec BUNDLE_K3S=false)"
  [ "$(uname -s)" = Linux ] || fail "k3s s'installe uniquement sous Linux"
  case "$(uname -m)" in
    x86_64|amd64)  NODE_ARCH=amd64 ;;
    aarch64|arm64) NODE_ARCH=arm64 ;;
    *)             NODE_ARCH="$(uname -m)" ;;
  esac
  [ "${NODE_ARCH}" = "${K3S_ARCH}" ] || fail "Package construit pour ${K3S_ARCH}, machine ${NODE_ARCH} (PLATFORM=linux/${NODE_ARCH} au packaging)"

  log "Installation de k3s ${K3S_VERSION} (hors ligne)"
  as_root install -m 755 "${PKG_DIR}/k3s/${K3S_BINARY}" /usr/local/bin/k3s
  as_root mkdir -p /var/lib/rancher/k3s/agent/images
  as_root cp "${PKG_DIR}/k3s/k3s-airgap-images-${K3S_ARCH}.tar.gz" /var/lib/rancher/k3s/agent/images/
  # Traefik : adresse IP réelle des clients conservée (journal d'audit,
  # limites par adresse) au lieu de celle du nœud.
  as_root mkdir -p /var/lib/rancher/k3s/server/manifests
  as_root tee /var/lib/rancher/k3s/server/manifests/traefik-config.yaml >/dev/null <<'YAML'
apiVersion: helm.cattle.io/v1
kind: HelmChartConfig
metadata:
  name: traefik
  namespace: kube-system
spec:
  valuesContent: |-
    service:
      spec:
        externalTrafficPolicy: Local
YAML
  as_root env INSTALL_K3S_SKIP_DOWNLOAD=true \
    INSTALL_K3S_SKIP_SELINUX_RPM=true INSTALL_K3S_SELINUX_WARN=true \
    INSTALL_K3S_EXEC="server --write-kubeconfig-mode=600 --secrets-encryption ${K3S_EXTRA_ARGS:-}" \
    sh "${PKG_DIR}/k3s/install.sh"

  log "Attente du nœud k3s"
  for _ in $(seq 1 60); do
    as_root k3s kubectl get nodes --no-headers 2>/dev/null | grep -q ' Ready' && break
    sleep 3
  done
  as_root k3s kubectl get nodes --no-headers 2>/dev/null | grep -q ' Ready' \
    || fail "Nœud k3s non prêt après 3 min : journalctl -u k3s"
  as_root k3s kubectl -n kube-system rollout status deployment/coredns --timeout=180s >/dev/null \
    || fail "CoreDNS non prêt : sudo k3s kubectl -n kube-system get pods"

  # Traefik est installé par un job Helm de k3s après le démarrage du nœud.
  log "Attente de Traefik (contrôleur Ingress, ports 80/443 de la machine)"
  for _ in $(seq 1 100); do
    as_root k3s kubectl get crd middlewares.traefik.io >/dev/null 2>&1 \
      && as_root k3s kubectl -n kube-system get deployment/traefik >/dev/null 2>&1 && break
    sleep 3
  done
  as_root k3s kubectl -n kube-system rollout status deployment/traefik --timeout=300s >/dev/null \
    || fail "Traefik non prêt : sudo k3s kubectl -n kube-system get pods,jobs"
  ok "k3s ${K3S_VERSION} opérationnel (Traefik prêt)"

  # API Kubernetes (6443) et kubelet (10250) écoutent sur toutes les
  # interfaces : authentifiés, mais à ne pas exposer hors de la VM.
  warn "Pare-feu : n'exposer que 443 et 80/tcp (et SSH) ; bloquer 6443 et 10250 depuis l'extérieur"
  if command -v firewall-cmd >/dev/null 2>&1 && as_root firewall-cmd --state >/dev/null 2>&1; then
    warn "firewalld actif : ouvre 80/tcp et 443/tcp, et autorise les réseaux 10.42.0.0/16 et 10.43.0.0/16 (pods k3s)"
  fi
  if command -v ufw >/dev/null 2>&1 && as_root ufw status 2>/dev/null | grep -q 'Status: active'; then
    warn "ufw actif : ouvre 80/tcp et 443/tcp, et autorise 10.42.0.0/16 et 10.43.0.0/16 (pods k3s)"
  fi
fi

command -v kubectl >/dev/null 2>&1 || fail "kubectl est introuvable"

# ---------------------------------------------------------------------------
# Accès au cluster (kubeconfig)
# ---------------------------------------------------------------------------
# Ordre : KUBECONFIG (config.env ou environnement), ~/.kube/config, puis le
# kubeconfig du nœud k3s / microk8s. Une copie temporaire (lue avec sudo si
# besoin) est supprimée en fin d'installation.
if [ -n "${KUBECONFIG:-}" ]; then
  for f in ${KUBECONFIG//:/ }; do
    [ -r "$f" ] || fail "KUBECONFIG : fichier ${f} introuvable ou illisible"
  done
  export KUBECONFIG
elif [ ! -f "${HOME}/.kube/config" ]; then
  if [ -f /etc/rancher/k3s/k3s.yaml ]; then
    log "kubeconfig : nœud k3s (/etc/rancher/k3s/k3s.yaml)"
    if [ -r /etc/rancher/k3s/k3s.yaml ]; then
      export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
    else
      as_root cat /etc/rancher/k3s/k3s.yaml > "${TMP_DIR}/kubeconfig"
      export KUBECONFIG="${TMP_DIR}/kubeconfig"
    fi
  elif command -v microk8s >/dev/null 2>&1; then
    log "kubeconfig : nœud microk8s"
    microk8s config > "${TMP_DIR}/kubeconfig"
    export KUBECONFIG="${TMP_DIR}/kubeconfig"
  else
    fail "Aucun kubeconfig : renseigne KUBECONFIG dans config.env (chemin du fichier fourni par l'administrateur du cluster) ou copie-le dans ~/.kube/config"
  fi
fi
if ! KUBECTL_ERR="$(kubectl cluster-info 2>&1 >/dev/null)"; then
  fail "Cluster injoignable avec le kubeconfig ${KUBECONFIG:-~/.kube/config} : ${KUBECTL_ERR##*$'\n'}"
fi
ok "Cluster : $(kubectl config current-context)"

# ---------------------------------------------------------------------------
# Chargement ou résolution des images
# ---------------------------------------------------------------------------
REGISTRY="${REGISTRY:-}"
if [ "${INCLUDE_IMAGES}" = false ]; then
  log "Images fournies par l'environnement : ${API_IMAGE}, ${WEB_IMAGE}, ${POSTGRES_IMAGE}, ${BUSYBOX_IMAGE}"
elif [ -n "${REGISTRY}" ]; then
  command -v docker >/dev/null 2>&1 || fail "docker est requis pour pousser vers ${REGISTRY}"
  log "Chargement des images dans Docker"
  gunzip -c "${ARCHIVE}" | docker load >/dev/null
  for image in "${API_IMAGE}" "${WEB_IMAGE}" "${POSTGRES_IMAGE}"; do
    log "Push de ${REGISTRY}/${image}"
    docker tag "${image}" "${REGISTRY}/${image}"
    docker push "${REGISTRY}/${image}"
  done
  POSTGRES_IMAGE="${REGISTRY}/asp-postgres:${TAG}"
  export POSTGRES_IMAGE
  warn "${THIRD_PARTY_IMAGES} : récupérées depuis Docker Hub par le cluster"
elif command -v k3s >/dev/null 2>&1; then
  log "Import des images dans k3s (containerd)"
  gunzip -c "${ARCHIVE}" | as_root k3s ctr images import - >/dev/null
elif command -v microk8s >/dev/null 2>&1; then
  log "Import des images dans microk8s"
  gunzip -c "${ARCHIVE}" | microk8s ctr image import - >/dev/null
elif command -v docker >/dev/null 2>&1; then
  log "Chargement des images dans Docker (Docker Desktop / nœud Docker)"
  gunzip -c "${ARCHIVE}" | docker load >/dev/null
  if [ "$(kubectl get nodes --no-headers 2>/dev/null | wc -l)" -gt 1 ]; then
    warn "Cluster multi-nœuds sans REGISTRY : seules les machines ayant chargé les images pourront lancer les pods"
  fi
else
  fail "Impossible de charger les images : définis REGISTRY ou installe docker / k3s / microk8s"
fi
ok "Images disponibles : ${API_IMAGE}, ${WEB_IMAGE}"

# ---------------------------------------------------------------------------
# Certificat auto-signé (tests, réseau interne sans autorité)
# ---------------------------------------------------------------------------
# Généré à la première installation seulement : ensuite le secret TLS existant
# est réutilisé par deploy.sh.
if [ "${TLS_SELF_SIGNED:-false}" = true ] && [ -n "${DOMAIN:-}" ] && [ -z "${TLS_CERT_FILE:-}" ] \
   && ! kubectl -n "${NAMESPACE:-asp-portal}" get secret asp-portal-tls >/dev/null 2>&1; then
  log "Certificat auto-signé pour ${DOMAIN} (les navigateurs afficheront un avertissement)"
  openssl req -x509 -newkey rsa:2048 -nodes -days 825 -subj "/CN=${DOMAIN}" \
    -addext "subjectAltName=DNS:${DOMAIN}" \
    -keyout "${TMP_DIR}/tls.key" -out "${TMP_DIR}/tls.crt" >/dev/null 2>&1 \
    || fail "Génération du certificat auto-signé impossible (openssl 1.1.1 ou plus requis)"
  export TLS_CERT_FILE="${TMP_DIR}/tls.crt" TLS_KEY_FILE="${TMP_DIR}/tls.key"
fi

# ---------------------------------------------------------------------------
# Déploiement
# ---------------------------------------------------------------------------
export TAG REGISTRY API_IMAGE WEB_IMAGE POSTGRES_IMAGE BUSYBOX_IMAGE
# Images tierces importées depuis le package (intégrité vérifiée par
# SHA256SUMS) : référencées par leur tag exact. Avec REGISTRY, le cluster les
# récupère sur Docker Hub, épinglées par empreinte (valeurs de deploy.sh).
if [ -z "${REGISTRY}" ]; then
  export POSTGRES_IMAGE BUSYBOX_IMAGE
fi
# Sans exec : le trap doit supprimer les fichiers temporaires à la fin.
if [ "${BUILD_FROM_SOURCE}" = true ]; then
  bash "${PKG_DIR}/deploy/deploy.sh" "$@"
else
  bash "${PKG_DIR}/deploy/deploy.sh" --skip-build "$@"
fi
