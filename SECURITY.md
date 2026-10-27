# Sécurité — ASP Automation Service Portal

Ce document décrit les mesures de sécurité du portail, leur exploitation et
les points qui restent à la charge de l'organisation qui l'héberge. Il
s'adresse aux équipes sécurité et exploitation.

Principe directeur : **fermé par défaut**. Une configuration incomplète ou
non sûre empêche le portail de démarrer, au lieu de l'ouvrir à moitié
protégé.

## 1. Démarrage refusé si la configuration n'est pas sûre

En production (`NODE_ENV=production`, valeur de l'image API), l'API vérifie sa
configuration au démarrage et s'arrête en listant chaque écart
([api/src/security.js](api/src/security.js)) :

| Exigence | Variable |
|---|---|
| SSO Ascender actif | `AUTH_MODE=awx`, `AWX_BASE_URL` (https), `AWX_CLIENT_ID`, `AWX_CLIENT_SECRET` |
| Origine du portail fixée, en HTTPS | `PORTAL_URL=https://…` ; `AWX_REDIRECT_URI` sur la même origine |
| Clé de chiffrement dédiée (32 octets) | `TOKEN_ENCRYPTION_KEY` |
| Cookie de session `Secure` | `COOKIE_SECURE` ≠ `false` |
| Aucune origine tierce générique | `ALLOWED_ORIGINS` ≠ `*`, chaque origine en https |
| PostgreSQL chiffré et certificat vérifié | `PG_SSL=true`, `PG_SSL_REJECT_UNAUTHORIZED` ≠ `false` |
| Vérification TLS jamais désactivée | `NODE_TLS_REJECT_UNAUTHORIZED` ≠ `0` |
| Aucun envoi d'email par un service externe non accepté | `RESEND_API_KEY` seulement avec `ALLOW_EXTERNAL_MAIL=true` |

`deploy/deploy.sh` applique les mêmes règles avant toute modification du
cluster. Le mode sans authentification n'existe qu'en développement local
(`npm run dev:local`).

## 2. Authentification et sessions

- **SSO OAuth2 Ascender** : le portail ne voit ni ne stocke aucun mot de
  passe. Le MFA, la politique de mots de passe et le verrouillage de compte
  se règlent dans Ascender ou dans l'IdP qui le fédère (LDAP, SAML, OIDC).
- **Jeton opaque** : le navigateur ne reçoit qu'un jeton aléatoire de 256 bits ;
  seule son empreinte SHA-256 est en base.
- **Cookie** `__Host-asp_session` : `HttpOnly`, `Secure`, `SameSite=Lax`,
  sans `Domain` (un sous-domaine ne peut ni le lire ni l'imposer).
- **Expiration** : après `SESSION_IDLE_MINUTES` d'inactivité (30 par défaut)
  et au plus tard après `SESSION_TTL_HOURS` (12). Les rafraîchissements
  automatiques de l'interface ne prolongent pas une session inactive.
- **Nouvelle session à chaque connexion** (pas de fixation de session).
- **Révocation** : un administrateur ferme toutes les sessions d'un
  utilisateur (page Authentification → Sessions actives) ; chacun peut se
  déconnecter de tous ses appareils. La révocation supprime aussi les jetons
  Ascender stockés.

## 3. Autorisations

| Rôle | Périmètre |
|---|---|
| Demandeur | ses propres demandes |
| Approbateur | les demandes de **son** tenant ; sans tenant, uniquement les siennes |
| Administrateur | tout |

- Le rôle est recalculé à chaque connexion (superutilisateur Ascender, ou
  mappings organisation / équipe).
- Une décision d'approbation hors du périmètre de l'approbateur répond 404,
  comme une lecture.
- Personne n'approuve sa propre demande.
- Les jobs partent avec le jeton Ascender **du demandeur** : le portail
  n'élargit jamais ses droits.

## 4. Protection des requêtes

- **CSRF** : toute écriture venant d'une autre origine est refusée
  (`Sec-Fetch-Site`, puis `Origin`), en plus du cookie `SameSite`.
- **Validation** : formulaires revalidés côté serveur ; seuls les champs du
  schéma partent vers Ascender ; corps JSON limité à 512 Ko.
- **SSRF** : le test de connecteur n'appelle que les hôtes de
  `CONNECTOR_ALLOWED_HOSTS` (obligatoire en production) ; les adresses de
  métadonnées cloud, link-local et multicast sont refusées après résolution
  DNS, au moment de la connexion ; aucune redirection n'est suivie.
- **En-têtes** : CSP limitée à `'self'`, HSTS, `X-Frame-Options`,
  `nosniff`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`,
  `Cross-Origin-Resource-Policy` ; réponses de l'API en `no-store`.
- **Limitation de débit** : connexion et API, par adresse IP réelle (vue par
  l'Ingress, jamais un `X-Forwarded-For` fourni par le client).
- **Exports CSV** : injection de formule neutralisée.

## 5. Chiffrement

| Donnée | Protection |
|---|---|
| Trafic navigateur → portail | TLS (Ingress), redirection HTTP → HTTPS, HSTS |
| API → PostgreSQL | TLS 1.2+ vérifié (`verify-full`) contre une autorité interne ; toute connexion TCP en clair est refusée par `pg_hba` |
| API → Ascender, SMTP | TLS vérifié ; autorité interne via `ASCENDER_CA_FILE` / `NODE_EXTRA_CA_CERTS` |
| Jetons Ascender, champs mot de passe en base | AES-256-GCM, format `v2:<id de clé>:…` |
| Mots de passe PostgreSQL | SCRAM-SHA-256 |

**Rotation de la clé de chiffrement** :

1. Générer une clé : `openssl rand -base64 32`.
2. Déployer avec `TOKEN_ENCRYPTION_KEY=<nouvelle>` et
   `TOKEN_ENCRYPTION_KEYS_PREVIOUS=<ancienne>` : `deploy.sh` re-chiffre
   ensuite toutes les données (`node scripts/rotate-keys.js` dans le pod API).
3. Redéployer sans `TOKEN_ENCRYPTION_KEYS_PREVIOUS`.

Le certificat serveur PostgreSQL (2 ans) est renouvelé automatiquement par
`deploy.sh` 30 jours avant expiration.

## 6. Traçabilité

- **Journal d'audit** (table `audit_log`) : chaque écriture sur l'API, chaque
  connexion, chaque refus (401, 403…), avec auteur, rôle, adresse IP, action,
  cible et résultat. Les valeurs saisies ne sont jamais copiées, seulement le
  nom des champs.
- **Inaltérable** : ajout seul (UPDATE, DELETE et TRUNCATE refusés par
  trigger) et chaîné par empreinte SHA-256. Le bouton « Vérifier
  l'intégrité » (page Système) ou `GET /api/system/audit/verify` détecte la
  première ligne modifiée ou retirée hors du portail.
- **SIEM** : chaque entrée est aussi écrite sur la sortie standard de l'API,
  en JSON sur une ligne (`"type":"audit"`), prête pour Fluent Bit, Vector,
  Splunk, Elastic… (`AUDIT_STDOUT=false` pour désactiver).
- Journal des décisions d'approbation et des connexions, exportables en CSV.

## 7. Déploiement Kubernetes

- **Pod Security Standards `restricted`** imposés au namespace : aucun pod
  root, privilégié ou avec capacités ne peut y être admis.
- Tous les conteneurs : utilisateur non root à UID fixe, système de fichiers
  racine en lecture seule, `allowPrivilegeEscalation: false`, toutes les
  capacités Linux retirées, profil seccomp `RuntimeDefault`, aucun jeton de
  compte de service monté, ressources limitées.
- **NetworkPolicy** : tout refusé par défaut ; PostgreSQL n'est joignable que
  par l'API et le job de migration ; les métadonnées cloud sont inaccessibles.
  Restreindre `API_EGRESS_CIDR` au réseau d'Ascender et du SMTP.
  Nécessite un CNI qui les applique (Calico, Cilium, Antrea…).
- **Images** : bases épinglées par empreinte (digest), correctifs système
  appliqués au build, npm retiré de l'image API, aucun script d'installation
  de dépendance exécuté.
- **Secrets** : uniquement dans des Secrets Kubernetes (`asp-auth`, `asp-db`,
  `asp-mail`, `asp-pg-tls`). Activer le chiffrement des Secrets au repos
  dans etcd, ou un gestionnaire externe (Vault, External Secrets).

## 8. Chaîne logicielle (CI)

| Contrôle | Outil | Seuil bloquant |
|---|---|---|
| Dépendances livrées | `npm audit --omit=dev` | élevé |
| Outillage de build | `npm audit` | critique |
| Analyse statique | CodeQL (`security-extended`) | alerte |
| Secrets, lockfiles, Dockerfiles, manifestes | Trivy (`fs`) | élevé |
| Images construites | Trivy (`image`) | élevé |
| Nomenclature logicielle | SBOM CycloneDX (artefact `sbom`) | — |
| Mises à jour | Dependabot (délai de 14 jours) | revue |

Actions GitHub épinglées par SHA de commit, jeton CI en lecture seule.
Le paquet hors-ligne est vérifié par `SHA256SUMS` et peut être signé avec
cosign (`COSIGN_KEY=… npm run package`).

## 9. Hors du périmètre du code

À traiter par l'organisation qui héberge le portail :

- **MFA** et politique de comptes : dans Ascender ou l'IdP fédéré.
- **Test d'intrusion** indépendant avant mise en production, puis annuel.
- **Homologation** (référentiel ANSSI, ISO 27001, SecNumCloud selon le
  contexte) et **analyse d'impact RGPD** : le portail traite des noms,
  emails et adresses IP.
- **Sauvegardes chiffrées** de PostgreSQL et test de restauration.
- **Rétention** : le journal d'audit est conservé sans limite ; une purge
  exige de désactiver le trigger, en tant que propriétaire de la base,
  selon la politique de conservation.
- **Durcissement du cluster** : chiffrement etcd, journal d'audit Kubernetes,
  accès `kubectl exec` restreint (il donne accès à la base par le socket
  local de PostgreSQL).

## Signaler une vulnérabilité

Merci de ne pas ouvrir de ticket public : écrivez à l'équipe de maintenance
du portail, qui accuse réception sous 2 jours ouvrés.
