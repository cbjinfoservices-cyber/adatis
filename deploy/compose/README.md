# Déploiement Docker Compose (sans Kubernetes)

Pile : PostgreSQL, migrations SQL, API, SPA et un proxy `gateway` (`/api` → API,
le reste → SPA). Aucun `kubeconfig` n'est nécessaire, seulement Docker.

```sh
cd deploy/compose
cp env.example .env          # renseigner au minimum DB_PASSWORD
docker compose up -d --build
```

Les images API, PostgreSQL et gateway sont reconstruites sans cache et avec
récupération des images de base épinglées, afin d'intégrer les mises à jour
Alpine disponibles au moment du build.

Portail : http://localhost:8080 (`HTTP_PORT`). L'écoute est limitée à
`127.0.0.1` (`HTTP_BIND`).

Commandes utiles :

```sh
docker compose ps
docker compose logs -f api
docker compose exec postgres pg_dump -U asp asp_portal > backup.sql
docker compose down            # conserve la base (volume postgres-data)
docker compose down -v         # supprime aussi la base
```

Mise à jour : `git pull && docker compose up -d --build` ; seules les nouvelles
migrations sont appliquées.

## Limites par rapport à Kubernetes

L'image API tourne en `NODE_ENV=development` par défaut : HTTP autorisé et
portail ouvert tant que `AUTH_MODE=disabled`. Pour activer le SSO Ascender,
renseigner `AUTH_MODE=awx` et les variables `AWX_*` du `.env`.

Le mode `production` de l'API exige HTTPS, SSO, `TOKEN_ENCRYPTION_KEY` et une
connexion PostgreSQL en TLS ; ce compose ne fournit pas ce TLS interne. Pour
une exposition sur Internet, utiliser le déploiement Kubernetes
(`deploy/README.md`).
