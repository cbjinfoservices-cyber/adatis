-- ============================================================================
-- Catalogue de services de test — chargé par les tests (api/testing/helpers.js)
-- et le test navigateur (scripts/e2e-smoke.mjs), jamais en production.
-- ============================================================================

INSERT INTO services (id, category_id, name_fr, name_en, description_fr, description_en, icon, approval, estimated_minutes, popularity, form_id, tags) VALUES
('create-linux-server','infrastructure','Créer un serveur Linux','Create a Linux server','VM Linux durcie (RHEL, Rocky, Ubuntu, Debian) avec supervision et sauvegarde activées.','Hardened Linux VM (RHEL, Rocky, Ubuntu, Debian) with monitoring and backup enabled.','ri-terminal-box-line','manager',12,1284,'vm',ARRAY['vm','linux']),
('create-windows-server','infrastructure','Créer un serveur Windows','Create a Windows server','Windows Server 2022 joint au domaine, antivirus et correctifs appliqués.','Windows Server 2022 domain-joined with antivirus and patches applied.','ri-windows-line','manager',18,642,'vm',ARRAY['vm','windows']),
('resize-server','infrastructure','Modifier CPU/RAM','Resize CPU/RAM','Ajustez les ressources d''un serveur existant avec fenêtre de maintenance planifiée.','Adjust resources of an existing server with a scheduled maintenance window.','ri-cpu-line','technical',6,511,'resize',ARRAY['vm']),
('delete-server','infrastructure','Supprimer un serveur','Delete a server','Décommissionnement complet : sauvegarde finale, retrait DNS, CMDB et supervision.','Full decommissioning: final backup, DNS, CMDB and monitoring removal.','ri-delete-bin-6-line','multi',9,203,'delete',ARRAY['vm']),
('create-dns-record','network','Créer une entrée DNS','Create a DNS record','Enregistrement A, AAAA, CNAME ou TXT dans les zones internes ou publiques.','A, AAAA, CNAME or TXT record in internal or public zones.','ri-global-line','none',2,1876,'dns',ARRAY['dns']),
('add-firewall-rule','network','Ajouter une règle Firewall','Add a firewall rule','Ouverture de flux entre segments réseau avec traçabilité et expiration.','Open flows between network segments with traceability and expiry.','ri-fire-line','security',15,934,'firewall',ARRAY['firewall']),
('create-load-balancer','network','Créer un Load Balancer','Create a load balancer','VIP HTTP/HTTPS avec health-checks et certificat TLS automatique.','HTTP/HTTPS VIP with health checks and automatic TLS certificate.','ri-scales-3-line','technical',10,318,'generic',ARRAY['lb']),
('deploy-application','applications','Déployer une application','Deploy an application','Déploiement d''une version applicative sur un environnement cible.','Deploy an application version to a target environment.','ri-rocket-2-line','none',7,2410,'deploy',ARRAY['deploy']),
('rollback-application','applications','Rollback','Rollback','Retour à la version précédente stable en un clic.','Return to the previous stable version in one click.','ri-arrow-go-back-line','none',4,387,'deploy',ARRAY['deploy']),
('create-environment','applications','Créer un environnement','Create an environment','Environnement complet (dev, recette, préprod) avec réseau et accès.','Full environment (dev, QA, staging) with network and access.','ri-stack-line','manager',35,156,'generic',ARRAY['env']),
('create-postgresql','databases','Créer PostgreSQL','Create PostgreSQL','Instance PostgreSQL haute dispo avec sauvegardes PITR.','Highly available PostgreSQL instance with PITR backups.','ri-database-2-line','technical',14,721,'database',ARRAY['postgres']),
('create-mysql','databases','Créer MySQL','Create MySQL','Instance MySQL 8 répliquée, prête pour la production.','Replicated MySQL 8 instance, production ready.','ri-database-line','technical',14,402,'database',ARRAY['mysql']),
('restore-backup','backup','Restaurer une sauvegarde','Restore a backup','Restauration d''une base ou d''un serveur à une date précise.','Restore a database or server to a precise point in time.','ri-history-line','manager',25,189,'restore',ARRAY['backup']),
('create-k8s-namespace','containers','Créer un namespace Kubernetes','Create a Kubernetes namespace','Namespace avec quotas, RBAC et politiques réseau par défaut.','Namespace with quotas, RBAC and default network policies.','ri-ship-2-line','none',3,655,'generic',ARRAY['k8s']),
('create-certificate','security','Générer un certificat TLS','Generate a TLS certificate','Certificat signé par la PKI interne ou publique avec renouvellement auto.','Certificate signed by internal or public PKI with auto-renewal.','ri-lock-password-line','security',5,498,'generic',ARRAY['tls']),
('create-user-account','identity','Créer un compte utilisateur','Create a user account','Compte annuaire avec groupes et accès applicatifs.','Directory account with groups and application access.','ri-user-add-line','manager',2,1102,'generic',ARRAY['ldap']),
('create-s3-bucket','storage','Créer un bucket objet','Create an object bucket','Bucket compatible S3 chiffré avec politique de rétention.','Encrypted S3-compatible bucket with retention policy.','ri-hard-drive-2-line','none',2,276,'generic',ARRAY['s3']),
('add-monitoring','monitoring','Ajouter une supervision','Add monitoring','Sondes, tableaux de bord et alertes pour un service existant.','Probes, dashboards and alerts for an existing service.','ri-pulse-line','none',4,341,'generic',ARRAY['monitoring']);

-- Comme la migration 010 : services rattachés au connecteur Ascender.
UPDATE services
   SET connector_id = (SELECT id FROM connectors WHERE kind = 'ascender' ORDER BY id LIMIT 1)
 WHERE connector_id IS NULL;
