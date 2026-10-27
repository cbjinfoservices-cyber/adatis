#!/usr/bin/env bash
# =============================================================================
# ASP Automation Service Portal — installation depuis le package de production
#
#   cp config.env.example config.env    # renseigner domaine, HTTPS, Ascender…
#   ./install.sh                        # charge les images puis déploie
#   ./install.sh --no-ingress           # options transmises à deploy/deploy.sh
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

# shellcheck source=/dev/null
. "${PKG_DIR}/VERSION"

if [ -f "${PKG_DIR}/config.env" ]; then
  log "Configuration : config.env"
  # Secrets (AWX_CLIENT_SECRET, SMTP…) : lisible par son propriétaire seul.
  if [ -n "$(find "${PKG_DIR}/config.env" -perm /077 2>/dev/null)" ]; then
    chmod 600 "${PKG_DIR}/config.env"
    warn "config.env était lisible par d'autres utilisateurs : droits ramenés à 600"
  fi
  set -a
  # shellcheck source=/dev/null
  . "${PKG_DIR}/config.env"
  set +a
else
  warn "config.env absent : valeurs par défaut (portail sans domaine ni SSO)"
fi

for cmd in sha256sum gunzip openssl base64 sed; do
  command -v "${cmd}" >/dev/null 2>&1 || fail "${cmd} est introuvable"
done

log "Vérification de l'intégrité du package"
(cd "${PKG_DIR}" && sha256sum --quiet -c SHA256SUMS) || fail "SHA256SUMS : package altéré ou incomplet"
ok "Package ${TAG} intègre"

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
  as_root cp "${PKG_DIR}/k3s/k3s-airgap-images-${K3S_ARCH}.tar.zst" /var/lib/rancher/k3s/agent/images/
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
# Chargement des images
# ---------------------------------------------------------------------------
REGISTRY="${REGISTRY:-}"
if [ -n "${REGISTRY}" ]; then
  command -v docker >/dev/null 2>&1 || fail "docker est requis pour pousser vers ${REGISTRY}"
  log "Chargement des images dans Docker"
  gunzip -c "${ARCHIVE}" | docker load >/dev/null
  for image in "${API_IMAGE}" "${WEB_IMAGE}"; do
    log "Push de ${REGISTRY}/${image}"
    docker tag "${image}" "${REGISTRY}/${image}"
    docker push "${REGISTRY}/${image}"
  done
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
export TAG REGISTRY
# Images tierces importées depuis le package (intégrité vérifiée par
# SHA256SUMS) : référencées par leur tag exact. Avec REGISTRY, le cluster les
# récupère sur Docker Hub, épinglées par empreinte (valeurs de deploy.sh).
if [ -z "${REGISTRY}" ]; then
  export POSTGRES_IMAGE BUSYBOX_IMAGE
fi
# Sans exec : le trap doit supprimer les fichiers temporaires à la fin.
"${PKG_DIR}/deploy/deploy.sh" --skip-build "$@"
