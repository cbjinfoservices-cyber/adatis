# ASP — Automation Service Portal

Portail self-service : les utilisateurs commandent des services d'automatisation
(serveurs, DNS, bases de données…) depuis un catalogue ; chaque commande est
exécutée par un job ou workflow template **Ascender** (distribution d'AWX),
lancé avec le jeton de l'utilisateur.

| Dossier   | Contenu |
|-----------|---------|
| `src/`    | Front React 19 + Vite + Tailwind (i18n FR / EN / ES / DE / AR) |
| `api/`    | API Express : seule porte d'accès à PostgreSQL et à Ascender |
| `db/`     | Migrations SQL numérotées, appliquées dans l'ordre (`schema_migrations`) |
| `deploy/` | Manifestes Kubernetes et `deploy.sh` (voir `deploy/README.md`) |
| `scripts/`| `dev-local.mjs` : toute la pile en local, sans Docker |

## Démarrer en local

Prérequis : Node.js 22 ou plus. Ni Docker ni PostgreSQL ne sont nécessaires.

```sh
npm ci && npm ci --prefix api
npm run dev:local                 # portail ouvert, sans authentification
npm run dev:local -- --mock-sso   # SSO via un faux Ascender (admin)
npm run dev:local -- --reset      # repart d'une base vide
npm run dev:local -- --https      # https://localhost:3000 (cookie Secure)
```

Avec `--https`, un certificat `localhost` est créé une fois dans `.certs/` :
avec [mkcert](https://github.com/FiloSottile/mkcert) s'il est installé (reconnu
par le navigateur), sinon auto-signé (avertissement à accepter une fois).

Le portail est sur <http://localhost:3000>. La base (PGlite) est conservée
dans `.pgdata/`. Avec `--mock-sso`, `DEV_USER=alice` (demandeur) ou
`DEV_USER=bob` (approbateur, si un mapping « Infra / Approvers » existe)
change l'utilisateur connecté.

## Vérifications

```sh
npm run type-check && npm run lint && npm run build   # front
npm run test:api                                      # API
npm run build && npm run test:e2e                     # navigateur (Chromium)
```

`test:e2e` (Playwright, `npx playwright install chromium` la première fois)
sert le build de production avec la CSP de `deploy/nginx.conf`, se connecte en
admin puis en demandeur et parcourt chaque page : il échoue sur toute erreur
JavaScript, violation CSP, requête en échec ou clé de traduction affichée.
Captures dans `e2e-output/`.

Les tests de l'API (`api/test/`) tournent sur un vrai PostgreSQL en mémoire
(PGlite, avec toutes les migrations) et un faux Ascender multi-utilisateurs
(`api/testing/`). La CI (`.github/workflows/ci.yml`) exécute l'ensemble.

## Modèle de sécurité

Détail complet, exploitation et points hors code : [SECURITY.md](SECURITY.md).

- **Fermé par défaut** : en production, l'API refuse de démarrer sans SSO,
  sans `PORTAL_URL` en HTTPS, sans clé de chiffrement ou sans TLS vers
  PostgreSQL. Le mode sans authentification n'existe qu'avec `dev:local`.
- **Authentification** : SSO OAuth2 Ascender ; cookie `__Host-` ; expiration
  après 30 min d'inactivité ; révocation des sessions par un administrateur.
- **Audit** : journal en ajout seul, chaîné par empreinte (vérifiable depuis
  la page Système) et copié en JSON sur la sortie standard pour un SIEM.
- **Rôles** : superutilisateur Ascender ou `AWX_ADMIN_USERS` → administrateur ;
  sinon mappings organisation / équipe → approbateur ou demandeur.
- **Périmètre** : un demandeur ne voit que ses demandes ; un approbateur celles
  de son tenant (sans tenant : seulement les siennes) ; un administrateur tout.
- **Approbation** : un service soumis à approbation ne lance rien avant la
  décision finale ; le job part alors avec le jeton du demandeur, même déconnecté
  depuis moins de `SESSION_LAUNCH_GRACE_DAYS` jours (sinon il le lance lui-même).
  Personne ne peut approuver sa propre demande.
- **Formulaires** : validés côté serveur ; seuls les champs du schéma partent
  dans les `extra_vars` Ascender.
- **Jetons Ascender et champs mot de passe** : chiffrés en base (AES-256-GCM,
  `TOKEN_ENCRYPTION_KEY`) ; les mots de passe ne sont déchiffrés que pour les
  `extra_vars` Ascender.
- **HTTPS** : obligatoire en déploiement (`deploy.sh` refuse sans certificat ;
  Let's Encrypt, ClusterIssuer ou certificat fourni), redirection HTTP → HTTPS,
  HSTS, cookie `Secure`, Ascender en `https://` (autorité interne possible).
- **Front** : polices et icônes servies par le portail, CSP limitée à `'self'`
  (aucun appel à un service tiers depuis le navigateur).
- **Tenant** : déduit de l'organisation Ascender reliée au tenant (Tenants & branding).

## Configuration principale (API)

| Variable | Rôle |
|----------|------|
| `DATABASE_URL` | Connexion PostgreSQL |
| `AUTH_MODE` | `awx` (obligatoire en production) ou `disabled` (développement local) |
| `PORTAL_URL` | Origine publique du portail, en https (obligatoire en production) |
| `AWX_BASE_URL`, `AWX_CLIENT_ID`, `AWX_CLIENT_SECRET` | Instance Ascender et application OAuth2 |
| `AWX_REDIRECT_URI` | Défaut : `<PORTAL_URL>/api/auth/callback` |
| `TOKEN_ENCRYPTION_KEY` | Clé AES-256 (32 octets base64), obligatoire en production |
| `TOKEN_ENCRYPTION_KEYS_PREVIOUS` | Anciennes clés pendant une rotation (`node scripts/rotate-keys.js`) |
| `ALLOWED_ORIGINS` | Origines tierces autorisées (vide : même origine) |
| `PG_SSL`, `PG_SSL_CA_FILE` | TLS vers PostgreSQL, certificat vérifié (obligatoire en production) |
| `SESSION_TTL_HOURS`, `SESSION_IDLE_MINUTES` | Durée maximale (12 h) et inactivité (30 min) d'une session |
| `CONNECTOR_ALLOWED_HOSTS` | Hôtes que le test de connecteur peut appeler (obligatoire en production) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | Alertes email par SMTP interne |
| `AUDIT_STDOUT` | Copie JSON du journal d'audit sur la sortie standard (`true`) |
| `TRUST_PROXY_HOPS` | Proxys de confiance devant l'API (1) |
| `RATE_LIMIT_API`, `RATE_LIMIT_LOGIN` | Requêtes par minute et par IP (600 / 20) |
| `SESSION_LAUNCH_GRACE_DAYS` | Jours pendant lesquels une session expirée peut encore lancer un job approuvé (7) |

Le détail du déploiement Kubernetes est dans `deploy/README.md`.
