# Images de base épinglées par empreinte (digest) : un tag republié ne peut
# pas changer le contenu construit. Mise à jour : voir deploy/README.md.
ARG NODE_IMAGE=node:24.22.1-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.30.6-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03

# --- Étape 1 : build du SPA ---
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NODE_ENV=development

COPY package.json package-lock.json ./
# --ignore-scripts : aucun script d'installation de dépendance n'est exécuté.
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY . .

# BASE_PATH est injecté au build : "" pour un déploiement à la racine du domaine
ARG BASE_PATH=/
ENV BASE_PATH=${BASE_PATH}
RUN npm run build

# --- Étape 2 : serveur statique, sans root (UID 101, port 8080) ---
FROM ${NGINX_IMAGE}
USER root
RUN apk upgrade --no-cache
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/out /usr/share/nginx/html
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
