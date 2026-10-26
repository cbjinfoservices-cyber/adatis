# Déploiement Kubernetes — ASP Automation Service Portal

Briques déployées dans le cluster, dans le namespace `asp-portal` :

| Brique | Ressource | Détail |
| --- | --- | --- |
| `postgres` | StatefulSet + PVC 10 Gi | `postgres:16-alpine` |
| `asp-db-migrate` | Job batch | applique les scripts SQL **avant** le démarrage de l'API |
| `asp-api` | Deployment (2 réplicas) | Node 20 + Express, **seul client de PostgreSQL** |
| `asp-web` | Deployment (2 réplicas) | SPA compilé servi par nginx |

L'Ingress `asp-portal` route `/api` vers l'API et `/` vers le frontend.

---

## 1. Prérequis

- un cluster Kubernetes (kind, minikube, k3s, EKS, AKS, GKE…)
- `kubectl`, `docker`
- pour un accès public : un contrôleur **ingress-nginx** et un DNS pointant sur l'Ingress

```bash
# Exemple de cluster local
kind create cluster --name asp
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
```

## 2. Déploiement

```bash
# cluster local (images chargées automatiquement)
DOMAIN=portal.local ./deploy/deploy.sh

# registre distant
REGISTRY=registry.example.com/asp TAG=1.0.0 DOMAIN=portal.acme.fr \
  CERT_MANAGER_ISSUER=letsencrypt ./deploy/deploy.sh
```

Options : `--skip-build`, `--reset-db`, `--no-ingress`. Voir `./deploy/deploy.sh --help`.

Le script :

1. vérifie le cluster et construit les deux images ;
2. pousse (registre) ou charge (kind) les images ;
3. crée la ConfigMap de configuration et le secret `asp-db` (mot de passe réutilisé s'il existe déjà) ;
4. injecte `db/` dans la ConfigMap `asp-db-init` (schéma, jeu de données, `migrate.sh`) ;
5. déploie PostgreSQL, attend `pg_isready` ;
6. **lance le Job `asp-db-migrate`** et attend sa réussite ;
7. déploie l'API puis le frontend ;
8. applique l'Ingress si `DOMAIN` est fourni ;
9. teste `/api/services` depuis un pod et affiche les accès.

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
`health_alerts` et un email part via Resend. L'index unique sur `window_start`
garantit un seul email par heure, même avec plusieurs réplicas.

```bash
RESEND_API_KEY=re_xxx \
ALERT_EMAIL_TO=ops@acme.fr \
ALERT_EMAIL_FROM=alertes@acme.fr \
DOMAIN=portal.acme.fr \
  ./deploy/deploy.sh
```

`deploy.sh` crée alors le secret **optionnel** `asp-alerts`
(`RESEND_API_KEY`, `ALERT_EMAIL_FROM`). Sans clé Resend, l'API continue de
fonctionner : les alertes restent visibles dans la page Système avec la mention
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
| `ALERT_EMAIL_FROM` | `alertes@<RESEND_FROM_DOMAIN>` | expéditeur des alertes |
| `RESEND_API_KEY` | vide | active l'envoi réel des alertes (secret `asp-alerts`) |
| `PORTAL_URL` | `https://${DOMAIN}` | lien repris dans les emails d'alerte et retour après connexion |
| `AUTH_MODE` | `disabled` | `awx` impose le SSO Ascender ; portail fermé (503) si la config est incomplète. `disabled` : sans authentification, développement uniquement |
| `TOKEN_ENCRYPTION_KEY` | conservée ou générée | clé AES-256 (32 octets base64) des jetons Ascender en base, stockée dans `asp-auth` |
| `AWX_BASE_URL` | vide | URL de base de l'AWX, ex. `https://awx.acme.fr` |
| `AWX_CLIENT_ID` | vide | client id de l'application OAuth2 AWX |
| `AWX_CLIENT_SECRET` | vide | client secret (stocké dans le secret `asp-auth`) |
| `AWX_SCOPES` | `read write` | scopes demandés à AWX |
| `AWX_ADMIN_USERS` | vide | identifiants AWX promus administrateurs, séparés par des virgules |
| `AWX_REDIRECT_URI` | `${PORTAL_URL}/api/auth/callback` | URL de retour à déclarer dans AWX |
| `SESSION_TTL_HOURS` | `12` | durée de vie de la session portail (cookie glissant) |

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
AUTH_MODE=awx \
AWX_BASE_URL=https://awx.acme.fr \
AWX_CLIENT_ID=<client id> \
AWX_CLIENT_SECRET=<client secret> \
DOMAIN=portal.acme.fr ./deploy/deploy.sh
```

Le script crée le secret `asp-auth` (`AWX_CLIENT_SECRET`, `AWX_REDIRECT_URI`,
`TOKEN_ENCRYPTION_KEY`). La clé de chiffrement existante est conservée d'un déploiement
à l'autre ; la changer déconnecte simplement les utilisateurs.
Si `AUTH_MODE=awx` mais que la configuration est incomplète, le script avertit et
l'API **reste fermée** (503) : le portail ne s'ouvre jamais sans authentification par erreur.

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

- PostgreSQL n'est exposé que par un Service `ClusterIP` : aucun accès depuis l'extérieur du cluster.
- Le mot de passe n'est jamais dans le dépôt : secret Kubernetes généré au déploiement.
- L'API est le seul composant qui parle SQL ; le navigateur ne voit que du JSON.
- **Authentification** : `AUTH_MODE=awx` active le SSO AWX (OAuth2) avec cookie de session `httpOnly`, jetons AWX stockés côté serveur et rôles déduits des organisations/équipes AWX. Laisse `AUTH_MODE=disabled` uniquement pour une démonstration interne ou un cluster isolé.
- **À faire avant une mise en production réelle** : restreindre `ALLOWED_ORIGINS`, activer TLS entre l'API et Postgres, et remplacer le compte `asp` par un rôle applicatif à privilèges limités.