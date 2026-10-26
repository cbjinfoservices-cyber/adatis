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
```

Le portail est sur <http://localhost:3000>. La base (PGlite) est conservée
dans `.pgdata/`. Avec `--mock-sso`, `DEV_USER=alice` (demandeur) ou
`DEV_USER=bob` (approbateur, si un mapping « Infra / Approvers » existe)
change l'utilisateur connecté.

## Vérifications

```sh
npm run type-check && npm run lint && npm run build   # front
npm run test:api                                      # API
```

Les tests de l'API (`api/test/`) tournent sur un vrai PostgreSQL en mémoire
(PGlite, avec toutes les migrations) et un faux Ascender multi-utilisateurs
(`api/testing/`). La CI (`.github/workflows/ci.yml`) exécute l'ensemble.

## Modèle de sécurité

- **Authentification** : SSO OAuth2 Ascender (`AUTH_MODE=awx`). Si l'URL, le
  client id ou le secret manque, le portail reste **fermé** (503).
  `AUTH_MODE=disabled` ouvre le portail sans authentification : réservé au
  développement.
- **Rôles** : superutilisateur Ascender ou `AWX_ADMIN_USERS` → administrateur ;
  sinon mappings organisation / équipe → approbateur ou demandeur.
- **Périmètre** : un demandeur ne voit que ses demandes ; un approbateur celles
  de son tenant ; un administrateur tout.
- **Approbation** : un service soumis à approbation ne lance rien avant la
  décision finale ; le job part alors avec le jeton du demandeur. Personne ne
  peut approuver sa propre demande.
- **Formulaires** : validés côté serveur ; seuls les champs du schéma partent
  dans les `extra_vars` Ascender.
- **Jetons Ascender** : chiffrés en base (AES-256-GCM, `TOKEN_ENCRYPTION_KEY`).

## Configuration principale (API)

| Variable | Rôle |
|----------|------|
| `DATABASE_URL` | Connexion PostgreSQL |
| `AUTH_MODE` | `awx` (SSO obligatoire) ou `disabled` (développement) |
| `AWX_BASE_URL`, `AWX_CLIENT_ID`, `AWX_CLIENT_SECRET` | Instance Ascender et application OAuth2 |
| `AWX_REDIRECT_URI` | Défaut : `<PORTAL_URL>/api/auth/callback` |
| `TOKEN_ENCRYPTION_KEY` | Clé AES-256 (32 octets base64) ; défaut : dérivée du secret OAuth |
| `ALLOWED_ORIGINS` | Origines tierces autorisées (vide : même origine) |
| `PG_SSL`, `PG_SSL_REJECT_UNAUTHORIZED` | TLS vers PostgreSQL (certificat vérifié par défaut) |
| `RATE_LIMIT_API`, `RATE_LIMIT_LOGIN` | Requêtes par minute et par IP (600 / 20) |

Le détail du déploiement Kubernetes est dans `deploy/README.md`.
