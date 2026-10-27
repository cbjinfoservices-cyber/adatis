#!/usr/bin/env bash
# =============================================================================
# ASP Automation Service Portal — package de production (Kubernetes, hors ligne)
#
#   ./scripts/package.sh                 # dist/asp-portal-<version>.tar.gz
#   TAG=1.2.0 ./scripts/package.sh       # version imposée
#   BASE_PATH=/portal/ ./scripts/package.sh
#   PLATFORM=linux/arm64 ./scripts/package.sh   # nœuds ARM (défaut : linux/amd64)
#   BUNDLE_K3S=false ./scripts/package.sh       # sans k3s (cluster existant uniquement)
#
# Le package contient les images (API, frontend, PostgreSQL, busybox) en .tar,
# les manifestes deploy/k8s, deploy.sh, les scripts SQL et install.sh qui
# charge les images puis déploie (deploy.sh --skip-build). Aucun accès au
# dépôt Git ni à Internet n'est nécessaire sur la machine de production.
#
# Il embarque aussi k3s (binaire + images hors ligne, Traefik compris) : sur
# une VM Linux vierge, install.sh installe le cluster.
#
# Prérequis : docker, tar, gzip, curl, sha256sum.
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_PATH="${BASE_PATH:-/}"
PLATFORM="${PLATFORM:-linux/amd64}"
# Images tierces épinglées par empreinte, exportées sous leur tag exact.
POSTGRES_PIN="postgres:16.15-alpine@sha256:0cefaabd882e42bcb2a2f3dc56d3ce4770560ba62fd7f197f1a2e008fd5731ab"
BUSYBOX_PIN="busybox:1.36.1@sha256:73aaf090f3d85aa34ee199857f03fa3a95c8ede2ffd4cc2cdb5b94e566b11662"
POSTGRES_IMAGE="${POSTGRES_PIN%@*}"
BUSYBOX_IMAGE="${BUSYBOX_PIN%@*}"
THIRD_PARTY_IMAGES="${POSTGRES_IMAGE} ${BUSYBOX_IMAGE}"
# Cluster embarqué pour VM vierge : k3s, empreintes vérifiées contre la release.
BUNDLE_K3S="${BUNDLE_K3S:-true}"
K3S_VERSION="${K3S_VERSION:-v1.36.5+k3s1}"
# Script d'installation (exécuté en root sur la VM) : absent des empreintes de
# la release, donc épinglé ici. À mettre à jour avec K3S_VERSION.
K3S_INSTALL_SH_SHA256="${K3S_INSTALL_SH_SHA256:-46177d4c99440b4c0311b67233823a8e8a2fc09693f6c89af1a7161e152fbfad}"

C_RESET='\033[0m'; C_INFO='\033[0;36m'; C_OK='\033[0;32m'; C_WARN='\033[0;33m'; C_ERR='\033[0;31m'
log()  { printf "${C_INFO}▸ %s${C_RESET}\n" "$*"; }
ok()   { printf "${C_OK}✔ %s${C_RESET}\n" "$*"; }
warn() { printf "${C_WARN}! %s${C_RESET}\n" "$*"; }
fail() { printf "${C_ERR}✖ %s${C_RESET}\n" "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || fail "docker est introuvable"
docker info >/dev/null 2>&1 || fail "le démon Docker ne répond pas"

# Version : TAG fourni, sinon date + commit (+ -dirty si la copie de travail
# contient des modifications non commitées).
if [ -z "${TAG:-}" ]; then
  COMMIT="$(git -C "${ROOT_DIR}" rev-parse --short HEAD 2>/dev/null || echo local)"
  TAG="$(date +%Y%m%d-%H%M%S)-${COMMIT}"
  if [ -n "$(git -C "${ROOT_DIR}" status --porcelain 2>/dev/null)" ]; then
    TAG="${TAG}-dirty"
    warn "Modifications non commitées : elles sont incluses (version ${TAG})"
  fi
fi

NAME="asp-portal-${TAG}"
OUT_DIR="${ROOT_DIR}/dist"
STAGE="${OUT_DIR}/${NAME}"
API_IMAGE="asp-api:${TAG}"
WEB_IMAGE="asp-web:${TAG}"

rm -rf "${STAGE}"
mkdir -p "${STAGE}/images"

log "Construction de l'image API (${API_IMAGE})"
docker build --platform "${PLATFORM}" -t "${API_IMAGE}" -f "${ROOT_DIR}/api/Dockerfile" "${ROOT_DIR}/api"

log "Construction de l'image frontend (${WEB_IMAGE}) — BASE_PATH=${BASE_PATH}"
# Git Bash (Windows) convertirait BASE_PATH=/ en chemin Windows.
MSYS2_ARG_CONV_EXCL="BASE_PATH=" docker build --platform "${PLATFORM}" --build-arg "BASE_PATH=${BASE_PATH}" -t "${WEB_IMAGE}" -f "${ROOT_DIR}/Dockerfile" "${ROOT_DIR}"

for pin in "${POSTGRES_PIN}" "${BUSYBOX_PIN}"; do
  log "Récupération de ${pin}"
  for attempt in 1 2 3; do
    docker pull --quiet --platform "${PLATFORM}" "${pin}" >/dev/null && break
    [ "${attempt}" -eq 3 ] && fail "Téléchargement de ${pin} impossible"
    warn "Échec du téléchargement, nouvelle tentative (${attempt}/3)"
    sleep 5
  done
  # Le contenu vient de l'empreinte vérifiée ; le tag sert à l'import hors ligne.
  docker tag "${pin}" "${pin%@*}"
done

download() {
  curl -fsSL --retry 3 --retry-delay 5 -o "$2" "$1" || fail "Téléchargement impossible : $1"
}

K3S_ARCH=""; K3S_BINARY=""
if [ "${BUNDLE_K3S}" = true ]; then
  command -v curl >/dev/null 2>&1 || fail "curl est introuvable"
  case "${PLATFORM}" in
    linux/amd64) K3S_ARCH=amd64; K3S_BINARY=k3s ;;
    linux/arm64) K3S_ARCH=arm64; K3S_BINARY=k3s-arm64 ;;
    *) fail "k3s embarqué : plateforme ${PLATFORM} non prise en charge (BUNDLE_K3S=false)" ;;
  esac
  K3S_DIR="${STAGE}/k3s"
  mkdir -p "${K3S_DIR}"
  K3S_URL="https://github.com/k3s-io/k3s/releases/download/${K3S_VERSION//+/%2B}"
  log "Téléchargement de k3s ${K3S_VERSION} (${K3S_ARCH}, images hors ligne)"
  for asset in "${K3S_BINARY}" "k3s-airgap-images-${K3S_ARCH}.tar.zst" "sha256sum-${K3S_ARCH}.txt"; do
    download "${K3S_URL}/${asset}" "${K3S_DIR}/${asset}"
  done
  (cd "${K3S_DIR}" && grep -E "  (${K3S_BINARY}|k3s-airgap-images-${K3S_ARCH}\.tar\.zst)$" "sha256sum-${K3S_ARCH}.txt" | sha256sum --quiet -c -) \
    || fail "k3s : empreintes SHA-256 non conformes à la release ${K3S_VERSION}"
  rm "${K3S_DIR}/sha256sum-${K3S_ARCH}.txt"
  download "https://raw.githubusercontent.com/k3s-io/k3s/${K3S_VERSION}/install.sh" "${K3S_DIR}/install.sh"
  echo "${K3S_INSTALL_SH_SHA256}  ${K3S_DIR}/install.sh" | sha256sum --quiet -c - \
    || fail "k3s install.sh : empreinte différente de K3S_INSTALL_SH_SHA256 (script modifié, ou K3S_VERSION changée sans mettre à jour l'empreinte)"
  ok "k3s ${K3S_VERSION} vérifié"
fi

log "Export des images"
# shellcheck disable=SC2086
docker save --platform "${PLATFORM}" ${API_IMAGE} ${WEB_IMAGE} ${THIRD_PARTY_IMAGES} | gzip > "${STAGE}/images/images.tar.gz"
ok "Images exportées ($(du -h "${STAGE}/images/images.tar.gz" | cut -f1))"

log "Copie des manifestes, scripts SQL et du script de déploiement"
mkdir -p "${STAGE}/deploy"
cp -R "${ROOT_DIR}/deploy/k8s" "${STAGE}/deploy/"
cp "${ROOT_DIR}/deploy/deploy.sh" "${ROOT_DIR}/deploy/README.md" "${STAGE}/deploy/"
cp -R "${ROOT_DIR}/db" "${STAGE}/"
cp "${ROOT_DIR}/deploy/package/install.sh" "${ROOT_DIR}/deploy/package/config.env.example" \
   "${ROOT_DIR}/deploy/package/INSTALL.md" "${STAGE}/"
chmod +x "${STAGE}/install.sh" "${STAGE}/deploy/deploy.sh" "${STAGE}/db/migrate.sh"

cat > "${STAGE}/VERSION" <<EOF
TAG=${TAG}
API_IMAGE=${API_IMAGE}
WEB_IMAGE=${WEB_IMAGE}
THIRD_PARTY_IMAGES="${THIRD_PARTY_IMAGES}"
POSTGRES_IMAGE=${POSTGRES_IMAGE}
BUSYBOX_IMAGE=${BUSYBOX_IMAGE}
K3S_VERSION=${K3S_ARCH:+${K3S_VERSION}}
K3S_ARCH=${K3S_ARCH}
K3S_BINARY=${K3S_BINARY}
BASE_PATH=${BASE_PATH}
PLATFORM=${PLATFORM}
BUILT_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
COMMIT=$(git -C "${ROOT_DIR}" rev-parse HEAD 2>/dev/null || echo inconnu)
EOF

log "Archive"
(cd "${STAGE}" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
tar -C "${OUT_DIR}" -czf "${OUT_DIR}/${NAME}.tar.gz" "${NAME}"
rm -rf "${STAGE}"
(cd "${OUT_DIR}" && sha256sum "${NAME}.tar.gz" > "${NAME}.tar.gz.sha256")

# Signature de l'archive (cosign) : prouve sa provenance, au-delà de
# l'intégrité. COSIGN_KEY = clé privée cosign (fichier ou KMS).
if [ -n "${COSIGN_KEY:-}" ]; then
  command -v cosign >/dev/null 2>&1 || fail "COSIGN_KEY fourni mais cosign est introuvable"
  log "Signature de l'archive (cosign)"
  cosign sign-blob --yes --key "${COSIGN_KEY}" --output-signature "${OUT_DIR}/${NAME}.tar.gz.sig" \
    "${OUT_DIR}/${NAME}.tar.gz" >/dev/null
  ok "Signature : dist/${NAME}.tar.gz.sig"
else
  warn "COSIGN_KEY absent : archive non signée (empreinte seule : dist/${NAME}.tar.gz.sha256)"
fi

ok "Package prêt : dist/${NAME}.tar.gz ($(du -h "${OUT_DIR}/${NAME}.tar.gz" | cut -f1))"
printf "  Sur la machine de production :\n"
if [ -n "${COSIGN_KEY:-}" ]; then
  printf "    cosign verify-blob --key cosign.pub --signature %s.tar.gz.sig %s.tar.gz\n" "${NAME}" "${NAME}"
else
  printf "    sha256sum -c %s.tar.gz.sha256\n" "${NAME}"
fi
printf "    tar xzf %s.tar.gz && cd %s\n" "${NAME}" "${NAME}"
printf "    cp config.env.example config.env   # puis renseigner\n"
printf "    sudo ./install.sh                  # VM vierge : installe aussi k3s\n"
