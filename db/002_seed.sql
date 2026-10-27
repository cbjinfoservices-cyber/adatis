-- ============================================================================
-- ASP Automation Service Portal — données de référence (Migration 002)
-- Configuration de départ uniquement : projets, catégories, formulaires et
-- adaptateurs. Aucun service, tenant ni donnée d'activité n'est préchargé.
-- Idempotent : TRUNCATE puis INSERT.
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
-- Adaptateurs
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

COMMIT;
