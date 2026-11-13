# Installation — ASP Automation Service Portal

Package de déploiement Kubernetes : manifestes, scripts SQL et script de
déploiement. Selon sa variante, il peut embarquer les images applicatives et
k3s, ou réutiliser les images déjà accessibles au cluster de production.

Avant toute extraction, vérifier la signature détachée de l'archive avec la clé
publique de confiance remise séparément :

```sh
cosign verify-blob --key cosign.pub \
  --bundle asp-portal-<version>.tar.gz.sigstore.json asp-portal-<version>.tar.gz
```

La vérification doit réussir avant l'extraction. Pour l'archive Windows, utiliser
les mêmes options avec `asp-portal-<version>-windows.zip` et son fichier
`.zip.sigstore.json`.
Le fichier `SHA256SUMS` détecte ensuite les fichiers manquants ou altérés dans
le package ; il ne remplace pas la signature Cosign qui authentifie l'éditeur.

## VM Linux vierge (aucun accès Internet nécessaire)

Prérequis : Linux 64 bits (même architecture que le package, voir
`K3S_ARCH` dans `VERSION`), 2 vCPU, 4 Go de RAM, 20 Go de disque, accès
root ou `sudo`, `openssl`. Un nom DNS (`DOMAIN`) pointant vers la VM.

```sh
tar xzf asp-portal-<version>.tar.gz
cd asp-portal-<version>
cp config.env.example config.env    # DOMAIN, HTTPS, Ascender
sudo bash install.sh
```

Utiliser `bash install.sh` : le transfert du package peut retirer le bit
d'exécution des scripts.

Le bundle Linux K3s conserve le binaire et le script d'installation officiels
vérifiés, mais l'archive d'images est dérivée : klipper-helm, klipper-lb et
local-path-provisioner sont remplacés sous les tags attendus par K3s.
Les digests amont, le commit source du composant reconstruit et l'empreinte de
l'archive officielle initiale sont consignés dans
`k3s/K3S-IMAGE-OVERRIDES.txt` et `VERSION`. Cette distribution n'est donc pas
un bundle Rancher/K3s non modifié.

Seules ces trois images ont été ciblées par cette correction. Elle ne certifie
pas l'absence de vulnérabilités dans le binaire K3s, les autres images, ni le
package complet. Vérifier le rapport de scan applicable à l'environnement et
valider la compatibilité dans une plateforme de préproduction avant déploiement.

Sans cluster configuré sur la machine, `install.sh` installe k3s (service
systemd `k3s`) avec Traefik sur les ports 80/443 de la VM, puis le portail. Sans certificat fourni, `TLS_SELF_SIGNED=true` génère un
certificat auto-signé (tests uniquement : en production, un certificat
reconnu évite d'habituer les utilisateurs à ignorer les alertes).

Sécurité de la VM :
- pare-feu : n'exposer que 443 et 80/tcp (et SSH) ; **bloquer 6443 (API
  Kubernetes) et 10250 (kubelet)** depuis l'extérieur ; autoriser en interne
  les réseaux 10.42.0.0/16 et 10.43.0.0/16 (pods k3s) ;
- `config.env` contient des secrets : droits 600 (corrigés par `install.sh`),
  à conserver pour les mises à jour dans un répertoire réservé à root ;
- les secrets Kubernetes sont chiffrés sur disque (`--secrets-encryption`).
- `API_EGRESS_CIDR` doit être renseigné pour un déploiement prod et limité aux
  réseaux nécessaires (Ascender, SMTP et connecteurs), jamais `0.0.0.0/0`.

Commandes utiles ensuite : `sudo k3s kubectl -n asp-portal get pods`.
Désinstallation complète : `sudo /usr/local/bin/k3s-uninstall.sh`
(supprime aussi la base).

## Package sans images — cluster de production existant

Cette variante n'embarque ni archive d'images ni k3s et ne nécessite pas Docker.
Le cluster doit déjà fonctionner et pouvoir récupérer les images configurées
dans `config.env` (ou les avoir préchargées sur ses nœuds).

```sh
tar xzf asp-portal-<version>.tar.gz
cd asp-portal-<version>
cp config.env.example config.env
```

Dans `config.env`, renseigner les références exactes des images existantes :
`API_IMAGE`, `WEB_IMAGE`, `POSTGRES_IMAGE` et `BUSYBOX_IMAGE`. Si les images
suivent le nom/tag `asp-api:<version>`, `asp-web:<version>` et
`asp-postgres:<version>`, la configuration peut rester vide ou utiliser
`REGISTRY` pour préfixer les trois images applicatives. `BUSYBOX_IMAGE` reste
une référence distincte. Laisser `REGISTRY` vide si les images sont déjà
préchargées localement ; avec un registre, les références doivent être
accessibles aux nœuds Kubernetes.

```sh
bash install.sh
```

L'installateur vérifie `SHA256SUMS`, ne charge ni ne pousse aucune image, puis
déploie les références configurées. Il ne faut pas utiliser cette variante pour
installer un nouveau cluster.

## Package sans archive d'images — construction depuis les sources

Le mode `-BuildFromSource` inclut les sources de l'API et du frontend ainsi que
leurs Dockerfiles, mais aucune image applicative. L'installateur construit les
images API, web et PostgreSQL puis les déploie. Il nécessite Docker fonctionnel,
un accès réseau aux registres d'images de base et au registre npm, ainsi qu'un
registre d'images (`REGISTRY`) accessible aux nœuds du cluster, notamment pour
un cluster multi-nœuds. Les images BusyBox restent récupérées selon la référence
`BUSYBOX_IMAGE`.

Renseigner `REGISTRY` et les paramètres de production dans `config.env`, puis :

```sh
tar xzf asp-portal-<version>.tar.gz
cd asp-portal-<version>
cp config.env.example config.env
bash install.sh
```

Cette variante ne contient pas l'application compilée : les images sont
construites à l'installation depuis les sources embarquées.

## Cluster existant — prérequis pour un package avec images

- `kubectl` et un **kubeconfig** donnant accès au cluster cible : `KUBECONFIG`
  dans `config.env`, sinon `~/.kube/config`. Sur un nœud k3s ou microk8s,
  celui du nœud est utilisé automatiquement.
- pour charger les images, l'un de :
  - `REGISTRY` renseigné + `docker` (cluster multi-nœuds) ;
  - un nœud **k3s** ou **microk8s** (import direct dans containerd) ;
  - `docker` partagé avec le cluster (Docker Desktop, nœud unique).
- pour un domaine public : le contrôleur Ingress **Traefik** (CRD
  `traefik.io`, inclus dans k3s) et une source de certificat HTTPS
  (cert-manager, ou fichiers PEM).

## Installation

```sh
tar xzf asp-portal-<version>.tar.gz
cd asp-portal-<version>
cp config.env.example config.env    # renseigner domaine, HTTPS, Ascender
bash install.sh
```

Pour un package avec images, `install.sh` vérifie l'intégrité et l'exhaustivité
du package (`SHA256SUMS`), charge les images puis lance
`deploy/deploy.sh --skip-build`. `config.env` est lu comme un fichier de valeurs,
jamais exécuté comme un script. Les options de `deploy.sh` lui sont transmises,
par exemple `bash install.sh --no-ingress`.
L'image PostgreSQL du package est construite depuis une base Alpine épinglée,
avec les paquets système mis à niveau au build ; elle est incluse avec les
images API et frontend.

## Installation Windows (cluster existant)

Pour un cluster déjà en service, depuis le package
`asp-portal-<version>-windows.zip` :

Prérequis : `kubectl` avec un kubeconfig vers le cluster cible et Git Bash
(Git for Windows). Docker Desktop est requis si le package contient les images
ou si `BUILD_FROM_SOURCE=true`. WSL n'est pas utilisable : il ne voit pas les
variables d'environnement Windows.

```powershell
Expand-Archive asp-portal-<version>-windows.zip -DestinationPath .
cd asp-portal-<version>
Copy-Item config.env.example config.env    # renseigner domaine, HTTPS, Ascender
.\install.ps1
.\install.ps1 -DeployArgs '--no-ingress'   # options de deploy.sh
```

`install.ps1` vérifie `SHA256SUMS`. Un package avec images les charge dans
Docker (et les pousse vers `REGISTRY` si défini) ; un package sans images
réutilise les images indiquées dans `config.env`, sauf en mode
`BUILD_FROM_SOURCE=true` où il construit les images avec Docker. Les images
construites sont poussées vers `REGISTRY` si défini. Seul le mode qui réutilise
les images lance `deploy/deploy.sh --skip-build`.
Les ACL de `config.env` sont réduites à l'utilisateur courant, SYSTEM et
Administrators ; le fichier ne doit pas être stocké sur un volume sans ACL NTFS.

## Construction des packages

Depuis Windows, Docker Desktop démarré (`deploy\package\build-package.ps1`) :

```powershell
.\deploy\package\build-package.ps1 -Version 1.0.0 -CosignKey C:\secure\cosign.key
.\deploy\package\build-package.ps1 -Version 1.0.0 -CosignKey C:\secure\cosign.key -NoK3s
.\deploy\package\build-package.ps1 -Version 1.0.0 -CosignKey C:\secure\cosign.key -NoK3s -NoImages
.\deploy\package\build-package.ps1 -Version 1.0.0 -CosignKey C:\secure\cosign.key -NoK3s -NoImages -BuildFromSource
```

`-NoImages -NoK3s` produit une variante pour un cluster existant, sans Docker
et sans archive d'images. Renseigner les images accessibles dans le `config.env`
livré avec le package, ou les passer avec `-ApiImageRef`, `-WebImageRef`,
`-PostgresImageRef` et `-BusyboxImageRef` pour les inscrire dans `VERSION`.
Ajouter `-BuildFromSource` inclut le code source et les Dockerfiles : Docker
construit l'API, le frontend et PostgreSQL lors de l'installation. Cette variante
nécessite Docker, un accès aux registres de dépendances pendant le build et
`REGISTRY` pour rendre les images disponibles à un cluster distant ou multi-nœuds.
Sans `-BuildFromSource`, le package sans images reste un simple déploiement des
images déjà publiées/référencées.
Depuis un environnement Linux/Git Bash, l'équivalent est :

```sh
BUILD_FROM_SOURCE=true INCLUDE_IMAGES=false BUNDLE_K3S=false ./scripts/package.sh
```
La construction Linux avec images charge d'abord l'archive officielle K3s vérifiée, remplace
les trois images sélectionnées et exporte l'ensemble des huit images attendues
dans une nouvelle archive. Elle est validée uniquement pour K3s
`v1.36.6+k3s1`; une autre version est refusée tant que ses tags et sa compatibilité
n'ont pas été vérifiés. Produit dans `deploy\package\dist\` :
- `asp-portal-<version>.tar.gz` : package Linux (binaire K3s et archive source
  vérifiés contre les empreintes de release ; script `install.sh` vérifié contre
  son empreinte épinglée ; archive d'images dérivée avec provenance tracée) ;
- `asp-portal-<version>-windows.zip` : package Windows (sans k3s, avec `install.ps1`).
- un bundle de signature `.sigstore.json` pour chaque archive, créé avec `-CosignKey`. La clé privée
  ne doit jamais être commitée ni incluse dans le package ; remettre la clé publique
  (`cosign.pub`) aux équipes d'installation par un canal distinct.

Les images sont construites pour `linux/amd64` (ou `linux/arm64` avec
`-K3sArch arm64`). Le package doit correspondre à l'architecture de la VM cible.
`-AllowUnsigned` est réservé aux builds de test et ne doit pas servir à publier
un package de production.
Pour modifier `K3sVersion`, fournir aussi l'empreinte SHA-256 de confiance du
`install.sh` correspondant via `-K3sInstallSha256`.

## Mise à jour

Même procédure avec le nouveau package : la base est conservée, le Job
`asp-db-migrate` n'applique que les scripts SQL nouveaux.

## Après la première installation

Le portail démarre sans données : aucun service au catalogue ni tenant.
Avec `AUTH_MODE=awx`, le portail reste fermé (503) tant que `AWX_BASE_URL`,
`AWX_CLIENT_ID` et `AWX_CLIENT_SECRET` ne sont pas renseignés.

Détails (HTTPS, SSO, alertes, dépannage) : `deploy/README.md`.
