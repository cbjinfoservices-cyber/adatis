# Installation — ASP Automation Service Portal

Package hors ligne pour Kubernetes : images, manifestes, scripts SQL et
script de déploiement. La version figure dans `VERSION`. Il embarque aussi
k3s (avec son contrôleur Ingress Traefik) pour une installation sur VM vierge.

## VM Linux vierge (aucun accès Internet nécessaire)

Prérequis : Linux 64 bits (même architecture que le package, voir
`K3S_ARCH` dans `VERSION`), 2 vCPU, 4 Go de RAM, 20 Go de disque, accès
root ou `sudo`, `openssl`. Un nom DNS (`DOMAIN`) pointant vers la VM.

```sh
tar xzf asp-portal-<version>.tar.gz
cd asp-portal-<version>
cp config.env.example config.env    # DOMAIN, HTTPS, Ascender
sudo ./install.sh
```

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
./install.sh
```

`install.sh` vérifie l'intégrité du package (`SHA256SUMS`), charge les images
puis lance `deploy/deploy.sh --skip-build`. Les options de `deploy.sh` lui sont
transmises, par exemple `./install.sh --no-ingress`.

## Mise à jour

Même procédure avec le nouveau package : la base est conservée, le Job
`asp-db-migrate` n'applique que les scripts SQL nouveaux.

## Après la première installation

Le portail démarre sans données : aucun service au catalogue ni tenant.
Avec `AUTH_MODE=awx`, le portail reste fermé (503) tant que `AWX_BASE_URL`,
`AWX_CLIENT_ID` et `AWX_CLIENT_SECRET` ne sont pas renseignés.

Détails (HTTPS, SSO, alertes, dépannage) : `deploy/README.md`.
