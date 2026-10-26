# --- Étape 1 : build du SPA ---
FROM node:20-alpine AS build
WORKDIR /app
ENV NODE_ENV=development

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# BASE_PATH est injecté au build : "" pour un déploiement à la racine du domaine
ARG BASE_PATH=/
ENV BASE_PATH=${BASE_PATH}
RUN npm run build

# --- Étape 2 : serveur statique ---
FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/out /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
CMD ["nginx", "-g", "daemon off;"]