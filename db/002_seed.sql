-- ============================================================================
-- ASP Automation Service Portal — jeu de données de démarrage (Migration 002)
-- Toutes les données sont réelles et traduites FR/EN, prêtes pour la production
-- de démonstration. Idempotent : TRUNCATE puis INSERT.
-- ============================================================================

BEGIN;

TRUNCATE batch_tests, connector_catalog, connector_history, connector_tests,
         connector_checks, connectors, adapters,
         audit_events, approval_levels, approvals,
         execution_details, requests,
         users, tenants, services, form_schemas, categories, projects
  RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------------
-- Projets & catégories
-- ---------------------------------------------------------------------------
INSERT INTO projects (id, icon, sort_order) VALUES
  ('crm',           'ri-team-line',        1),
  ('cloud',         'ri-cloud-line',       2),
  ('soc2',          'ri-shield-check-line',3),
  ('hr',            'ri-user-heart-line',  4),
  ('observability', 'ri-pulse-line',       5);

INSERT INTO categories (id, icon, sort_order) VALUES
  ('infrastructure','ri-server-line',        1),
  ('cloud',         'ri-cloud-line',         2),
  ('containers',    'ri-ship-2-line',        3),
  ('applications',  'ri-apps-2-line',        4),
  ('databases',     'ri-database-2-line',    5),
  ('network',       'ri-share-line',         6),
  ('security',      'ri-shield-keyhole-line',7),
  ('storage',       'ri-hard-drive-2-line',  8),
  ('identity',      'ri-user-settings-line', 9),
  ('messaging',     'ri-mail-send-line',     10),
  ('monitoring',    'ri-pulse-line',         11),
  ('backup',        'ri-archive-drawer-line',12),
  ('custom',        'ri-tools-line',         13);

-- ---------------------------------------------------------------------------
-- Schémas de formulaire universels
-- ---------------------------------------------------------------------------
INSERT INTO form_schemas (id, title_fr, title_en, fields) VALUES
('vm', 'Créer un serveur', 'Create a server', $js$[
 {"name":"hostname","type":"text","label":{"fr":"Nom d'hôte","en":"Hostname"},"required":true,"placeholder":"web-prd-01","section":{"fr":"Identification","en":"Identification"},"validation":{"regex":"^[a-z][a-z0-9-]{2,30}$","max_length":31},"help":{"fr":"Minuscules, chiffres et tirets.","en":"Lowercase, digits and dashes."}},
 {"name":"environment","type":"radio","label":{"fr":"Environnement","en":"Environment"},"required":true,"options":[{"value":"dev","label":{"fr":"Développement","en":"Development"}},{"value":"qa","label":{"fr":"Recette","en":"QA"}},{"value":"staging","label":{"fr":"Préproduction","en":"Staging"}},{"value":"prod","label":{"fr":"Production","en":"Production"}}],"default":"dev","section":{"fr":"Identification","en":"Identification"}},
 {"name":"os","type":"select","label":{"fr":"Système","en":"Operating system"},"required":true,"options":[{"value":"rhel9","label":{"fr":"RHEL 9","en":"RHEL 9"}},{"value":"rocky9","label":{"fr":"Rocky Linux 9","en":"Rocky Linux 9"}},{"value":"ubuntu2404","label":{"fr":"Ubuntu 24.04 LTS","en":"Ubuntu 24.04 LTS"}},{"value":"debian12","label":{"fr":"Debian 12","en":"Debian 12"}},{"value":"win2022","label":{"fr":"Windows Server 2022","en":"Windows Server 2022"}}],"section":{"fr":"Configuration","en":"Configuration"}},
 {"name":"cpu","type":"integer","label":{"fr":"vCPU","en":"vCPU"},"required":true,"default":2,"validation":{"min":1,"max":32},"section":{"fr":"Configuration","en":"Configuration"}},
 {"name":"ram_gb","type":"integer","label":{"fr":"RAM (Go)","en":"RAM (GB)"},"required":true,"default":4,"validation":{"min":1,"max":256},"section":{"fr":"Configuration","en":"Configuration"}},
 {"name":"disk_gb","type":"float","label":{"fr":"Disque données (Go)","en":"Data disk (GB)"},"default":50,"validation":{"min":10,"max":4096},"section":{"fr":"Configuration","en":"Configuration"}},
 {"name":"ip_address","type":"text","label":{"fr":"Adresse IP fixe (optionnel)","en":"Static IP (optional)"},"placeholder":"10.20.30.40","validation":{"format":"ip"},"section":{"fr":"Réseau","en":"Network"}},
 {"name":"subnet","type":"text","label":{"fr":"Sous-réseau","en":"Subnet"},"required":true,"placeholder":"10.20.30.0/24","validation":{"format":"cidr"},"section":{"fr":"Réseau","en":"Network"}},
 {"name":"features","type":"multiselect","label":{"fr":"Options","en":"Options"},"options":[{"value":"backup","label":{"fr":"Sauvegarde quotidienne","en":"Daily backup"}},{"value":"monitoring","label":{"fr":"Supervision","en":"Monitoring"}},{"value":"antivirus","label":{"fr":"Antivirus","en":"Antivirus"}},{"value":"patching","label":{"fr":"Patch auto","en":"Auto patching"}}],"default":["backup","monitoring"],"section":{"fr":"Options","en":"Options"}},
 {"name":"labels","type":"tags","label":{"fr":"Étiquettes","en":"Labels"},"default":["app:crm"],"section":{"fr":"Options","en":"Options"}},
 {"name":"owner_email","type":"email","label":{"fr":"Email du responsable","en":"Owner email"},"required":true,"placeholder":"prenom.nom@acme.fr","validation":{"format":"email"},"section":{"fr":"Options","en":"Options"}},
 {"name":"expires_on","type":"date","label":{"fr":"Date d'expiration","en":"Expiry date"},"section":{"fr":"Options","en":"Options"}},
 {"name":"cloud_init","type":"yaml","label":{"fr":"Cloud-init (YAML)","en":"Cloud-init (YAML)"},"placeholder":"packages:\n  - nginx","validation":{"format":"yaml"},"section":{"fr":"Avancé","en":"Advanced"}},
 {"name":"notes","type":"markdown","label":{"fr":"Justification","en":"Justification"},"validation":{"max_length":500},"section":{"fr":"Avancé","en":"Advanced"}}
]$js$::jsonb),

('resize', 'Modifier les ressources', 'Resize resources', $js$[
 {"name":"server","type":"autocomplete","label":{"fr":"Serveur","en":"Server"},"required":true,"options":[{"value":"web-prd-01","label":{"fr":"web-prd-01","en":"web-prd-01"}},{"value":"web-prd-02","label":{"fr":"web-prd-02","en":"web-prd-02"}},{"value":"crm-app-01","label":{"fr":"crm-app-01","en":"crm-app-01"}},{"value":"erp-db-01","label":{"fr":"erp-db-01","en":"erp-db-01"}}]},
 {"name":"cpu","type":"integer","label":{"fr":"Nouveau vCPU","en":"New vCPU"},"required":true,"default":4,"validation":{"min":1,"max":64}},
 {"name":"ram_gb","type":"integer","label":{"fr":"Nouvelle RAM (Go)","en":"New RAM (GB)"},"required":true,"default":8,"validation":{"min":1,"max":512}},
 {"name":"window","type":"datetime","label":{"fr":"Fenêtre de maintenance","en":"Maintenance window"},"required":true},
 {"name":"reboot_ok","type":"checkbox","label":{"fr":"J'accepte un redémarrage","en":"I accept a reboot"},"required":true}
]$js$::jsonb),

('delete', 'Supprimer un serveur', 'Delete a server', $js$[
 {"name":"server","type":"autocomplete","label":{"fr":"Serveur","en":"Server"},"required":true,"options":[{"value":"old-app-07","label":{"fr":"old-app-07","en":"old-app-07"}},{"value":"test-vm-12","label":{"fr":"test-vm-12","en":"test-vm-12"}}]},
 {"name":"confirm","type":"text","label":{"fr":"Retapez le nom pour confirmer","en":"Retype the name to confirm"},"required":true},
 {"name":"final_backup","type":"checkbox","label":{"fr":"Effectuer une sauvegarde finale","en":"Take a final backup"},"default":true},
 {"name":"reason","type":"textarea","label":{"fr":"Motif","en":"Reason"},"required":true,"validation":{"min_length":10,"max_length":500}}
]$js$::jsonb),

('dns', 'Créer une entrée DNS', 'Create a DNS record', $js$[
 {"name":"zone","type":"select","label":{"fr":"Zone","en":"Zone"},"required":true,"options":[{"value":"acme.internal","label":{"fr":"acme.internal","en":"acme.internal"}},{"value":"acme.fr","label":{"fr":"acme.fr (public)","en":"acme.fr (public)"}},{"value":"lab.acme.internal","label":{"fr":"lab.acme.internal","en":"lab.acme.internal"}}]},
 {"name":"record_type","type":"radio","label":{"fr":"Type","en":"Type"},"required":true,"default":"A","options":[{"value":"A","label":{"fr":"A","en":"A"}},{"value":"AAAA","label":{"fr":"AAAA","en":"AAAA"}},{"value":"CNAME","label":{"fr":"CNAME","en":"CNAME"}},{"value":"TXT","label":{"fr":"TXT","en":"TXT"}}]},
 {"name":"fqdn","type":"text","label":{"fr":"Nom complet (FQDN)","en":"Full name (FQDN)"},"required":true,"placeholder":"crm.acme.internal","validation":{"format":"fqdn"}},
 {"name":"value","type":"text","label":{"fr":"Valeur","en":"Value"},"required":true,"placeholder":"10.20.30.40"},
 {"name":"ttl","type":"integer","label":{"fr":"TTL (secondes)","en":"TTL (seconds)"},"default":3600,"validation":{"min":60,"max":86400}}
]$js$::jsonb),

('firewall', 'Ajouter une règle Firewall', 'Add a firewall rule', $js$[
 {"name":"source","type":"text","label":{"fr":"Source (CIDR)","en":"Source (CIDR)"},"required":true,"placeholder":"10.10.0.0/16","validation":{"format":"cidr"}},
 {"name":"destination","type":"text","label":{"fr":"Destination (CIDR)","en":"Destination (CIDR)"},"required":true,"placeholder":"10.20.30.0/24","validation":{"format":"cidr"}},
 {"name":"ports","type":"tags","label":{"fr":"Ports","en":"Ports"},"required":true,"default":["443"]},
 {"name":"protocol","type":"select","label":{"fr":"Protocole","en":"Protocol"},"required":true,"default":"tcp","options":[{"value":"tcp","label":{"fr":"TCP","en":"TCP"}},{"value":"udp","label":{"fr":"UDP","en":"UDP"}}]},
 {"name":"expires_at","type":"datetime","label":{"fr":"Expiration","en":"Expiry"}},
 {"name":"ticket_url","type":"url","label":{"fr":"Lien du ticket","en":"Ticket link"},"validation":{"format":"url"},"placeholder":"https://itsm.acme.fr/CHG0012345"},
 {"name":"justification","type":"textarea","label":{"fr":"Justification","en":"Justification"},"required":true,"validation":{"min_length":20,"max_length":500}}
]$js$::jsonb),

('deploy', 'Déploiement applicatif', 'Application deployment', $js$[
 {"name":"application","type":"autocomplete","label":{"fr":"Application","en":"Application"},"required":true,"options":[{"value":"crm","label":{"fr":"CRM Clients","en":"Customer CRM"}},{"value":"portal","label":{"fr":"Portail RH","en":"HR Portal"}},{"value":"billing","label":{"fr":"Facturation","en":"Billing"}}]},
 {"name":"environment","type":"radio","label":{"fr":"Environnement","en":"Environment"},"required":true,"options":[{"value":"dev","label":{"fr":"Développement","en":"Development"}},{"value":"qa","label":{"fr":"Recette","en":"QA"}},{"value":"staging","label":{"fr":"Préproduction","en":"Staging"}},{"value":"prod","label":{"fr":"Production","en":"Production"}}],"default":"qa"},
 {"name":"version","type":"text","label":{"fr":"Version","en":"Version"},"required":true,"placeholder":"2.14.3","validation":{"regex":"^\\d+\\.\\d+\\.\\d+$"}},
 {"name":"config","type":"json","label":{"fr":"Surcharges (JSON)","en":"Overrides (JSON)"},"placeholder":"{ \"replicas\": 3 }","validation":{"format":"json"}},
 {"name":"secret_token","type":"password","label":{"fr":"Jeton de déploiement","en":"Deployment token"}},
 {"name":"release_notes","type":"file","label":{"fr":"Notes de version","en":"Release notes"}}
]$js$::jsonb),

('database', 'Créer une base de données', 'Create a database', $js$[
 {"name":"db_name","type":"text","label":{"fr":"Nom de la base","en":"Database name"},"required":true,"placeholder":"crm_prod","validation":{"regex":"^[a-z_][a-z0-9_]{2,40}$"}},
 {"name":"version","type":"select","label":{"fr":"Version","en":"Version"},"required":true,"options":[{"value":"16","label":{"fr":"Version 16","en":"Version 16"}},{"value":"15","label":{"fr":"Version 15","en":"Version 15"}},{"value":"8.0","label":{"fr":"Version 8.0","en":"Version 8.0"}}]},
 {"name":"size","type":"radio","label":{"fr":"Gabarit","en":"Size"},"required":true,"default":"m","options":[{"value":"s","label":{"fr":"S · 2 vCPU / 4 Go","en":"S · 2 vCPU / 4 GB"}},{"value":"m","label":{"fr":"M · 4 vCPU / 16 Go","en":"M · 4 vCPU / 16 GB"}},{"value":"l","label":{"fr":"L · 8 vCPU / 64 Go","en":"L · 8 vCPU / 64 GB"}}]},
 {"name":"storage_gb","type":"integer","label":{"fr":"Stockage (Go)","en":"Storage (GB)"},"default":100,"validation":{"min":20,"max":8192}},
 {"name":"ha","type":"checkbox","label":{"fr":"Haute disponibilité","en":"High availability"},"default":true},
 {"name":"allowed_networks","type":"tags","label":{"fr":"Réseaux autorisés (CIDR)","en":"Allowed networks (CIDR)"},"default":["10.20.0.0/16"]}
]$js$::jsonb),

('restore', 'Restaurer une sauvegarde', 'Restore a backup', $js$[
 {"name":"target","type":"autocomplete","label":{"fr":"Ressource","en":"Resource"},"required":true,"options":[{"value":"crm_prod","label":{"fr":"crm_prod (PostgreSQL)","en":"crm_prod (PostgreSQL)"}},{"value":"erp-db-01","label":{"fr":"erp-db-01 (serveur)","en":"erp-db-01 (server)"}}]},
 {"name":"point_in_time","type":"datetime","label":{"fr":"Date de restauration","en":"Restore point"},"required":true},
 {"name":"mode","type":"radio","label":{"fr":"Mode","en":"Mode"},"required":true,"default":"clone","options":[{"value":"clone","label":{"fr":"Vers un clone","en":"To a clone"}},{"value":"inplace","label":{"fr":"En place","en":"In place"}}]}
]$js$::jsonb),

('generic', 'Paramètres de la demande', 'Request parameters', $js$[
 {"name":"name","type":"text","label":{"fr":"Nom","en":"Name"},"required":true,"validation":{"min_length":3,"max_length":60}},
 {"name":"environment","type":"select","label":{"fr":"Environnement","en":"Environment"},"required":true,"options":[{"value":"dev","label":{"fr":"Développement","en":"Development"}},{"value":"qa","label":{"fr":"Recette","en":"QA"}},{"value":"staging","label":{"fr":"Préproduction","en":"Staging"}},{"value":"prod","label":{"fr":"Production","en":"Production"}}]},
 {"name":"owner_email","type":"email","label":{"fr":"Email du responsable","en":"Owner email"},"required":true,"validation":{"format":"email"}},
 {"name":"description","type":"textarea","label":{"fr":"Description","en":"Description"},"validation":{"max_length":500}}
]$js$::jsonb);

-- ---------------------------------------------------------------------------
-- Catalogue de services
-- ---------------------------------------------------------------------------
INSERT INTO services (id, project_id, category_id, name_fr, name_en, description_fr, description_en, icon, approval, estimated_minutes, popularity, form_id, tags) VALUES
('create-linux-server','cloud','infrastructure','Créer un serveur Linux','Create a Linux server','VM Linux durcie (RHEL, Rocky, Ubuntu, Debian) avec supervision et sauvegarde activées.','Hardened Linux VM (RHEL, Rocky, Ubuntu, Debian) with monitoring and backup enabled.','ri-terminal-box-line','manager',12,1284,'vm',ARRAY['vm','linux']),
('create-windows-server','cloud','infrastructure','Créer un serveur Windows','Create a Windows server','Windows Server 2022 joint au domaine, antivirus et correctifs appliqués.','Windows Server 2022 domain-joined with antivirus and patches applied.','ri-windows-line','manager',18,642,'vm',ARRAY['vm','windows']),
('resize-server','crm','infrastructure','Modifier CPU/RAM','Resize CPU/RAM','Ajustez les ressources d''un serveur existant avec fenêtre de maintenance planifiée.','Adjust resources of an existing server with a scheduled maintenance window.','ri-cpu-line','technical',6,511,'resize',ARRAY['vm']),
('delete-server','cloud','infrastructure','Supprimer un serveur','Delete a server','Décommissionnement complet : sauvegarde finale, retrait DNS, CMDB et supervision.','Full decommissioning: final backup, DNS, CMDB and monitoring removal.','ri-delete-bin-6-line','multi',9,203,'delete',ARRAY['vm']),
('create-dns-record','crm','network','Créer une entrée DNS','Create a DNS record','Enregistrement A, AAAA, CNAME ou TXT dans les zones internes ou publiques.','A, AAAA, CNAME or TXT record in internal or public zones.','ri-global-line','none',2,1876,'dns',ARRAY['dns']),
('add-firewall-rule','soc2','network','Ajouter une règle Firewall','Add a firewall rule','Ouverture de flux entre segments réseau avec traçabilité et expiration.','Open flows between network segments with traceability and expiry.','ri-fire-line','security',15,934,'firewall',ARRAY['firewall']),
('create-load-balancer','hr','network','Créer un Load Balancer','Create a load balancer','VIP HTTP/HTTPS avec health-checks et certificat TLS automatique.','HTTP/HTTPS VIP with health checks and automatic TLS certificate.','ri-scales-3-line','technical',10,318,'generic',ARRAY['lb']),
('deploy-application','hr','applications','Déployer une application','Deploy an application','Déploiement d''une version applicative sur un environnement cible.','Deploy an application version to a target environment.','ri-rocket-2-line','none',7,2410,'deploy',ARRAY['deploy']),
('rollback-application','hr','applications','Rollback','Rollback','Retour à la version précédente stable en un clic.','Return to the previous stable version in one click.','ri-arrow-go-back-line','none',4,387,'deploy',ARRAY['deploy']),
('create-environment','crm','applications','Créer un environnement','Create an environment','Environnement complet (dev, recette, préprod) avec réseau et accès.','Full environment (dev, QA, staging) with network and access.','ri-stack-line','manager',35,156,'generic',ARRAY['env']),
('create-postgresql','crm','databases','Créer PostgreSQL','Create PostgreSQL','Instance PostgreSQL haute dispo avec sauvegardes PITR.','Highly available PostgreSQL instance with PITR backups.','ri-database-2-line','technical',14,721,'database',ARRAY['postgres']),
('create-mysql','crm','databases','Créer MySQL','Create MySQL','Instance MySQL 8 répliquée, prête pour la production.','Replicated MySQL 8 instance, production ready.','ri-database-line','technical',14,402,'database',ARRAY['mysql']),
('restore-backup','soc2','backup','Restaurer une sauvegarde','Restore a backup','Restauration d''une base ou d''un serveur à une date précise.','Restore a database or server to a precise point in time.','ri-history-line','manager',25,189,'restore',ARRAY['backup']),
('create-k8s-namespace','observability','containers','Créer un namespace Kubernetes','Create a Kubernetes namespace','Namespace avec quotas, RBAC et politiques réseau par défaut.','Namespace with quotas, RBAC and default network policies.','ri-ship-2-line','none',3,655,'generic',ARRAY['k8s']),
('create-certificate','soc2','security','Générer un certificat TLS','Generate a TLS certificate','Certificat signé par la PKI interne ou publique avec renouvellement auto.','Certificate signed by internal or public PKI with auto-renewal.','ri-lock-password-line','security',5,498,'generic',ARRAY['tls']),
('create-user-account','hr','identity','Créer un compte utilisateur','Create a user account','Compte annuaire avec groupes et accès applicatifs.','Directory account with groups and application access.','ri-user-add-line','manager',2,1102,'generic',ARRAY['ldap']),
('create-s3-bucket','observability','storage','Créer un bucket objet','Create an object bucket','Bucket compatible S3 chiffré avec politique de rétention.','Encrypted S3-compatible bucket with retention policy.','ri-hard-drive-2-line','none',2,276,'generic',ARRAY['s3']),
('add-monitoring','observability','monitoring','Ajouter une supervision','Add monitoring','Sondes, tableaux de bord et alertes pour un service existant.','Probes, dashboards and alerts for an existing service.','ri-pulse-line','none',4,341,'generic',ARRAY['monitoring']);

-- ---------------------------------------------------------------------------
-- Tenants & utilisateurs
-- ---------------------------------------------------------------------------
INSERT INTO tenants (id, name, plan, platform_name, tagline, logo, palette, domain, domain_status, domain_checked_at, portal_url, email_subject, email_body, users_count, services_count) VALUES
('acme','Acme Corp','Enterprise','Acme Automation','Service Portal','','teal','automation.acme.fr','verified','2026-10-24T09:30:00Z','https://automation.acme.fr/portal','Votre demande {{ref}} a bien été enregistrée','Bonjour Camille,\n\nVotre demande « {{service}} » a bien été enregistrée sous la référence {{ref}}. Vous pouvez suivre son avancement à tout moment depuis le portail.\n\nÀ bientôt,\nL''équipe {{platform}}',248,42),
('contoso','Contoso Industries','Business','Contoso Cloud Ops','Portail self-service','','clay','ops.contoso.com','pending','2026-10-25T06:40:00Z','https://ops.contoso.com/portal','Contoso Cloud Ops · demande {{ref}} enregistrée','Bonjour,\n\nNous confirmons la prise en compte de votre demande « {{service}} » (référence {{ref}}).\n\nSuivez son avancement depuis Contoso Cloud Ops.',96,31),
('northwind','Northwind MSP','MSP','Northwind Flow','MSP Portal','','emerald','flow.northwind.io','verified','2026-10-22T14:10:00Z','https://flow.northwind.io','Northwind Flow · demande {{ref}} prise en compte','Bonjour,\n\nVotre demande « {{service}} » est enregistrée sous la référence {{ref}}.\n\nL''équipe {{platform}} vous tient informé à chaque étape.',512,58);

INSERT INTO users (id, name, initials, email, role_fr, role_en, tenant_id) VALUES
('u-camille','Camille Laurent','CL','camille.laurent@acme.fr','DevOps Lead','DevOps Lead','acme'),
('u-youssef','Youssef Benali','YB','youssef.benali@acme.fr','DBA','DBA','acme'),
('u-sofia','Sofia Marchetti','SM','sofia.marchetti@acme.fr','Release Manager','Release Manager','acme'),
('u-thomas','Thomas Girard','TG','thomas.girard@northwind.io','Ingénieur réseau','Network engineer','northwind'),
('u-lea','Léa Fontaine','LF','lea.fontaine@acme.fr','Platform Engineer','Platform engineer','acme'),
('u-marc','Marc Dubois','MD','marc.dubois@contoso.com','Ingénieur systèmes','Systems engineer','contoso'),
('u-nadia','Nadia Berthier','NB','nadia.berthier@acme.fr','Manager','Manager','acme'),
('u-julien','Julien Moreau','JM','julien.moreau@acme.fr','Équipe technique','Technical team','acme'),
('u-ines','Inès Kaddour','IK','ines.kaddour@acme.fr','Équipe sécurité','Security team','acme'),
('u-helene','Hélène Vasseur','HV','helene.vasseur@contoso.com','Manager','Manager','contoso');

-- ---------------------------------------------------------------------------
-- Demandes récentes
-- ---------------------------------------------------------------------------
INSERT INTO requests (id, service_id, user_id, tenant_id, environment, status, progress, created_at, duration_sec, approval, approval_state, business_type) VALUES
('REQ-2026-48213','create-linux-server','u-camille','acme','prod','running',62,'2026-10-25T08:12:00Z',348,'manager','granted','vm_creation'),
('REQ-2026-48212','create-postgresql','u-youssef','acme','staging','queued',0,'2026-10-25T08:05:00Z',0,'technical','pending','database_creation'),
('REQ-2026-48211','deploy-application','u-sofia','acme','qa','success',100,'2026-10-25T07:48:00Z',402,'none','not_required','application_deployment'),
('REQ-2026-48210','create-dns-record','u-thomas','northwind','prod','failed',74,'2026-10-25T07:31:00Z',96,'none','not_required','dns_creation'),
('REQ-2026-48209','resize-server','u-camille','acme','prod','success',100,'2026-10-25T06:55:00Z',214,'technical','granted','vm_update'),
('REQ-2026-48208','create-k8s-namespace','u-lea','contoso','dev','canceled',0,'2026-10-24T18:22:00Z',0,'none','not_required','kubernetes_namespace'),
('REQ-2026-48207','create-mysql','u-youssef','acme','prod','success',100,'2026-10-24T16:10:00Z',618,'technical','granted','database_creation'),
('REQ-2026-48206','add-firewall-rule','u-thomas','northwind','prod','success',100,'2026-10-24T15:02:00Z',132,'security','granted','custom'),
('REQ-2026-48205','restore-backup','u-sofia','contoso','prod','success',100,'2026-10-24T11:40:00Z',884,'manager','granted','restore'),
('REQ-2026-48204','create-windows-server','u-marc','contoso','prod','failed',88,'2026-10-24T09:15:00Z',742,'manager','granted','vm_creation'),
('REQ-2026-48203','create-user-account','u-lea','acme','prod','success',100,'2026-10-23T17:05:00Z',58,'manager','granted','user_creation'),
('REQ-2026-48202','rollback-application','u-sofia','acme','prod','success',100,'2026-10-23T14:28:00Z',187,'none','not_required','application_rollback'),
('REQ-2026-48201','create-load-balancer','u-marc','northwind','staging','success',100,'2026-10-23T10:12:00Z',296,'technical','granted','custom'),
('REQ-2026-48200','create-s3-bucket','u-thomas','acme','dev','success',100,'2026-10-22T16:44:00Z',74,'none','not_required','custom');

-- ---------------------------------------------------------------------------
-- Détails d'exécution (timeline, journaux, résultat, erreur)
-- ---------------------------------------------------------------------------
INSERT INTO execution_details (request_id, timeline, logs, result, error) VALUES
('REQ-2026-48213',
 $j$[{"key":"prep","status":"success","note":{"fr":"Paramètres vérifiés","en":"Parameters checked"}},{"key":"validation","status":"success","note":{"fr":"Approuvé par le manager","en":"Approved by manager"}},{"key":"install","status":"running","note":{"fr":"Installation du système en cours","en":"OS installation in progress"}},{"key":"config","status":"pending","note":{"fr":"Configuration réseau et agents","en":"Network and agent configuration"}},{"key":"checks","status":"pending","note":{"fr":"Contrôles de conformité","en":"Compliance checks"}},{"key":"done","status":"pending","note":{"fr":"Mise à disposition","en":"Handover"}}]$j$::jsonb,
 $j$[{"time":"08:12:04","level":"info","text":{"fr":"Demande reçue et validée","en":"Request received and validated"}},{"time":"08:12:09","level":"success","text":{"fr":"Hostname web-prd-01 réservé","en":"Hostname web-prd-01 reserved"}},{"time":"08:12:31","level":"success","text":{"fr":"Ressources allouées (4 vCPU / 8 Go)","en":"Resources allocated (4 vCPU / 8 GB)"}},{"time":"08:13:02","level":"info","text":{"fr":"Création du volume de 100 Go","en":"Creating 100 GB volume"}},{"time":"08:13:48","level":"info","text":{"fr":"Installation de Rocky Linux 9 démarrée","en":"Rocky Linux 9 installation started"}},{"time":"08:14:55","level":"warning","text":{"fr":"Miroir de paquets lent, bascule sur le miroir secondaire","en":"Slow package mirror, switching to secondary"}},{"time":"08:16:10","level":"success","text":{"fr":"Système de base prêt","en":"Base system ready"}}]$j$::jsonb,
 NULL, NULL),
('REQ-2026-48210',
 $j$[{"key":"prep","status":"success","note":{"fr":"Zone résolue","en":"Zone resolved"}},{"key":"validation","status":"success","note":{"fr":"Aucune validation requise","en":"No approval required"}},{"key":"install","status":"failed","note":{"fr":"Écriture DNS refusée","en":"DNS write rejected"}},{"key":"config","status":"pending","note":{"fr":"Non exécuté","en":"Not executed"}},{"key":"checks","status":"pending","note":{"fr":"Non exécuté","en":"Not executed"}},{"key":"done","status":"pending","note":{"fr":"Annulé","en":"Aborted"}}]$j$::jsonb,
 $j$[{"time":"07:31:02","level":"info","text":{"fr":"Demande reçue","en":"Request received"}},{"time":"07:31:05","level":"success","text":{"fr":"Recherche de la zone lab.acme.internal","en":"Looking up zone lab.acme.internal"}},{"time":"07:31:22","level":"error","text":{"fr":"Zone DNS introuvable sur les serveurs autoritaires","en":"DNS zone not found on authoritative servers"}},{"time":"07:31:40","level":"info","text":{"fr":"Exécution interrompue, aucune modification appliquée","en":"Execution stopped, no change applied"}}]$j$::jsonb,
 NULL,
 $j${"code":"DNS001","severity":"error","reason":{"fr":"Zone DNS introuvable","en":"DNS zone not found"},"solution":{"fr":"Créer la zone DNS ou choisir une zone existante","en":"Create the DNS zone or pick an existing one"}}$j$::jsonb),
('REQ-2026-48211',
 $j$[{"key":"prep","status":"success","note":{"fr":"Artefact 2.14.3 récupéré","en":"Artifact 2.14.3 fetched"}},{"key":"validation","status":"success","note":{"fr":"Contrôles pré-déploiement OK","en":"Pre-deploy checks OK"}},{"key":"install","status":"success","note":{"fr":"3 instances mises à jour","en":"3 instances updated"}},{"key":"config","status":"success","note":{"fr":"Variables et secrets injectés","en":"Variables and secrets injected"}},{"key":"checks","status":"success","note":{"fr":"Tests de fumée 12/12","en":"Smoke tests 12/12"}},{"key":"done","status":"success","note":{"fr":"Trafic basculé","en":"Traffic switched"}}]$j$::jsonb,
 $j$[{"time":"07:48:01","level":"info","text":{"fr":"Déploiement de la version 2.14.3 sur qa","en":"Deploying version 2.14.3 to qa"}},{"time":"07:48:44","level":"success","text":{"fr":"Instances mises à jour (3/3)","en":"Instances updated (3/3)"}},{"time":"07:52:10","level":"success","text":{"fr":"Tests de fumée réussis","en":"Smoke tests passed"}},{"time":"07:54:43","level":"success","text":{"fr":"Déploiement terminé","en":"Deployment finished"}}]$j$::jsonb,
 $j${"type":"application_deployment","status":"success","fields":[{"label":{"fr":"Application","en":"Application"},"value":"Portail RH"},{"label":{"fr":"Version","en":"Version"},"value":"2.14.3"},{"label":{"fr":"Environnement","en":"Environment"},"value":"qa"},{"label":{"fr":"Instances","en":"Instances"},"value":"3 / 3"}]}$j$::jsonb,
 NULL),
('REQ-2026-48204',
 $j$[{"key":"prep","status":"success","note":{"fr":"Paramètres vérifiés","en":"Parameters checked"}},{"key":"validation","status":"success","note":{"fr":"Approuvé par le manager","en":"Approved by manager"}},{"key":"install","status":"success","note":{"fr":"Windows Server 2022 installé","en":"Windows Server 2022 installed"}},{"key":"config","status":"success","note":{"fr":"Jonction au domaine OK","en":"Domain join OK"}},{"key":"checks","status":"failed","note":{"fr":"Contrôle antivirus en échec","en":"Antivirus check failed"}},{"key":"done","status":"pending","note":{"fr":"Mise à disposition bloquée","en":"Handover blocked"}}]$j$::jsonb,
 $j$[{"time":"09:15:03","level":"info","text":{"fr":"Création de la VM win-prd-04","en":"Creating VM win-prd-04"}},{"time":"09:21:12","level":"success","text":{"fr":"Windows Server 2022 installé","en":"Windows Server 2022 installed"}},{"time":"09:24:50","level":"success","text":{"fr":"Jonction au domaine acme.internal","en":"Domain join acme.internal"}},{"time":"09:27:40","level":"error","text":{"fr":"Agent antivirus non installé, contrôle de conformité refusé","en":"Antivirus agent missing, compliance check rejected"}}]$j$::jsonb,
 NULL,
 $j${"code":"SEC042","severity":"error","reason":{"fr":"Agent de sécurité absent","en":"Security agent missing"},"solution":{"fr":"Relancer le service ou contacter l'équipe Sécurité","en":"Retry the service or contact the Security team"}}$j$::jsonb),
('REQ-2026-48209',
 $j$[{"key":"prep","status":"success","note":{"fr":"Serveur identifié","en":"Server identified"}},{"key":"validation","status":"success","note":{"fr":"Validé par l'équipe technique","en":"Approved by technical team"}},{"key":"install","status":"success","note":{"fr":"Redimensionnement effectué","en":"Resize completed"}},{"key":"config","status":"success","note":{"fr":"Agents reconfigurés","en":"Agents reconfigured"}},{"key":"checks","status":"success","note":{"fr":"Tous les contrôles OK","en":"All checks OK"}},{"key":"done","status":"success","note":{"fr":"Serveur redémarré","en":"Server rebooted"}}]$j$::jsonb,
 $j$[{"time":"06:55:02","level":"info","text":{"fr":"Fenêtre de maintenance ouverte","en":"Maintenance window opened"}},{"time":"06:57:20","level":"success","text":{"fr":"CPU porté à 8 vCPU","en":"CPU increased to 8 vCPU"}},{"time":"06:58:02","level":"success","text":{"fr":"RAM portée à 32 Go","en":"RAM increased to 32 GB"}},{"time":"06:58:40","level":"success","text":{"fr":"Serveur de nouveau opérationnel","en":"Server back online"}}]$j$::jsonb,
 $j${"type":"vm_update","status":"success","fields":[{"label":{"fr":"Serveur","en":"Server"},"value":"web-prd-02"},{"label":{"fr":"CPU","en":"CPU"},"value":"8 vCPU"},{"label":{"fr":"RAM","en":"RAM"},"value":"32 Go"},{"label":{"fr":"Indisponibilité","en":"Downtime"},"value":"48 s"}]}$j$::jsonb,
 NULL);

-- ---------------------------------------------------------------------------
-- Approbations
-- ---------------------------------------------------------------------------
INSERT INTO approvals (id, request_ref, service_id, user_id, tenant_id, environment, submitted_at, due_at, risk, my_turn, decision, decided_at, justification_fr, justification_en, impacts) VALUES
('AP-3412','REQ-2026-48212','create-postgresql','u-youssef','acme','staging','2026-10-25T08:05:00Z','2026-10-25T12:05:00Z','medium',true,'pending',NULL,
 'Préparer la base de données du nouvel environnement de recette. Le volume prévu reste inférieur à 50 Go et les sauvegardes sont journalières.',
 'Prepare the database for the new staging environment. Planned volume stays under 50 GB and backups run daily.',
 $j$[{"fr":"Réseau : ouverture 5432 depuis le sous-réseau applicatif","en":"Network: open 5432 from the application subnet"},{"fr":"Coût estimé : +38 €/mois","en":"Estimated cost: +€38/month"},{"fr":"Aucune interruption de service","en":"No service interruption"}]$j$::jsonb),
('AP-3411','REQ-2026-48217','create-windows-server','u-marc','contoso','prod','2026-10-25T07:52:00Z','2026-10-25T13:52:00Z','high',true,'pending',NULL,
 'Le serveur d''édition comptable sature pendant la clôture mensuelle. Il faut une seconde instance en production avant le 30 octobre.',
 'The accounting server saturates during month-end close. A second production instance is needed before October 30.',
 $j$[{"fr":"Exposition Internet : non","en":"Internet exposure: none"},{"fr":"Données sensibles : oui (données comptables)","en":"Sensitive data: yes (accounting data)"},{"fr":"Journalisation centralisée obligatoire","en":"Centralised logging required"}]$j$::jsonb),
('AP-3410','REQ-2026-48221','delete-server','u-thomas','northwind','prod','2026-10-25T07:34:00Z','2026-10-25T11:34:00Z','high',true,'pending',NULL,
 'Décommissionnement de l''ancien hôte de messagerie après migration des boîtes. Sauvegarde finale réalisée le 24/10.',
 'Decommissioning the legacy mail host after mailbox migration. Final backup completed on 24/10.',
 $j$[{"fr":"Suppression définitive de 2 volumes de 500 Go","en":"Permanent deletion of 2 × 500 GB volumes"},{"fr":"Sauvegarde finale conservée 30 jours","en":"Final backup retained for 30 days"},{"fr":"Opération irréversible après 24 h","en":"Irreversible after 24 hours"}]$j$::jsonb),
('AP-3409','REQ-2026-48201','create-load-balancer','u-sofia','acme','prod','2026-10-25T07:20:00Z','2026-10-26T07:20:00Z','medium',false,'pending',NULL,
 'Répartition de charge pour la nouvelle version du portail client, en préparation de la mise en production du 27/10.',
 'Load balancing for the new customer portal release, ahead of the October 27 go-live.',
 $j$[{"fr":"Certificat TLS wildcard réutilisé","en":"Wildcard TLS certificate reused"},{"fr":"Coût estimé : +64 €/mois","en":"Estimated cost: +€64/month"}]$j$::jsonb),
('AP-3408','REQ-2026-48206','add-firewall-rule','u-lea','acme','prod','2026-10-25T06:58:00Z','2026-10-25T10:58:00Z','high',false,'pending',NULL,
 'Ouverture temporaire du port 8443 vers le partenaire de facturation, nécessaire pour la recette d''interopérabilité de la semaine.',
 'Temporary opening of port 8443 to the billing partner, required for this week''s interoperability test.',
 $j$[{"fr":"Flux entrant depuis 3 adresses IP publiques","en":"Inbound traffic from 3 public IPs"},{"fr":"Règle limitée dans le temps (7 jours)","en":"Time-boxed rule (7 days)"}]$j$::jsonb),
('AP-3407','REQ-2026-48205','restore-backup','u-youssef','contoso','prod','2026-10-24T18:40:00Z','2026-10-25T18:40:00Z','medium',true,'pending',NULL,
 'Restauration de la base de reporting à l''état du 23/10 suite à une purge erronée. Le service est déjà en lecture seule.',
 'Restoring the reporting database to its October 23 state after an incorrect purge. The service is already read-only.',
 $j$[{"fr":"Écrasement du jeu de données actuel","en":"Overwrites the current dataset"},{"fr":"Durée d'indisponibilité estimée : 15 min","en":"Estimated downtime: 15 min"}]$j$::jsonb),
('AP-3406','REQ-2026-48208','create-k8s-namespace','u-lea','acme','dev','2026-10-24T16:10:00Z','2026-10-25T16:10:00Z','low',false,'approved','2026-10-24T17:12:00Z',
 'Isolation des charges de travail de l''équipe Data dans un namespace dédié, avec quotas standards.',
 'Isolating the Data team workloads in a dedicated namespace with standard quotas.',
 $j$[{"fr":"Quota : 16 vCPU / 64 Go","en":"Quota: 16 vCPU / 64 GB"}]$j$::jsonb),
('AP-3405','REQ-2026-48207','create-mysql','u-youssef','acme','prod','2026-10-24T09:40:00Z','2026-10-24T17:40:00Z','high',false,'rejected','2026-10-24T11:05:00Z',
 'Nouvelle instance MySQL en production pour un projet non référencé au catalogue des applications.',
 'New production MySQL instance for a project that is not in the application registry.',
 $j$[{"fr":"Exposition sur le réseau interne uniquement","en":"Internal network exposure only"}]$j$::jsonb);

INSERT INTO approval_levels (approval_id, key, status, approver, decided_at, comment_fr, comment_en, sort_order) VALUES
('AP-3412','manager','approved','Nadia Berthier','2026-10-25T08:21:00Z','Budget validé avec la DSI.','Budget approved with IT.',1),
('AP-3412','technical','current','Camille Laurent',NULL,NULL,NULL,2),
('AP-3412','security','waiting',NULL,NULL,NULL,NULL,3),
('AP-3411','manager','approved','Nadia Berthier','2026-10-25T08:10:00Z',NULL,NULL,1),
('AP-3411','technical','approved','Julien Moreau','2026-10-25T08:34:00Z','Gabarit conforme, dimensionnement correct.','Compliant template, sizing is correct.',2),
('AP-3411','security','current','Camille Laurent',NULL,NULL,NULL,3),
('AP-3410','manager','approved','Hélène Vasseur','2026-10-25T07:58:00Z',NULL,NULL,1),
('AP-3410','technical','approved','Julien Moreau','2026-10-25T08:16:00Z',NULL,NULL,2),
('AP-3410','security','current','Camille Laurent',NULL,NULL,NULL,3),
('AP-3409','manager','current','Nadia Berthier',NULL,NULL,NULL,1),
('AP-3409','technical','waiting',NULL,NULL,NULL,NULL,2),
('AP-3409','security','waiting',NULL,NULL,NULL,NULL,3),
('AP-3408','manager','current','Nadia Berthier',NULL,NULL,NULL,1),
('AP-3408','technical','waiting',NULL,NULL,NULL,NULL,2),
('AP-3408','security','waiting',NULL,NULL,NULL,NULL,3),
('AP-3407','manager','approved','Hélène Vasseur','2026-10-24T19:02:00Z',NULL,NULL,1),
('AP-3407','technical','current','Camille Laurent',NULL,NULL,NULL,2),
('AP-3407','security','waiting',NULL,NULL,NULL,NULL,3),
('AP-3406','manager','approved','Nadia Berthier','2026-10-24T16:30:00Z',NULL,NULL,1),
('AP-3406','technical','approved','Camille Laurent','2026-10-24T17:12:00Z','Conforme au standard d''isolation.','Compliant with the isolation standard.',2),
('AP-3406','security','skipped',NULL,NULL,NULL,NULL,3),
('AP-3405','manager','approved','Nadia Berthier','2026-10-24T10:12:00Z',NULL,NULL,1),
('AP-3405','technical','approved','Julien Moreau','2026-10-24T10:40:00Z',NULL,NULL,2),
('AP-3405','security','rejected','Inès Kaddour','2026-10-24T11:05:00Z','Projet non référencé et chiffrement au repos non prévu. À resoumettre après mise en conformité.','Project not registered and encryption at rest missing. Please resubmit after remediation.',3);

-- ---------------------------------------------------------------------------
-- Journal d'audit
-- ---------------------------------------------------------------------------
INSERT INTO audit_events (id, at, actor_id, actor_role_fr, actor_role_en, level, decision, service_id, ref, tenant_id, comment_fr, comment_en, risk) VALUES
('AU-9001','2026-10-25T07:12:00Z','u-nadia','Manager','Manager','manager','approved','create-linux-server','REQ-2026-48218','acme','Besoin confirmé pour la recette du portail client.','Need confirmed for the customer portal staging build.','low'),
('AU-9002','2026-10-25T06:44:00Z','u-ines','Équipe sécurité','Security team','security','rejected','add-firewall-rule','REQ-2026-48216','northwind','Ouverture vers 0.0.0.0/0 interdite. Restreindre aux plages du partenaire puis resoumettre.','Opening to 0.0.0.0/0 is not allowed. Restrict to partner ranges and resubmit.','high'),
('AU-9003','2026-10-24T21:18:00Z','u-julien','Équipe technique','Technical team','technical','approved','create-dns-record','REQ-2026-48211','contoso','Zone existante, TTL conforme au standard.','Existing zone, TTL compliant with standard.','low'),
('AU-9004','2026-10-24T18:26:00Z','u-helene','Manager','Manager','manager','approved','restore-backup','REQ-2026-48205','contoso','Restauration validée, fenêtre de maintenance confirmée.','Restore approved, maintenance window confirmed.','medium'),
('AU-9005','2026-10-24T15:02:00Z','u-ines','Équipe sécurité','Security team','security','approved','deploy-application','REQ-2026-48198','acme','Analyse de dépendances propre, signature d''image vérifiée.','Clean dependency scan, image signature verified.','medium'),
('AU-9006','2026-10-24T11:05:00Z','u-ines','Équipe sécurité','Security team','security','rejected','create-mysql','REQ-2026-48207','acme','Projet non référencé et chiffrement au repos non prévu.','Project not registered and encryption at rest missing.','high'),
('AU-9007','2026-10-23T16:40:00Z','u-marc','Équipe plateforme','Platform team','technical','approved','create-k8s-namespace','REQ-2026-48190','northwind','Quotas conformes, isolation réseau par défaut.','Quotas compliant, network isolation by default.','low'),
('AU-9008','2026-10-23T09:14:00Z','u-nadia','Manager','Manager','manager','rejected','create-load-balancer','REQ-2026-48184','contoso','Budget mensuel dépassé, arbitrage reporté au prochain comité.','Monthly budget exceeded, decision deferred to next committee.','medium');

-- ---------------------------------------------------------------------------
-- Adaptateurs & connecteurs
-- ---------------------------------------------------------------------------
INSERT INTO adapters (kind, name, icon, description_fr, description_en) VALUES
('ascender','Ascender Automation Controller','ri-flashlight-line','Contrôleur de jobs et inventaires','Job and inventory controller'),
('jenkins','Jenkins Build Service','ri-tools-line','Pipelines de build et déploiement','Build and deployment pipelines'),
('terraform','Terraform Cloud','ri-stack-line','Runs et espaces de travail','Runs and workspaces'),
('gitlab','GitLab CI/CD','ri-git-branch-line','Pipelines et environnements GitLab','GitLab pipelines and environments'),
('azuredevops','Azure DevOps','ri-microsoft-line','Pipelines YAML et releases','YAML pipelines and releases'),
('argocd','ArgoCD','ri-node-tree','Synchronisation GitOps Kubernetes','Kubernetes GitOps sync'),
('rundeck','Rundeck','ri-terminal-box-line','Jobs opérationnels et scripts','Operational jobs and scripts'),
('servicenow','ServiceNow','ri-ticket-2-line','Catalogues et tickets ITSM','ITSM catalogs and tickets'),
('ansible','Ansible Automation Platform','ri-settings-5-line','Contrôleurs AAP et modèles de job','AAP controllers and job templates');

INSERT INTO connectors (id, kind, name, endpoint, endpoint_default, auth_mode, version, notes, configured, health, latency_ms, uptime, last_sync, jobs_24h, success_rate, scope, retest_required_at, capabilities) VALUES
('cn-asc-01','ascender','Ascender Automation Controller','https://ascender.acme.fr/api/v2','https://ascender.acme.fr/api/v2','Token applicatif','24.6.1','Instance de production partagée avec l''équipe Infra. Fenêtre de maintenance le dimanche de 22 h à minuit, éviter toute synchro pendant cette plage.',true,'healthy',68,99.98,'2026-10-25T08:42:00Z',184,97.3,'tenant',NULL,
 ARRAY['GET /api/v2/job_templates/','GET /api/v2/job_templates/{id}/survey_spec/','GET /api/v2/inventories/','POST /api/v2/job_templates/{id}/launch/','GET /api/v2/jobs/{id}/job_events/','GET /api/v2/jobs/{id}']),
('cn-jen-02','jenkins','Jenkins Build Service','https://jenkins.acme.fr','https://jenkins.acme.fr','Jeton d''API','2.452.2','Deux agents Jenkins sont hors ligne depuis le 24/10. Ticket OPS-4471 ouvert côté infrastructure.',true,'degraded',412,97.1,'2026-10-25T07:15:00Z',96,91.6,'tenant','2026-10-25T07:20:00Z',
 ARRAY['GET /api/json?tree=jobs[name]','POST /job/{name}/build','GET /job/{name}/{id}/api/json','GET /job/{name}/{id}/consoleText']),
('cn-tf-03','terraform','Terraform Cloud','https://app.terraform.io/api/v2','https://app.terraform.io/api/v2','Jeton d''équipe (non renseigné)','1.9.5','Jeton d''équipe à demander à l''équipe sécurité avant la mise en production.',false,'pending',0,0,NULL,0,0,'platform',NULL,
 ARRAY['GET /api/v2/organizations/{org}/workspaces','GET /api/v2/workspaces/{id}/runs','POST /api/v2/runs','GET /api/v2/runs/{id}/plan']);

INSERT INTO connector_checks (connector_id, label_fr, label_en, ok, sort_order) VALUES
('cn-asc-01','Authentification','Authentication',true,1),
('cn-asc-01','Certificat TLS','TLS certificate',true,2),
('cn-asc-01','Inventaires accessibles','Inventories reachable',true,3),
('cn-asc-01','File d''exécution','Execution queue',true,4),
('cn-jen-02','Authentification','Authentication',true,1),
('cn-jen-02','Certificat TLS','TLS certificate',true,2),
('cn-jen-02','Agents disponibles','Agents available',false,3),
('cn-jen-02','File d''exécution','Execution queue',true,4),
('cn-tf-03','Authentification','Authentication',false,1),
('cn-tf-03','Certificat TLS','TLS certificate',true,2),
('cn-tf-03','Espaces de travail','Workspaces',false,3),
('cn-tf-03','File d''exécution','Execution queue',false,4);

INSERT INTO connector_tests (connector_id, at, ok, latency, error) VALUES
('cn-asc-01','2026-10-25T08:40:00Z',true,68,NULL),
('cn-asc-01','2026-10-24T17:05:00Z',true,74,NULL),
('cn-asc-01','2026-10-24T09:12:00Z',true,81,NULL),
('cn-asc-01','2026-10-23T15:48:00Z',true,66,NULL),
('cn-jen-02','2026-10-25T07:12:00Z',false,0,'Timeout after 30 s on /api/json - 2 agents offline'),
('cn-jen-02','2026-10-24T16:40:00Z',true,412,NULL),
('cn-jen-02','2026-10-24T08:05:00Z',true,389,NULL),
('cn-jen-02','2026-10-23T19:22:00Z',false,0,'HTTP 503 Service Unavailable on /api/json'),
('cn-tf-03','2026-10-25T06:58:00Z',false,0,'401 Unauthorized - missing team token'),
('cn-tf-03','2026-10-24T18:22:00Z',false,0,'401 Unauthorized - missing team token'),
('cn-tf-03','2026-10-22T11:30:00Z',false,0,'TLS handshake failed on app.terraform.io:443');

INSERT INTO connector_history (connector_id, at, author, field, before_value, after_value) VALUES
('cn-asc-01','2026-10-21T14:20:00Z','Camille Laurent','endpoint','https://ascender.acme.fr/api/v1','https://ascender.acme.fr/api/v2'),
('cn-asc-01','2026-10-18T09:05:00Z','Camille Laurent','name','Ascender (prod)','Ascender Automation Controller'),
('cn-asc-01','2026-10-17T16:40:00Z','Nadia Bouchard','notes','','Instance de production partagée avec l''équipe Infra.'),
('cn-jen-02','2026-10-25T07:20:00Z','Camille Laurent','endpoint','https://jenkins.acme.fr/','https://jenkins.acme.fr'),
('cn-jen-02','2026-10-24T10:15:00Z','Camille Laurent','notes','Ticket OPS-4471 ouvert côté infrastructure.','Deux agents Jenkins sont hors ligne depuis le 24/10. Ticket OPS-4471 ouvert côté infrastructure.'),
('cn-jen-02','2026-10-12T11:32:00Z','Nadia Bouchard','endpoint','https://jenkins.acme.fr:8080','https://jenkins.acme.fr'),
('cn-tf-03','2026-10-20T08:56:00Z','Camille Laurent','notes','','Jeton d''équipe à demander à l''équipe sécurité avant la mise en production.'),
('cn-tf-03','2026-10-20T08:55:00Z','Camille Laurent','name','Terraform (sandbox)','Terraform Cloud');

INSERT INTO connector_catalog (id, connector_id, name_fr, name_en, engine_ref, category_id, status, last_sync) VALUES
('ic-01','cn-asc-01','Créer un serveur Linux','Create a Linux server','Linux Server Provisioning','infrastructure','mapped','2026-10-25T08:42:00Z'),
('ic-02','cn-asc-01','Créer un serveur Windows','Create a Windows server','Windows Server Provisioning','infrastructure','mapped','2026-10-25T08:42:00Z'),
('ic-03','cn-asc-01','Créer PostgreSQL','Create PostgreSQL','PostgreSQL Instance','databases','mapped','2026-10-25T08:42:00Z'),
('ic-04','cn-asc-01','Créer une entrée DNS','Create a DNS entry','DNS Record Managed','network','mapped','2026-10-25T08:42:00Z'),
('ic-05','cn-asc-01','Ajouter une règle Firewall','Add a firewall rule','Firewall Rule Request','network','review','2026-10-25T08:42:00Z'),
('ic-06','cn-asc-01','Déployer une application','Deploy an application','Application Deployment','applications','mapped','2026-10-25T08:42:00Z'),
('ic-07','cn-asc-01','Créer un namespace Kubernetes','Create a Kubernetes namespace','K8s Namespace','containers','mapped','2026-10-25T08:42:00Z'),
('ic-08','cn-asc-01','Restaurer une sauvegarde','Restore a backup','Backup Restore','backup','ignored','2026-10-25T08:42:00Z'),
('ic-09','cn-asc-01','Créer un Load Balancer','Create a load balancer','Load Balancer Standard','network','mapped','2026-10-25T08:42:00Z'),
('ic-20','cn-jen-02','Déployer l''API de facturation','Deploy the billing API','billing-api-deploy','applications','mapped','2026-10-25T07:15:00Z'),
('ic-21','cn-jen-02','Rollback de l''API de facturation','Roll back the billing API','billing-api-rollback','applications','mapped','2026-10-25T07:15:00Z'),
('ic-22','cn-jen-02','Créer un environnement de recette','Create a staging environment','env-create-staging','applications','review','2026-10-25T07:15:00Z'),
('ic-23','cn-jen-02','Sauvegarde nocturne des bases','Nightly database backup','db-snapshot-nightly','backup','mapped','2026-10-25T07:15:00Z'),
('ic-24','cn-jen-02','Nettoyage des anciens hôtes','Legacy host cleanup','legacy-mail-cleanup','infrastructure','ignored','2026-10-25T07:15:00Z');

INSERT INTO batch_tests (at, total, ok, failed, avg_latency_ms, duration_ms) VALUES
('2026-10-25T08:44:00Z',3,1,2,248,1840),
('2026-10-24T17:12:00Z',3,2,1,211,1620),
('2026-10-23T09:31:00Z',2,2,0,176,1340);

-- ---------------------------------------------------------------------------
-- Historique de demandes (90 jours) pour des agrégats réalistes
-- ---------------------------------------------------------------------------
INSERT INTO requests (id, service_id, user_id, tenant_id, environment, status, progress, created_at, duration_sec, approval, approval_state, business_type)
SELECT
  'REQ-H-' || lpad(i::text, 5, '0'),
  svc.id,
  usr.id,
  ten.id,
  env.v,
  st.v,
  CASE st.v WHEN 'success' THEN 100 WHEN 'failed' THEN 55 + (abs(hashtext('p' || i)) % 45) ELSE 100 END,
  TIMESTAMPTZ '2026-10-25 06:00:00+00'
    - ((15 + abs(hashtext('d' || i)) % 75) || ' days')::interval
    - ((abs(hashtext('h' || i)) % 86000) || ' seconds')::interval,
  CASE st.v WHEN 'success' THEN 25 + (abs(hashtext('u' || i)) % 880) WHEN 'failed' THEN 20 + (abs(hashtext('u' || i)) % 260) ELSE 0 END,
  svc.approval,
  CASE WHEN st.v = 'success' THEN 'granted' ELSE 'not_required' END,
  'custom'
FROM generate_series(1, 1500) AS i
CROSS JOIN LATERAL (
  SELECT id, approval FROM services OFFSET abs(hashtext('s' || i)) % 18 LIMIT 1
) AS svc
CROSS JOIN LATERAL (
  SELECT id FROM users OFFSET abs(hashtext('usr' || i)) % 10 LIMIT 1
) AS usr
CROSS JOIN LATERAL (
  SELECT id FROM tenants OFFSET abs(hashtext('t' || i)) % 3 LIMIT 1
) AS ten
CROSS JOIN LATERAL (
  SELECT (ARRAY['dev','qa','staging','prod'])[1 + abs(hashtext('e' || i)) % 4] AS v
) AS env
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN abs(hashtext('st' || i)) % 100 < 92 THEN 'success'
    WHEN abs(hashtext('st' || i)) % 100 < 97 THEN 'failed'
    ELSE 'canceled' END AS v
) AS st;

COMMIT;