# Où modifier quoi

Guide pratique pour faire évoluer le portail. Démarrage local et modèle de
sécurité : [README.md](README.md).

## Avant de pousser

```sh
npm run check                         # types + lint + tests (front et API)
npm run build && npm run test:e2e     # navigateur, si une page a changé
```

La CI (`.github/workflows/ci.yml`) rejoue tout cela, plus les scans de sécurité.

## Carte du dépôt

| Je veux changer…                         | Où                                                        |
|------------------------------------------|-----------------------------------------------------------|
| Une page                                 | `src/pages/<page>/page.tsx` et son dossier `components/`  |
| Un composant partagé (toast, états vides)| `src/components/base/`                                    |
| L'ossature (menu, en-tête)               | `src/components/feature/AppShell.tsx`                     |
| Un appel à l'API côté navigateur         | `src/utils/<domaine>.ts` (via `api` de `src/utils/api.ts`)|
| Les données chargées au démarrage        | `src/utils/store.ts` (`useStore`, `reloadStore`)          |
| Un texte affiché                         | `src/i18n/local/<langue>/common.ts`                       |
| Une route de l'API                       | `api/src/routes/<domaine>.js`                             |
| Une règle d'accès (rôle, périmètre)      | `api/src/server.js` (rôles) et `api/src/access.js` (périmètre) |
| Le dialogue avec Ascender                | `api/src/awx.js` (HTTP) et `api/src/awxJobs.js` (cycle de vie des jobs) |
| Le schéma de la base                     | une nouvelle migration dans `db/`                         |
| Le déploiement                           | `deploy/` (voir `deploy/README.md`)                       |

## Ajouter une page

1. Créer `src/pages/<nom>/page.tsx`, qui exporte un composant par défaut
   enveloppé dans `<AppShell>`.
2. La déclarer dans `src/router/config.tsx` avec `lazy(() => import(...))` :
   chaque page reste un fichier chargé à la demande.
3. Ajouter le lien dans `NAV` de `AppShell.tsx`, ou dans `TABS` de
   `src/pages/admin/components/AdminTabs.tsx` pour une page d'administration.
4. Ajouter le chemin à `ROUTES` dans `scripts/e2e-smoke.mjs` (pages visitées
   par le test navigateur).

Une page ne devrait pas dépasser ~250 lignes. Au-delà, sortir :

- les blocs d'affichage dans `components/` ;
- les appels à l'API dans un hook `use<Nom>Actions.ts` ;
- l'état synchronisé avec l'URL dans un hook `use<Nom>Filters.ts`.

`src/pages/admin/connectors/` montre ce découpage. Pour un message éphémère,
utiliser `useToast()` (`src/hooks/useToast.ts`) et `<Toast>`.

## Ajouter un texte (traduction)

1. Ajouter la clé dans `src/i18n/local/fr/common.ts` : le français est la référence.
2. Ajouter la même clé dans `en`, `es`, `de` et `ar`. Ces fichiers sont typés
   à partir du français : une clé oubliée ou en trop fait échouer
   `npm run type-check`.
3. Dans un composant : `const { t } = useTranslation();` puis `t('ma_cle')`.

Le test navigateur échoue si une clé brute apparaît à l'écran.

## Ajouter une route à l'API

1. Ajouter la route dans le routeur du domaine (`api/src/routes/`), ou créer
   un fichier et le monter dans `api/src/server.js` avec
   `app.use('/api', monRouteur)`.
2. Accès : toute route `/api` exige une session. Une écriture réservée aux
   administrateurs s'ajoute à `ADMIN_WRITE_PREFIXES` dans `server.js`. Pour
   une demande, filtrer avec `scopeOf` / `scopeSql` / `canSee` (`access.js`) :
   `findVisible(req)` (`api/src/requestQueries.js`) le fait déjà.
3. SQL : toujours paramétré (`q('… WHERE id = $1', [id])`), jamais concaténé.
4. Les écritures sont journalisées automatiquement (`audit.middleware`).
5. Ajouter un test dans `api/test/` : `api/testing/helpers.js` démarre l'API
   sur un vrai PostgreSQL en mémoire (PGlite) avec un faux Ascender.

L'API reste en JavaScript, vérifié par TypeScript via JSDoc
(`npm --prefix api run type-check`). Les types partagés (`req.auth`, erreurs
HTTP) sont dans `api/src/types.d.ts`. Annoter les paramètres d'une nouvelle
fonction exportée : c'est ce qui permettra de passer plus tard en `strict`.

## Ajouter une migration

1. Créer `db/NNN_description.sql` avec le numéro suivant (`014_…`).
2. Ne jamais modifier une migration déjà livrée : elle ne serait pas rejouée.
   `schema_migrations` retient ce qui a été appliqué.
3. Elle est prise en compte automatiquement par les tests de l'API, par
   `npm run dev:local` (sauf base existante : `-- --reset`) et, au
   déploiement, par le Job `asp-db-migrate` (`db/migrate.sh`).
4. Ajouter le mappage colonne → JSON dans `api/src/mappers.js` si l'API doit
   renvoyer la nouvelle colonne.

## Tests

| Quoi                           | Où                          | Commande             |
|--------------------------------|-----------------------------|----------------------|
| Logique pure du front          | `src/utils/__tests__/`      | `npm test`           |
| API (routes, droits, Ascender) | `api/test/`                 | `npm run test:api`   |
| Parcours navigateur            | `scripts/e2e-smoke.mjs`     | `npm run test:e2e`   |

Une fonction qui calcule, filtre, trie ou valide n'a rien à faire dans un
composant : la mettre dans `src/utils/` et la tester.
