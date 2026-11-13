#!/usr/bin/env bash
# =============================================================================
# ASP Automation Service Portal — package de production (Kubernetes, hors ligne)
#
#   ./scripts/package.sh                 # dist/asp-portal-<version>.tar.gz
#   TAG=1.2.0 ./scripts/package.sh       # version imposée
#   BASE_PATH=/portal/ ./scripts/package.sh
#   PLATFORM=linux/arm64 ./scripts/package.sh   # nœuds ARM (défaut : linux/amd64)
#   BUNDLE_K3S=false ./scripts/package.sh       # sans k3s (cluster existant uniquement)
#   INCLUDE_IMAGES=false BUNDLE_K3S=false ./scripts/package.sh # sans images ni k3s
#   BUILD_FROM_SOURCE=true INCLUDE_IMAGES=false ./scripts/package.sh # sources, build à l'installation
#   BUILD_CA_CERT=ca.pem ./scripts/package.sh   # proxy / antivirus qui intercepte le HTTPS
#   COSIGN_KEY=cosign.key npm run package       # signature obligatoire en production
#   ALLOW_UNSIGNED=true npm run package         # uniquement pour les builds de test
#
# BUILD_CA_CERT : autorité (PEM) à laquelle faire confiance pendant le build
# des images (npm, apk). Transmise comme secret BuildKit : elle n'est écrite
# dans aucune couche, les images livrées ne la contiennent pas.
#
# Le package contient les manifestes deploy/k8s, deploy.sh et les scripts SQL.
# INCLUDE_IMAGES=false permet de réutiliser des images existantes ; avec
# BUILD_FROM_SOURCE=true, les sources sont incluses et les images construites à l'installation.
#
# Il embarque aussi k3s (binaire + images hors ligne, Traefik compris) : sur
# une VM Linux vierge, install.sh installe le cluster.
#
# Prérequis : tar, gzip, sha256sum, cosign (sauf build de test) ; Docker et
# curl seulement si des images ou k3s sont inclus.
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_PATH="${BASE_PATH:-/}"
PLATFORM="${PLATFORM:-linux/amd64}"
# Image tierce épinglée par empreinte, exportée sous son tag exact.
BUSYBOX_PIN="busybox:1.36.1@sha256:73aaf090f3d85aa34ee199857f03fa3a95c8ede2ffd4cc2cdb5b94e566b11662"
BUSYBOX_IMAGE="${BUSYBOX_PIN%@*}"
THIRD_PARTY_IMAGES="${BUSYBOX_IMAGE}"
# Cluster embarqué pour VM vierge : k3s, empreintes vérifiées contre la release.
BUNDLE_K3S="${BUNDLE_K3S:-true}"
INCLUDE_IMAGES="${INCLUDE_IMAGES:-true}"
BUILD_FROM_SOURCE="${BUILD_FROM_SOURCE:-false}"
K3S_VERSION="${K3S_VERSION:-v1.36.6+k3s1}"
# Script d'installation (exécuté en root sur la VM) : absent des empreintes de
# la release, donc épinglé ici. À mettre à jour avec K3S_VERSION.
K3S_INSTALL_SH_SHA256="${K3S_INSTALL_SH_SHA256:-46177d4c99440b4c0311b67233823a8e8a2fc09693f6c89af1a7161e152fbfad}"
K3S_KLIPPER_HELM_PIN="rancher/klipper-helm@sha256:e2289066485f0bd74730401d3fbd91f6918c5e5bd100943aa743b6f39dfc3019"
K3S_KLIPPER_LB_PIN="rancher/klipper-lb@sha256:fb8981e8c235a6e276dc94033948e60f1a82219c579629b957dfa1d640b64a72"
K3S_LOCAL_PATH_IMAGE="asp-k3s-local-path:v0.0.37-asp1"
K3S_SOURCE_IMAGES_SHA256=""
K3S_SYSTEM_IMAGES=(
  "rancher/klipper-helm:v0.13.3-build20261021"
  "rancher/klipper-lb:v0.4.17"
  "rancher/local-path-provisioner:v0.0.37"
  "rancher/mirrored-coredns-coredns:1.14.7"
  "rancher/mirrored-library-busybox:1.37.0"
  "rancher/mirrored-library-traefik:3.7.15"
  "rancher/mirrored-metrics-server:v0.9.0"
  "rancher/mirrored-pause:3.10.2"
)
ALLOW_UNSIGNED="${ALLOW_UNSIGNED:-false}"

C_RESET='\033[0m'; C_INFO='\033[0;36m'; C_OK='\033[0;32m'; C_WARN='\033[0;33m'; C_ERR='\033[0;31m'
log()  { printf "${C_INFO}▸ %s${C_RESET}\n" "$*"; }
ok()   { printf "${C_OK}✔ %s${C_RESET}\n" "$*"; }
warn() { printf "${C_WARN}! %s${C_RESET}\n" "$*"; }
fail() { printf "${C_ERR}✖ %s${C_RESET}\n" "$*" >&2; exit 1; }

if [ "${ALLOW_UNSIGNED}" = true ] && [ -n "${COSIGN_KEY:-}" ]; then
  fail "Choisir COSIGN_KEY ou ALLOW_UNSIGNED=true, pas les deux"
fi
if [ -z "${COSIGN_KEY:-}" ] && [ "${ALLOW_UNSIGNED}" != true ]; then
  fail "Signature obligatoire pour un package de production : définir COSIGN_KEY (ALLOW_UNSIGNED=true réservé aux tests)"
fi
if [ -n "${COSIGN_KEY:-}" ]; then
  command -v cosign >/dev/null 2>&1 || fail "COSIGN_KEY fourni mais cosign est introuvable"
fi

case "${INCLUDE_IMAGES}" in true|false) ;; *) fail "INCLUDE_IMAGES doit valoir true ou false" ;; esac
case "${BUILD_FROM_SOURCE}" in true|false) ;; *) fail "BUILD_FROM_SOURCE doit valoir true ou false" ;; esac
if [ "${BUILD_FROM_SOURCE}" = true ]; then
  [ "${INCLUDE_IMAGES}" = false ] || fail "BUILD_FROM_SOURCE=true requiert INCLUDE_IMAGES=false"
  BUNDLE_K3S=false
fi
if [ "${INCLUDE_IMAGES}" = false ]; then
  [ "${BUNDLE_K3S}" = true ] && warn "INCLUDE_IMAGES=false : k3s est désactivé (cluster existant requis)"
  BUNDLE_K3S=false
fi
if [ "${INCLUDE_IMAGES}" = true ] || [ "${BUNDLE_K3S}" = true ]; then
  command -v docker >/dev/null 2>&1 || fail "docker est introuvable"
  docker info >/dev/null 2>&1 || fail "le démon Docker ne répond pas"
fi

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
[[ "${TAG}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || fail "TAG invalide : seuls lettres, chiffres, point, tiret et underscore sont acceptés"

NAME="asp-portal-${TAG}"
OUT_DIR="${ROOT_DIR}/dist"
STAGE="${OUT_DIR}/${NAME}"
API_IMAGE="${API_IMAGE:-asp-api:${TAG}}"
WEB_IMAGE="${WEB_IMAGE:-asp-web:${TAG}}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-asp-postgres:${TAG}}"

BUILD_SECRET=()
if [ -n "${BUILD_CA_CERT:-}" ]; then
  [ -f "${BUILD_CA_CERT}" ] || fail "BUILD_CA_CERT : fichier introuvable (${BUILD_CA_CERT})"
  grep -q "BEGIN CERTIFICATE" "${BUILD_CA_CERT}" || fail "BUILD_CA_CERT : certificat PEM attendu"
  # Docker Desktop (Windows) attend un chemin Windows.
  CA_SRC="$(cygpath -w "${BUILD_CA_CERT}" 2>/dev/null || echo "${BUILD_CA_CERT}")"
  BUILD_SECRET=(--secret "id=build_ca,src=${CA_SRC}")
  warn "Autorité supplémentaire pour le build : ${BUILD_CA_CERT} (absente des images livrées)"
fi

rm -rf "${STAGE}"
mkdir -p "${STAGE}"

if [ "${INCLUDE_IMAGES}" = true ]; then
  mkdir -p "${STAGE}/images"
  log "Construction de l'image API (${API_IMAGE})"
  docker build "${BUILD_SECRET[@]}" --pull --no-cache --platform "${PLATFORM}" -t "${API_IMAGE}" -f "${ROOT_DIR}/api/Dockerfile" "${ROOT_DIR}/api"

  log "Construction de l'image frontend (${WEB_IMAGE}) — BASE_PATH=${BASE_PATH}"
  # Git Bash (Windows) convertirait BASE_PATH=/ en chemin Windows.
  MSYS2_ARG_CONV_EXCL="BASE_PATH=" docker build "${BUILD_SECRET[@]}" --pull --no-cache --platform "${PLATFORM}" --build-arg "BASE_PATH=${BASE_PATH}" -t "${WEB_IMAGE}" -f "${ROOT_DIR}/Dockerfile" "${ROOT_DIR}"

  log "Construction de l'image PostgreSQL durcie (${POSTGRES_IMAGE})"
  docker build "${BUILD_SECRET[@]}" --pull --no-cache --platform "${PLATFORM}" -t "${POSTGRES_IMAGE}" -f "${ROOT_DIR}/deploy/package/postgres.Dockerfile" "${ROOT_DIR}"

  for pin in "${BUSYBOX_PIN}"; do
    log "Récupération de ${pin}"
    for attempt in 1 2 3; do
      docker pull --quiet --platform "${PLATFORM}" "${pin}" >/dev/null && break
      [ "${attempt}" -eq 3 ] && fail "Téléchargement de ${pin} impossible"
      warn "Échec du téléchargement, nouvelle tentative (${attempt}/3)"
      sleep 5
    done
    docker tag "${pin}" "${pin%@*}"
  done
fi

download() {
  curl -fsSL --retry 3 --retry-delay 5 -o "$2" "$1" || fail "Téléchargement impossible : $1"
}

K3S_ARCH=""; K3S_BINARY=""
if [ "${BUNDLE_K3S}" = true ]; then
  command -v curl >/dev/null 2>&1 || fail "curl est introuvable"
  command -v docker >/dev/null 2>&1 || fail "docker est introuvable"
  [ "${K3S_VERSION}" = "v1.36.6+k3s1" ] \
    || fail "Les overrides d'images K3s sont validés uniquement pour v1.36.6+k3s1"
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
  K3S_SOURCE_IMAGES_SHA256="$(sha256sum "${K3S_DIR}/k3s-airgap-images-${K3S_ARCH}.tar.zst" | awk '{print $1}')"
  log "Chargement de l'archive officielle des images k3s"
  docker image load -i "${K3S_DIR}/k3s-airgap-images-${K3S_ARCH}.tar.zst" >/dev/null
  for image in "${K3S_SYSTEM_IMAGES[@]}"; do
    docker image inspect "${image}" >/dev/null 2>&1 || fail "Image système absente de l'archive k3s : ${image}"
    image_platform="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "${image}")"
    [ "${image_platform}" = "${PLATFORM}" ] || fail "Plateforme inattendue pour ${image} : ${image_platform}"
  done
  for pin in "${K3S_KLIPPER_HELM_PIN}" "${K3S_KLIPPER_LB_PIN}"; do
    docker pull --platform "${PLATFORM}" "${pin}" >/dev/null \
      || fail "Téléchargement de l'image k3s corrigée impossible : ${pin}"
  done
  docker tag "${K3S_KLIPPER_HELM_PIN}" "${K3S_SYSTEM_IMAGES[0]}"
  docker tag "${K3S_KLIPPER_LB_PIN}" "${K3S_SYSTEM_IMAGES[1]}"
  log "Construction de l'image local-path-provisioner durcie"
  docker build --pull --no-cache --platform "${PLATFORM}" \
    -t "${K3S_LOCAL_PATH_IMAGE}" \
    -f "${ROOT_DIR}/deploy/package/k3s-local-path.Dockerfile" \
    "${ROOT_DIR}/deploy/package"
  docker tag "${K3S_LOCAL_PATH_IMAGE}" "${K3S_SYSTEM_IMAGES[2]}"
  for image in "${K3S_SYSTEM_IMAGES[@]}"; do
    docker image inspect "${image}" >/dev/null 2>&1 || fail "Image système k3s indisponible : ${image}"
    image_platform="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "${image}")"
    [ "${image_platform}" = "${PLATFORM}" ] || fail "Plateforme inattendue pour ${image} : ${image_platform}"
  done
  log "Recréation de l'archive air-gap avec les overrides tracés"
  docker image save --platform "${PLATFORM}" "${K3S_SYSTEM_IMAGES[@]}" \
    | gzip > "${K3S_DIR}/k3s-airgap-images-${K3S_ARCH}.tar.gz"
  rm "${K3S_DIR}/k3s-airgap-images-${K3S_ARCH}.tar.zst"
  rm "${K3S_DIR}/sha256sum-${K3S_ARCH}.txt"
  download "https://raw.githubusercontent.com/k3s-io/k3s/${K3S_VERSION}/install.sh" "${K3S_DIR}/install.sh"
  echo "${K3S_INSTALL_SH_SHA256}  ${K3S_DIR}/install.sh" | sha256sum --quiet -c - \
    || fail "k3s install.sh : empreinte différente de K3S_INSTALL_SH_SHA256 (script modifié, ou K3S_VERSION changée sans mettre à jour l'empreinte)"
  ok "k3s ${K3S_VERSION} vérifié"
  cp "${ROOT_DIR}/deploy/package/K3S-IMAGE-OVERRIDES.txt" "${K3S_DIR}/"
fi

if [ "${INCLUDE_IMAGES}" = true ]; then
  log "Export des images"
  # shellcheck disable=SC2086
  docker save --platform "${PLATFORM}" ${API_IMAGE} ${WEB_IMAGE} "${POSTGRES_IMAGE}" ${THIRD_PARTY_IMAGES} | gzip > "${STAGE}/images/images.tar.gz"
  ok "Images exportées ($(du -h "${STAGE}/images/images.tar.gz" | cut -f1))"
else
  ok "Package sans images : les références sont fournies à l'installation"
fi

log "Copie des manifestes, scripts SQL et du script de déploiement"
mkdir -p "${STAGE}/deploy"
cp -R "${ROOT_DIR}/deploy/k8s" "${STAGE}/deploy/"
cp "${ROOT_DIR}/deploy/deploy.sh" "${ROOT_DIR}/deploy/README.md" "${STAGE}/deploy/"
cp -R "${ROOT_DIR}/db" "${STAGE}/"
cp "${ROOT_DIR}/deploy/package/install.sh" "${ROOT_DIR}/deploy/package/config.env.example" \
   "${ROOT_DIR}/deploy/package/INSTALL.md" "${STAGE}/"
if [ "${BUILD_FROM_SOURCE}" = true ]; then
  log "Copie des sources applicatives et des Dockerfiles"
  cp "${ROOT_DIR}/.dockerignore" "${ROOT_DIR}/Dockerfile" "${ROOT_DIR}/index.html" \
    "${ROOT_DIR}/package.json" "${ROOT_DIR}/package-lock.json" "${ROOT_DIR}/postcss.config.ts" \
    "${ROOT_DIR}/tailwind.config.ts" "${ROOT_DIR}/tsconfig.app.json" "${ROOT_DIR}/tsconfig.json" \
    "${ROOT_DIR}/tsconfig.node.json" "${ROOT_DIR}/vite-env.d.ts" "${ROOT_DIR}/vite.config.ts" "${STAGE}/"
  cp -R "${ROOT_DIR}/public" "${ROOT_DIR}/src" "${STAGE}/"
  mkdir -p "${STAGE}/api" "${STAGE}/deploy/package"
  cp "${ROOT_DIR}/api/.dockerignore" "${ROOT_DIR}/api/Dockerfile" \
    "${ROOT_DIR}/api/package.json" "${ROOT_DIR}/api/package-lock.json" "${STAGE}/api/"
  cp -R "${ROOT_DIR}/api/scripts" "${ROOT_DIR}/api/src" "${STAGE}/api/"
  cp "${ROOT_DIR}/deploy/nginx.conf" "${STAGE}/deploy/"
  cp "${ROOT_DIR}/deploy/package/postgres.Dockerfile" "${STAGE}/deploy/package/"
fi
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
K3S_SOURCE_IMAGES_SHA256=${K3S_SOURCE_IMAGES_SHA256}
BASE_PATH=${BASE_PATH}
PLATFORM=${PLATFORM}
INCLUDE_IMAGES=${INCLUDE_IMAGES}
BUILD_FROM_SOURCE=${BUILD_FROM_SOURCE}
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
  log "Signature de l'archive (cosign)"
  cosign sign-blob --yes --key "${COSIGN_KEY}" --bundle "${OUT_DIR}/${NAME}.tar.gz.sigstore.json" \
    "${OUT_DIR}/${NAME}.tar.gz" >/dev/null
  ok "Signature : dist/${NAME}.tar.gz.sigstore.json"
else
  warn "ALLOW_UNSIGNED=true : build de test non signé"
fi

ok "Package prêt : dist/${NAME}.tar.gz ($(du -h "${OUT_DIR}/${NAME}.tar.gz" | cut -f1))"
printf "  Sur la machine de production :\n"
if [ -n "${COSIGN_KEY:-}" ]; then
  printf "    cosign verify-blob --key cosign.pub --bundle %s.tar.gz.sigstore.json %s.tar.gz\n" "${NAME}" "${NAME}"
else
  printf "    sha256sum -c %s.tar.gz.sha256\n" "${NAME}"
fi
printf "    tar xzf %s.tar.gz && cd %s\n" "${NAME}" "${NAME}"
printf "    cp config.env.example config.env   # puis renseigner\n"
if [ "${BUILD_FROM_SOURCE}" = true ]; then
  printf "    ./install.sh                       # construit les images depuis les sources puis déploie\n"
elif [ "${INCLUDE_IMAGES}" = true ]; then
  printf "    sudo ./install.sh                  # charge les images puis déploie\n"
else
  printf "    ./install.sh                       # cluster existant ; configurer les références d'images\n"
fi
