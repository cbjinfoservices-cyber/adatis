# Déploiement Kubernetes — ASP Automation Service Portal

Briques déployées dans le cluster, dans le namespace `asp-portal` :

| Brique | Ressource | Détail |
| --- | --- | --- |
| `postgres` | StatefulSet + PVC 10 Gi | `postgres:16.15-alpine`, TLS obligatoire |
| `asp-db-migrate` | Job batch | applique les scripts SQL **avant** le démarrage de l'API |
| `asp-api` | Deployment (2 réplicas) | Node 24 + Express, **seul client de PostgreSQL** |
| `asp-web` | Deployment (2 réplicas) | SPA compilé servi par nginx sans root |

Mesures de sécurité et exploitation (rotation de clé, révocation, audit,
réseau) : voir [SECURITY.md](../SECURITY.md).

L'Ingress `asp-portal` route `/api` vers l'API et `/` vers le frontend.

---

## 1. Prérequis

- un cluster Kubernetes (kind, minikube, k3s, EKS, AKS, GKE…)
- `kubectl`, `docker`
- pour un accès public : le contrôleur Ingress **Traefik** (v3, CRD `traefik.io`)
  et un DNS pointant sur l'Ingress. k3s l'inclut ; ailleurs, chart Helm officiel.

```bash
# Exemple de cluster local (Traefik inclus)
curl -sfL https://get.k3s.io | sh -
# Autre cluster : helm install traefik traefik/traefik -n traefik --create-namespace
```

## 2. Déploiement

Le SSO Ascender est obligatoire : sans `AWX_BASE_URL` (https),
`AWX_CLIENT_ID` et `AWX_CLIENT_SECRET`, le script s'arrête avant toute
modification du cluster.

```bash
export AWX_BASE_URL=https://awx.acme.fr AWX_CLIENT_ID=<client id> AWX_CLIENT_SECRET=<secret>

# production : certificat Let's Encrypt automatique (cert-manager requis)
REGISTRY=registry.example.com/asp TAG=1.0.0 DOMAIN=portal.acme.fr \
  LETSENCRYPT_EMAIL=ops@acme.fr CONNECTOR_ALLOWED_HOSTS=jenkins.acme.fr \
  SMTP_HOST=smtp.acme.fr ALERT_EMAIL_FROM=asp@acme.fr ./deploy/deploy.sh

# certificat fourni (PKI interne)
DOMAIN=portal.acme.fr TLS_CERT_FILE=portal.crt TLS_KEY_FILE=portal.key ./deploy/deploy.sh

# cluster local (kind) : certificat local, par ex. avec mkcert
mkcert -cert-file portal.crt -key-file portal.key portal.local
DOMAIN=portal.local TLS_CERT_FILE=portal.crt TLS_KEY_FILE=portal.key ./deploy/deploy.sh
```

Options : `--skip-build`, `--reset-db`, `--no-ingress`. Voir `./deploy/deploy.sh --help`.

### HTTPS (obligatoire)

Dès que `DOMAIN` est fourni, le script **refuse de déployer sans certificat**
(vérifié avant la construction des images). Sources acceptées, par priorité :

| Source | Variables |
|--------|-----------|
| Certificat fourni | `TLS_CERT_FILE`, `TLS_KEY_FILE` (PEM) → secret `asp-portal-tls` |
| ClusterIssuer existant | `CERT_MANAGER_ISSUER` |
| Let's Encrypt automatique | `LETSENCRYPT_EMAIL` (`LETSENCRYPT_STAGING=true` pour tester) : crée le ClusterIssuer `asp-letsencrypt` (HTTP-01) |
| Secret déjà présent | `asp-portal-tls` dans le namespace |

L'Ingress redirige tout HTTP vers HTTPS (redirection permanente, middleware
Traefik `asp-https-redirect`), le cookie de session est
`Secure` (`COOKIE_SECURE=true`), et le portail comme l'API envoient
`Strict-Transport-Security`. Avec cert-manager, le script attend l'émission du
certificat puis teste `https://<DOMAIN>/api/system/health`.

**Vers Ascender** : `AWX_BASE_URL` doit être en `https://` (refus sinon). Si Ascender est signé par une autorité interne,
`ASCENDER_CA_FILE=ca.pem` l'ajoute aux autorités de confiance de l'API
(ConfigMap `asp-ascender-ca`, `NODE_EXTRA_CA_CERTS`).

`--no-ingress` suppose un équilibreur HTTPS externe : fournir alors `PORTAL_URL=https://…`
(l'API refuse de démarrer sans origine HTTPS).

Le script :

1. vérifie le cluster et construit les deux images ;
2. pousse (registre) ou charge (kind) les images ;
3. crée la ConfigMap de configuration et les secrets `asp-db`, `asp-auth`, `asp-mail`
   (mot de passe et clé de chiffrement réutilisés s'ils existent déjà) ;
4. crée ou renouvelle l'autorité interne et le certificat TLS de PostgreSQL (`asp-pg-tls`) ;
5. injecte `db/` dans la ConfigMap `asp-db-init` (schéma, jeu de données, `migrate.sh`) ;
6. applique les NetworkPolicy (tout refusé sauf les flux du portail), déploie PostgreSQL, attend `pg_isready` ;
7. **lance le Job `asp-db-migrate`** et attend sa réussite ;
8. déploie l'API (journaux affichés si elle refuse sa configuration) puis le frontend ;
9. re-chiffre les données si `TOKEN_ENCRYPTION_KEYS_PREVIOUS` est fourni (rotation) ;
10. applique l'Ingress HTTPS si `DOMAIN` est fourni (certificat obligatoire, voir ci-dessous) ;
11. teste `/api/system/health` depuis un pod, puis en HTTPS depuis l'extérieur, et affiche les accès.

### Migrations SQL automatiques

Le Job `asp-db-migrate` (`deploy/k8s/15-migrate-job.yaml`) monte la ConfigMap
dans `/sql` et exécute `db/migrate.sh` :

- une table `schema_migrations (version, applied_at)` trace ce qui a déjà tourné ;
- sur une base vide : `001_schema.sql` puis `002_seed.sql` ;
- sur une base déjà initialisée hors de ce mécanisme : baseline des deux
  scripts initiaux (marqués appliqués, **jamais rejoués**), puis seuls les
  fichiers suivants sont exécutés ;
- un fichier déjà enregistré est ignoré, donc `DROP TABLE` ne peut pas effacer
  des données existantes lors d'un redéploiement.

Pour ajouter une évolution, dépose `db/003_xxx.sql` : le prochain
`./deploy/deploy.sh` l'appliquera. Le Job est supprimé/recréé à chaque
déploiement (`ttlSecondsAfterFinished` nettoie sinon au bout de 24 h).

```bash
kubectl -n asp-portal logs job/asp-db-migrate
```

### Supervision (santé API / PostgreSQL)

Deux points d'entrée en lecture seule alimentent la page **Système** du portail
(`/admin/system`) et le bandeau global « API indisponible » :

| Route | Rôle |
| --- | --- |
| `GET /api/system/health` | sonde légère (API + `SELECT 1`), `503` si la base ne répond pas — utilisée par la reconnexion automatique du bandeau |
| `GET /api/system` | métadonnées API (version, uptime, runtime), base (version, taille, connexions, latence), migrations `schema_migrations`, volumétrie des tables publiques, mini-historique de disponibilité 24 h, réglages de supervision, dernière heure complète et alertes récentes |
| `PATCH /api/system/settings` | rétention des sondes, seuil d'alerte, destinataire et activation des emails |

Aucune colonne métier n'est lue et le secret `DATABASE_URL` n'est jamais
exposé au navigateur. Les deux routes peuvent être ciblées par une sonde
externe (uptime check) :

```bash
kubectl -n asp-portal port-forward svc/asp-api 8081:80
curl -s localhost:8081/api/system/health | jq
```

### Historique de disponibilité

Chaque appel à `/api/system/health` **et** une sonde interne toutes les 60 s
déposent une ligne dans `health_probes (checked_at, database_up, latency_ms)`
(migration `003_health_probes.sql`). L'API agrège ces points en tranches de
15 minutes sur 24 h et les renvoie dans le champ `history` de `GET /api/system`.

Les points sont aussi gardés en mémoire dans le processus : quand PostgreSQL
est justement indisponible, l'insertion échoue mais l'incident reste visible
dans le mini-historique et dans le calcul d'alerte.

La page Système affiche en plus une **courbe de latence** alimentée par les
mêmes tranches de 15 minutes (uniquement les sondes réussies).

### Rétention des sondes (réglable)

La purge est pilotée par la table `system_settings` (migration
`004_system_settings.sql`) :

| Clé | Défaut | Rôle |
| --- | --- | --- |
| `probe_retention_days` | `7` | rétention des lignes `health_probes` (1 à 90 jours) |
| `alert_threshold_pct` | `99` | seuil d'alerte de disponibilité horaire |
| `alert_email` | `null` | destinataire (retombe sur `ALERT_EMAIL_TO`) |
| `alerts_enabled` | `true` | interrompt l'envoi sans supprimer les réglages |

Le tout se modifie sans redéploiement depuis **Administration → Système**
(`PATCH /api/system/settings`).

### Alertes de disponibilité (< 99 % sur une heure)

Toutes les 5 minutes, l'API calcule la disponibilité de la **dernière heure
complète**. Si elle passe sous le seuil, une ligne est écrite dans
`health_alerts` et un email part par le serveur SMTP interne. L'index unique sur `window_start`
garantit un seul email par heure, même avec plusieurs réplicas.

```bash
SMTP_HOST=smtp.acme.fr SMTP_PORT=587 \
SMTP_USER=asp SMTP_PASSWORD=<mot de passe> \
ALERT_EMAIL_TO=ops@acme.fr ALERT_EMAIL_FROM=alertes@acme.fr \
DOMAIN=portal.acme.fr \
  ./deploy/deploy.sh
```

TLS obligatoire : STARTTLS exigé sur 587, TLS implicite avec `SMTP_SECURE=true`
(465) ; certificat vérifié (autorité interne via `ASCENDER_CA_FILE` si besoin).
Les identifiants vont dans le secret `asp-mail`. Le service externe Resend
(`RESEND_API_KEY`) n'est accepté qu'avec `ALLOW_EXTERNAL_MAIL=true`.
Sans transport, l'API continue de fonctionner : les alertes restent visibles dans la page Système avec la mention
« email non envoyé », et la carte de réglages signale la configuration
manquante.

```bash
# voler un diagnostic complet depuis un pod
kubectl -n asp-portal exec deploy/asp-api -- wget -qO- localhost:8080/api/system
```

## 3. Variables utiles

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `REGISTRY` | vide | préfixe des images ; vide = images locales |
| `TAG` | date + hash git | tag des images |
| `NAMESPACE` | `asp-portal` | namespace cible |
| `DOMAIN` | vide | hôte public, active l'Ingress + TLS |
| `BASE_PATH` | `/` | chemin de base du SPA au build |
| `API_URL` | `/api` | URL de l'API vue par le navigateur |
| `ALLOWED_ORIGINS` | vide | origines tierces autorisées par l'API (vide : même origine via l'Ingress) |
| `DB_NAME` / `DB_USER` | `asp_portal` / `asp` | identifiants de la base |
| `FORCE_DB_PASSWORD` | — | impose le mot de passe (sinon généré puis réutilisé) |
| `ALERT_EMAIL_TO` | vide | destinataire par défaut des alertes (modifiable ensuite dans la page Système) |
| `ALERT_EMAIL_FROM` | vide | expéditeur des alertes |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | vide / `587` / `false` | serveur SMTP interne (TLS obligatoire) |
| `SMTP_USER` / `SMTP_PASSWORD` | vide | identifiants SMTP (secret `asp-mail`) |
| `RESEND_API_KEY` | vide | service externe Resend, refusé sauf `ALLOW_EXTERNAL_MAIL=true` |
| `PORTAL_URL` | `https://${DOMAIN}` | origine de confiance du portail, en https (obligatoire) |
| `TOKEN_ENCRYPTION_KEY` | conservée ou générée | clé AES-256 (32 octets base64) des jetons Ascender en base, stockée dans `asp-auth` |
| `TOKEN_ENCRYPTION_KEYS_PREVIOUS` | vide | anciennes clés pendant une rotation (données re-chiffrées après déploiement) |
| `AWX_BASE_URL` | **obligatoire** | URL de base d'Ascender, en https, ex. `https://awx.acme.fr` |
| `AWX_CLIENT_ID` | **obligatoire** | client id de l'application OAuth2 |
| `AWX_CLIENT_SECRET` | **obligatoire** (réutilisé s'il existe) | client secret (stocké dans le secret `asp-auth`) |
| `AWX_SCOPES` | `read write` | scopes demandés à AWX |
| `AWX_ADMIN_USERS` | vide | identifiants AWX promus administrateurs, séparés par des virgules |
| `AWX_REDIRECT_URI` | `${PORTAL_URL}/api/auth/callback` | URL de retour à déclarer dans AWX |
| `SESSION_TTL_HOURS` | `12` | durée maximale d'une session |
| `SESSION_IDLE_MINUTES` | `30` | expiration après inactivité |
| `CONNECTOR_ALLOWED_HOSTS` | vide | hôtes que le test de connecteur peut appeler (`*.domaine` accepté) ; vide = test désactivé |
| `INGRESS_NAMESPACE` | détecté, sinon `kube-system` | namespace de Traefik, dont les pods sont autorisés par les NetworkPolicy |
| `API_EGRESS_CIDR` | `0.0.0.0/0` | réseau joignable par l'API (Ascender, SMTP, connecteurs) ; métadonnées cloud toujours exclues |
| `POSTGRES_IMAGE` / `BUSYBOX_IMAGE` | épinglées par empreinte | images tierces |

## 3bis. Authentification SSO Ascender (AWX)

Le portail délègue toute l'authentification à Ascender (ou à tout AWX) via OAuth2
(Authorization Code). Le navigateur ne reçoit qu'un cookie de session `httpOnly` ; les
jetons restent en base, chiffrés (AES-256-GCM), et servent à lancer les jobs au nom de
l'utilisateur.

### Créer l'application OAuth2 dans AWX

1. AWX → **Applications** → **Créer une application**.
2. Type **Authorization code**, scopes `read` et `write`.
3. URL de redirection : `https://<domaine du portail>/api/auth/callback`
   (la page `Administration → Authentification` affiche et copie l'URL exacte).

### Déployer avec SSO

```bash
AWX_BASE_URL=https://awx.acme.fr \
AWX_CLIENT_ID=<client id> \
AWX_CLIENT_SECRET=<client secret> \
DOMAIN=portal.acme.fr ./deploy/deploy.sh
```

Le script crée le secret `asp-auth` (`AWX_CLIENT_SECRET`, `AWX_REDIRECT_URI`,
`TOKEN_ENCRYPTION_KEY`). La clé de chiffrement existante est conservée d'un déploiement
à l'autre ; pour la changer sans perdre les données chiffrées, suivre la rotation
décrite dans [SECURITY.md](../SECURITY.md). Une configuration incomplète arrête le
script ; l'API elle-même refuse de démarrer : le portail ne s'ouvre jamais sans
authentification.

### Rôles

Les rôles sont recalculés à chaque connexion, dans cet ordre :

1. superutilisateur AWX → `admin` ;
2. identifiant listé dans `AWX_ADMIN_USERS` → `admin` ;
3. mappings `organization / team → rôle` gérés depuis
   **Administration → Authentification** (règle la plus élevée, joker possible) ;
4. sinon `requester`.

Écritures protégées : `admin` pour adaptateurs, connecteurs, tenants, réglages de
supervision et mappings ; `admin` ou `approver` pour les décisions d'approbation.

### Tables ajoutées (`005_auth_awx.sql`)

- `auth_sessions` — sessions serveur + jetons AWX (empreinte SHA-256 du cookie) ;
- `awx_role_mappings` — règles organisation / équipe → rôle ;
- `auth_events` — journal des connexions, échecs et changements de mappings.

Les sessions expirées sont purgées automatiquement toutes les heures.

## 4. Exploitation

```bash
kubectl -n asp-portal get pods,svc,ingress
kubectl -n asp-portal logs -f deploy/asp-api
kubectl -n asp-portal port-forward svc/asp-web 8080:80

# Réinitialiser les données (⚠️ efface tout)
./deploy/deploy.sh --reset-db

# Sauvegarde
kubectl -n asp-portal exec postgres-0 -- pg_dump -U asp asp_portal > backup.sql
```

## 5. Points de sécurité

Le détail est dans [SECURITY.md](../SECURITY.md). En résumé :

- démarrage refusé si la configuration n'est pas sûre (SSO, HTTPS, clé, TLS PostgreSQL) ;
- namespace en Pod Security `restricted`, conteneurs non root en lecture seule, sans capacités ;
- NetworkPolicy : tout refusé par défaut, PostgreSQL joignable seulement par l'API et la migration ;
- PostgreSQL en TLS vérifié, connexions en clair refusées, mots de passe SCRAM ;
- secrets uniquement dans des Secrets Kubernetes, jamais dans le dépôt ;
- journal d'audit inaltérable, copié en JSON sur la sortie standard pour un SIEM.
