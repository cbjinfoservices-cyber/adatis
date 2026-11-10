# Installation — ASP Automation Service Portal

Package hors ligne pour Kubernetes : images, manifestes, scripts SQL et
script de déploiement. La version figure dans `VERSION`. Il embarque aussi
k3s (avec son contrôleur Ingress Traefik) pour une installation sur VM vierge.

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

## Cluster existant — prérequis sur la machine d'installation

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

`install.sh` vérifie l'intégrité et l'exhaustivité du package (`SHA256SUMS`),
charge les images puis lance `deploy/deploy.sh --skip-build`. `config.env` est
lu comme un fichier de valeurs, jamais exécuté comme un script. Les options de
`deploy.sh` lui sont transmises, par exemple `bash install.sh --no-ingress`.

## Installation Windows (cluster existant)

Pour un cluster déjà en service, depuis le package `asp-portal-<version>-windows.zip`
(sans k3s) :

Prérequis : Docker Desktop démarré, `kubectl` avec un kubeconfig vers le cluster
cible, et Git Bash (Git for Windows). WSL n'est pas utilisable : il ne voit pas les
variables d'environnement Windows.

```powershell
Expand-Archive asp-portal-<version>-windows.zip -DestinationPath .
cd asp-portal-<version>
Copy-Item config.env.example config.env    # renseigner domaine, HTTPS, Ascender
.\install.ps1
.\install.ps1 -DeployArgs '--no-ingress'   # options de deploy.sh
```

`install.ps1` vérifie `SHA256SUMS`, charge `images\images.tar.gz` dans Docker
(et pousse vers `REGISTRY` si défini), puis lance `deploy/deploy.sh --skip-build`.
Les ACL de `config.env` sont réduites à l'utilisateur courant, SYSTEM et
Administrators ; le fichier ne doit pas être stocké sur un volume sans ACL NTFS.

## Construction des packages

Depuis Windows, Docker Desktop démarré (`deploy\package\build-package.ps1`) :

```powershell
.\deploy\package\build-package.ps1 -Version 1.0.0 -CosignKey C:\secure\cosign.key
.\deploy\package\build-package.ps1 -Version 1.0.0 -CosignKey C:\secure\cosign.key -NoK3s
```

Produit dans `deploy\package\dist\` :
- `asp-portal-<version>.tar.gz` : package Linux (k3s embarqué, binaire et images
  vérifiés contre `sha256sum-<arch>.txt` de la release ; `install.sh` vérifié
  contre son empreinte épinglée) ;
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
