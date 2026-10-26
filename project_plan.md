# Automation Service Portal (ASP)

## 1. Project Description
Portail Self-Service SaaS multi-tenant et white label permettant aux utilisateurs métier et techniques de commander des services d'automatisation (serveurs, DNS, bases de données, déploiements...) via un catalogue, sans jamais voir le moteur d'exécution (Ascender, Jenkins, Terraform...). Cibles : PME, ETI, grands comptes, administrations, ESN, MSP, hébergeurs.

## 2. Page Structure
- `/` - Catalogue de services (recherche, filtre par projet, tri et regroupement par catégorie)
- `/services/:id` - Commande d'un service (formulaire dynamique universel)
- `/requests` - Mes demandes / historique (phase 3)
- `/requests/:id` - Suivi d'exécution temps réel (timeline, logs enrichis, résultat métier) (phase 3)
- `/awx` - Suivi agrégé des jobs AWX lancés depuis le portail (job simple ou workflow), filtres état / utilisateur / recherche et actualisation automatique
- `/dashboard` - Tableau de bord KPI (phase 2)
- `/approvals` - Approbations + journal d'audit des décisions (phase 4)
- `/admin/connectors` - Administration des connecteurs (santé, catalogue importé) (phase 5)
- `/admin/adapters` - Administration des adaptateurs d'automatisation (CRUD branché sur PostgreSQL)
- `/admin/branding` - Tenants & branding : nom de plateforme, logo, palette, domaine personnalisé + aperçu utilisateur plein écran (phase 6)
- `/login` - Connexion unique AWX (OAuth2), état de configuration et erreurs explicites
- `/admin/auth` - Authentification : statut du SSO AWX, accès AWX de l'utilisateur et mappings organisation/équipe → rôle
- `/admin/services` - Administration du catalogue : affectation d'un job template ou d'un workflow template AWX par service, limité aux modèles accessibles avec le jeton de l'utilisateur
- `/admin/system` - Santé du système : API, PostgreSQL, historique de disponibilité 24 h + courbe de latence, migrations appliquées (`schema_migrations`), alertes email de disponibilité et réglages de rétention des sondes
- `/notifications` - Historique complet des notifications, regroupé par jour avec recherche (phase 6)

## 3. Core Features
- [x] Catalogue universel de services (13 catégories) + rattachement à des projets d'entreprise et filtre par projet avec compteurs
- [x] Moteur de formulaires universel (21 types de champs, validation dynamique)
- [x] i18n FR / EN / ES / DE / AR (RTL), mode clair / sombre
- [x] Dashboard KPI (jobs, succès, échecs, durée moyenne, top services / utilisateurs / tenants)
- [x] Historique des demandes filtrable par statut
- [x] Suivi d'exécution temps réel (timeline, logs métier, résultat, erreurs standardisées)
- [x] Workflow d'approbation multi-niveaux (file d'attente, circuit visuel, approuver / rejeter avec motif)
- [x] Journal d'audit des décisions (qui, quoi, niveau, horodatage, export CSV)
- [x] Administration des connecteurs (Ascender, Jenkins, Terraform) : santé, contrôles, catalogue importé, ajout d'adaptateur
- [x] Tenants & branding : identité par tenant, logo, palette appliquée en direct (clair/sombre), domaine personnalisé + enregistrements DNS
- [x] Centre de notifications (cloche) : agrégation des événements d'exécution et des approbations en attente, filtres, état lu/non lu persistant
- [x] Export PDF du récapitulatif de demande depuis le suivi d'exécution (jsPDF)
- [x] Aperçu utilisateur plein écran du portail pour valider le branding (bureau / mobile) avant publication
- [x] Historique des notifications regroupé par jour, avec recherche et filtres
- [x] Export PDF groupé de plusieurs demandes depuis « Mes demandes »
- [x] URLs paramétrables dans l'administration : endpoint de chaque connecteur (validation + test de connexion) et URL d'accès au portail par tenant (sync avec le domaine)
- [x] Historique des tests de connexion par connecteur (dernier test, dernière erreur sur la carte, 4 derniers essais dans le détail) + bouton « Réinitialiser l'URL » vers l'adresse d'origine
- [x] URL d'accès du tenant actif affichée dans la barre latérale et dans l'email de confirmation simulé (après commande)
- [x] Filtre par santé au-dessus de la liste des connecteurs (sain / dégradé / en attente, compteurs et état vide) + export CSV du journal des tests depuis le détail d'un connecteur
- [x] Objet et corps de l'email de confirmation simulé modifiables par tenant depuis Tenants & branding (variables {{ref}}, {{service}}, {{platform}}, aperçu live)
- [x] Tri des connecteurs (dernier test / latence / dernière synchro) + récap de santé des connecteurs (sains / dégradés / en attente) dans la barre latérale, avec lien filtrant vers l'administration
- [x] Suppression d'un connecteur : bouton sur la carte et dans le détail, modale de confirmation (impact catalogue + historique de tests), toast de confirmation et état vide "aucun connecteur" avec appel à l'action
- [x] Suppression réversible (action « Annuler » dans le toast, restauration à la position d'origine), renommage d'un connecteur depuis son panneau de détail, confirmation avant réinitialisation de l'URL d'origine
- [x] Notes internes par connecteur (édition dans le détail, 500 caractères, reprises dans l'export CSV des tests), duplication d'un connecteur pour préremplir un adaptateur du même type, bandeau d'avertissement quand la configuration a changé sans nouveau test réussi
- [x] Recherche de connecteurs par nom d'hôte, URL ou note interne, export/import JSON de toute la configuration des connecteurs (partage entre environnements, aperçu nouveau/mise à jour avant import), historique des modifications de configuration par connecteur (ancien nom, ancienne URL, auteur, date)
- [x] Filtre « à re-tester » (connecteurs modifiés depuis leur dernier test réussi, combinable avec la santé et la recherche), modèle JSON vide à télécharger pour préparer une configuration hors ligne, annulation d'un import JSON depuis le toast (retour à la configuration précédente)
- [x] Test groupé de tous les connecteurs à re-tester en un clic (le filtre se purge quand tout est validé), compteur « à re-tester » dans le récap de santé de la barre latérale avec lien direct vers le filtre, export JSON restreint aux connecteurs actuellement filtrés
- [x] Bouton « Tout re-tester » directement dans le bandeau « test à relancer » du détail d'un connecteur, temps moyen de validation du dernier test groupé affiché dans le récap de santé de la barre latérale, import d'un export partiel fusionné par nom de connecteur (ou, au choix, par type d'adaptateur)
- [x] Mini-historique des 3 derniers tests groupés (moyenne, échecs, tendance) dans le détail d'un connecteur, nom du connecteur existant remplacé affiché dans l'aperçu d'import, temps moyen de validation cliquable dans la barre latérale pour lancer directement un test groupé
- [x] Catalogue : filtres réduits au projet, tri de la grille (populaires / plus rapides / A→Z), sélection d'un projet depuis le bandeau d'en-tête avec arrivée filtre appliqué (paramètre d'URL `?project=`), et regroupement automatique des services par catégorie quand un projet est sélectionné (désactivable)
- [x] PostgreSQL + API Node/Express comme unique source de données (aucun mock restant) : catalogue, demandes, approbations + audit, connecteurs, adaptateurs, tenants/branding, dashboard
- [x] Administration des adaptateurs (création, édition, suppression bloquée si utilisée par un connecteur, compteurs d'usage)
- [x] Tenants & branding persisté en base, vérification de domaine par résolution DNS réelle côté API
- [x] Déploiement Kubernetes complet (Postgres StatefulSet, Job de migration SQL automatique, API, web, Ingress) avec `deploy/deploy.sh`
- [x] Résilience front : bandeau global « API indisponible » / chargement partiel avec reconnexion automatique toutes les 15 s et bouton manuel
- [x] Page Système : santé API + PostgreSQL, métadonnées de la base, migrations appliquées et volumétrie des tables (`GET /api/system`)
- [x] Page Système : mini-historique de disponibilité 24 h (`health_probes`), diagnostic copiable et export CSV des migrations
- [x] Page Système : courbe de latence 24 h, alertes email sous 99 % de disponibilité horaire (`health_alerts`) et rétention des sondes réglable (`system_settings`)
- [x] Export CSV de la liste des adaptateurs avec leur nombre de connecteurs
- [x] Authentification SSO AWX (OAuth2 Authorization Code) : cookie de session `httpOnly`, jetons AWX stockés côté serveur, renouvellement du jeton et déconnexion
- [x] Rôles portail déduits des organisations/équipes AWX (admin / approbateur / demandeur) + garde de routes et navigation filtrée
- [x] Page Administration > Authentification : statut du SSO, URL de redirection copiable, mappings de rôles et journal des connexions
- [x] Commande de service exécutée par un job template AWX lancé avec le jeton OAuth de l'utilisateur (aucun compte de service), avec repli `AWX_JOB_TEMPLATE_ID`
- [x] Support des workflow templates AWX (`services.awx_workflow_job_template_id`) en plus des job templates, avec `awx_job_kind` sur les demandes
- [x] Carte « Job AWX » dans le suivi d'exécution : identifiant, modèle, type (job / workflow), lanceur, heure de démarrage, état traduit et lien direct vers AWX
- [x] Rafraîchissement automatique de l'état des jobs AWX en cours (8 s sur la fiche demande, 10 s sur la page de suivi, 15 s sur la liste des demandes)
- [x] Page `/awx` : vue agrégée de tous les jobs AWX du portail, KPI (total / en cours / réussis / échecs), filtres par état, utilisateur et recherche, lien AWX et lien demande
- [x] Filtrage RBAC AWX du catalogue : un service n'est proposé que si son job template (ou workflow) est accessible avec le jeton de l'utilisateur, cache d'une minute et fail-open si AWX est injoignable
- [x] Page `/admin/services` : sélecteur job template / workflow template par service, alimenté par les modèles accessibles au jeton AWX (nom résolu côté serveur, vérification RBAC à l'enregistrement)
- [x] Détail des étapes d'un workflow dans la fiche demande : un nœud par étape avec son statut réel, job AWX associé, horodatage et lien direct
- [x] Notification dans la cloche à la fin d'un job AWX (succès, échec, annulation) détectée en arrière-plan quand l'utilisateur n'est pas sur la fiche de la demande, avec snapshot local pour survivre à un rechargement
- [x] Mode lecture seule des écrans d'administration pour les approbateurs (bandeau + neutralisation des actions) sur Connecteurs, Adaptateurs, Tenants & branding, Système et Authentification
- [ ] Envoi d'un vrai email de confirmation via Resend à la soumission (bloqué : nécessite Readdy Backend ou SaaS Supabase + domaine Resend vérifié)
- [ ] Multi-tenancy, white label, RBAC
- [ ] Couche d'abstraction connecteurs branchée sur les moteurs réels (via Edge Functions)
- [ ] Notifications (email, Teams, Slack, webhook)

## 3bis. Avancement
- Phase 1 terminée : catalogue + formulaire dynamique + commande simulée
- Phase 2 terminée : dashboard KPI
- Phase 3 terminée : historique + suivi temps réel (simulation)
- Phase 4 terminée : approbations multi-niveaux (décisions simulées en local)
- Phase 5 (UI) terminée : journal d'audit des décisions + administration des connecteurs, i18n 5 langues avec RTL
- Phase 6 (UI) terminée : branding multi-tenant (identité, palette, domaine), centre de notifications, export PDF du récapitulatif
- Phase 6bis (UI) terminée : aperçu utilisateur du branding, historique des notifications par jour, export PDF groupé des demandes
- Phase 6ter (UI) terminée : URLs paramétrables (endpoint connecteur + URL d'accès portail) avec validation et test de connexion simulé
- Phase 6quater (UI) terminée : journal des tests de connexion par connecteur, réinitialisation de l'endpoint d'origine, URL du portail dans la sidebar et dans l'email simulé de confirmation
- Phase 6quinquies (UI) terminée : filtre par santé des connecteurs, export CSV du journal des tests, édition de l'objet et du corps de l'email de confirmation par tenant
- Phase 6sexies (UI) terminée : tri des connecteurs par dernier test / latence / synchro, récap de santé des connecteurs dans la barre latérale (liens vers l'admin pré-filtrée)
- Phase 6septies (UI) terminée : suppression d'un connecteur avec modale de confirmation, toast et état vide du catalogue de connecteurs
- Phase 6octies (UI) terminée : annulation de suppression depuis le toast (restauration à la position d'origine), renommage inline du connecteur dans le détail, confirmation avant restauration de l'URL d'origine
- Phase 6nonies (UI) terminée : notes internes par connecteur (reprises dans l'export CSV), duplication d'un connecteur configuré, avertissement « test à relancer » après renommage ou reconfiguration
- Phase 6decies (UI) terminée : recherche par nom d'hôte / URL / note, export et import JSON de la configuration des connecteurs, historique des modifications (ancien nom, ancienne URL, auteur)
- Phase 6undecies (UI) terminée : filtre « à re-tester », modèle JSON vide téléchargeable, annulation d'import (restauration de la configuration précédente)
- Phase 6duodecies (UI) terminée : test groupé des connecteurs à re-tester, compteur « à re-tester » cliquable dans la barre latérale, export JSON de la sélection filtrée
- Phase 6terdecies (UI) terminée : « Tout re-tester » dans le bandeau d'alerte du détail, temps moyen de validation du test groupé dans la sidebar, fusion d'import par nom de connecteur
- Phase 6quaterdecies (UI) terminée : catalogue trié (populaires / rapides / A→Z), filtre projet depuis le bandeau d'en-tête (deep link `?project=`), sections par catégorie quand un projet est actif
- Phase 7 terminée : bascule sur PostgreSQL + API Node (plus aucun mock), Job de migration Kubernetes, administration des adaptateurs
- Phase 8 terminée : supervision (bandeau de reconnexion auto, page Système), export CSV des adaptateurs
- Phase 9 terminée : historique de disponibilité 24 h alimenté par les sondes, diagnostic copiable, export CSV des migrations
- Phase 10 terminée : courbe de latence 24 h, alertes email horaires via Resend, rétention des sondes réglable depuis la page Système
- Phase 11 terminée : authentification SSO AWX (OAuth2), sessions serveur, rôles issus des organisations/équipes AWX, page de connexion et administration de l'authentification
- Phase 12 terminée : exécution par job/workflow template AWX avec le jeton utilisateur, suivi agrégé `/awx`, rafraîchissement automatique des jobs en cours, filtrage RBAC du catalogue et administration en lecture seule pour les approbateurs
- Phase 13 terminée : sélection des modèles AWX par service dans l'administration, détail des étapes de workflow dans la fiche demande et notifications de fin de job AWX dans la cloche
- Phase 14 terminée : fusion AWX / Ascender (migration `008_ascender_connector.sql`). Un seul adaptateur et un seul connecteur « Ascender », géré par le serveur (variables `AWX_*`) : URL en lecture seule, test réel `/api/v2/ping/`, import du catalogue réel (job + workflow templates via le jeton SSO), jobs 24 h calculés depuis les demandes. Libellés visibles « AWX » → « Ascender » ; le code interne garde le préfixe `awx`. Correctif : `/api/v2/me/` lu comme liste paginée.
- Phase 15 terminée : consolidation. Dépôt git + lockfiles (`npm ci`), authentification fermée si la configuration Ascender est incomplète, circuit d'approbation appliqué (aucun job avant la décision finale, lancement avec le jeton du demandeur, auto-approbation interdite), cloisonnement par rôle (demandeur / approbateur par tenant / admin), validation serveur des formulaires, jetons chiffrés en base, CORS strict, helmet, limitation de débit, tests d'API (PGlite + faux Ascender) et CI, bundle découpé par page, traductions ES / DE / AR complètes, `npm run dev:local`.

## 4. Data Model Design (implémenté dans `db/001_schema.sql`)
projects, categories, form_schemas, services, tenants, users, requests, execution_details, approvals, approval_levels, audit_events, adapters, connectors (checks / tests / history / catalog), batch_tests + vues d'agrégation du dashboard.

## 5. Backend / Third-party Integration Plan
- Données : PostgreSQL déployé dans le cluster, accédé exclusivement par l'API Node (`api/`) — le navigateur ne parle qu'en JSON
- Migrations : `db/*.sql` montés dans la ConfigMap `asp-db-init`, appliqués par le Job `asp-db-migrate` (table `schema_migrations`). `003_health_probes.sql` ajoute la table des sondes de disponibilité, `004_system_settings.sql` les réglages de supervision (`system_settings`) et le journal d'alertes (`health_alerts`).
- Connecteur Ascender : Edge Function proxy (token stocké en secret) — phase ultérieure
- Authentification : AWX comme fournisseur OAuth2 (Authorization Code). `api/src/awx.js` (authorize, token, refresh, identité + memberships), `api/src/auth.js` (sessions, cookie httpOnly, résolution des rôles, middlewares), `api/src/routes/auth.js` (`/api/auth/*`, mappings, journal). Table `auth_sessions`, `awx_role_mappings`, `auth_events` (migration `005_auth_awx.sql`). Secret Kubernetes `asp-auth` (`AWX_CLIENT_SECRET`, `AWX_REDIRECT_URI`).
- Exécution AWX : `api/src/awxJobs.js` (résolution du modèle, lancement job ou workflow avec le jeton de session, synchronisation d'état), `api/src/awxRbac.js` (droits AWX de l'utilisateur, cache 60 s). Colonnes `requests.awx_*` et `services.awx_*` (migrations `006_awx_jobs.sql`, `007_awx_workflows.sql`), routes `GET /api/awx/jobs`, `POST /api/requests/:id/awx/launch` et `/sync`.
- Administration des modèles : `api/src/routes/adminServices.js` (`GET /api/admin/services`, `GET /api/admin/awx/templates`, `PATCH /api/admin/services/:id`), lecture des étapes de workflow via `GET /api/requests/:id/awx/workflow`. Côté navigateur : `src/pages/admin/services/`, `WorkflowNodesCard`, `useAwxWatcher` et `src/utils/awxNotifications.ts`.

## 6. Development Phase Plan
### Phase 1: Catalogue + formulaires dynamiques (en cours)
### Phase 2: Dashboard KPI
### Phase 3: Historique + suivi d'exécution temps réel
### Phase 4: Approbations
### Phase 5: Backend, auth, multi-tenancy, white label
### Phase 6: Connecteur Ascender (job_templates, survey_spec → UniversalFormSchema, launch, events)