# Images de base épinglées par empreinte (digest) : un tag republié ne peut
# pas changer le contenu construit. Mise à jour : voir deploy/README.md.
ARG NODE_IMAGE=node:24.22.1-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53

# --- Étape 1 : dépendances de production ---
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts : aucun script d'installation de dépendance n'est exécuté.
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

# --- Étape 2 : image finale ---
FROM ${NODE_IMAGE}
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# Correctifs de sécurité du système de base au moment du build.
RUN apk upgrade --no-cache

COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY scripts ./scripts
COPY package.json ./

# Utilisateur sans privilège à UID fixe (repris par runAsUser dans Kubernetes).
# Le code appartient à root et n'est pas modifiable par le processus.
RUN addgroup -S -g 10001 app && adduser -S -D -H -u 10001 -G app app \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
USER 10001:10001

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
