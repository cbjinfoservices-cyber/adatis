# Images de base épinglées par empreinte (digest) : un tag republié ne peut
# pas changer le contenu construit. Mise à jour : voir deploy/README.md.
ARG NODE_IMAGE=node:24.22.1-alpine@sha256:1200d815de24f8dcca745fbf7651d166034a35adbcad8860a8538ffff44f1420
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.30.6-alpine@sha256:e2a8fca8aa356d66159aaf8a877a9c126773635adf210503eefaaeaffeed6ad7

# --- Étape 1 : build du SPA ---
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NODE_ENV=development

COPY package.json package-lock.json ./
# --ignore-scripts : aucun script d'installation de dépendance n'est exécuté.
# Secret build_ca (optionnel, BUILD_CA_CERT de scripts/package.sh) : autorité
# d'un proxy ou antivirus qui intercepte le HTTPS, montée le temps de la
# commande et jamais écrite dans l'image.
RUN --mount=type=secret,id=build_ca,required=false \
  if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
  npm ci --ignore-scripts --no-audit --no-fund

COPY . .

# BASE_PATH est injecté au build : "" pour un déploiement à la racine du domaine
ARG BASE_PATH=/
ENV BASE_PATH=${BASE_PATH}
RUN npm run build

# --- Étape 2 : serveur statique, sans root (UID 101, port 8080) ---
FROM ${NGINX_IMAGE}
USER root
RUN --mount=type=secret,id=build_ca,required=false \
  if [ -f /run/secrets/build_ca ]; then \
    cat /etc/ssl/certs/ca-certificates.crt /run/secrets/build_ca > /tmp/build-ca.pem; \
    export SSL_CERT_FILE=/tmp/build-ca.pem; \
  fi; \
  apk upgrade --no-cache && rm -f /tmp/build-ca.pem
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/out /usr/share/nginx/html
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
