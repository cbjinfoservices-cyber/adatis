-- ============================================================================
-- Migration 011 — suppression des données de démonstration
--
-- Les bases initialisées avec l'ancien 002_seed.sql contiennent une activité
-- fictive. Seules les lignes de ce jeu de démonstration (identifiants connus)
-- sont supprimées : les demandes, approbations et utilisateurs réels restent.
--
--   * demandes (récentes + historique REQ-H-*), exécutions, approbations, audit
--   * tests groupés, connecteurs Jenkins / Terraform fictifs
--   * utilisateurs locaux de démonstration (jamais connectés via Ascender)
--   * tenants Acme / Contoso / Northwind non reliés à une organisation Ascender
--   * services du catalogue de démonstration encore inutilisés
-- ============================================================================

BEGIN;

DELETE FROM requests
 WHERE id LIKE 'REQ-H-%'
    OR id IN ('REQ-2026-48200','REQ-2026-48201','REQ-2026-48202','REQ-2026-48203',
              'REQ-2026-48204','REQ-2026-48205','REQ-2026-48206','REQ-2026-48207',
              'REQ-2026-48208','REQ-2026-48209','REQ-2026-48210','REQ-2026-48211',
              'REQ-2026-48212','REQ-2026-48213');

DELETE FROM approvals
 WHERE id IN ('AP-3405','AP-3406','AP-3407','AP-3408','AP-3409','AP-3410','AP-3411','AP-3412');

DELETE FROM audit_events
 WHERE id IN ('AU-9001','AU-9002','AU-9003','AU-9004','AU-9005','AU-9006','AU-9007','AU-9008');

DELETE FROM batch_tests
 WHERE at IN ('2026-10-25T08:44:00Z','2026-10-24T17:12:00Z','2026-10-23T09:31:00Z');

-- Tests, contrôles, historique et catalogue suivent (ON DELETE CASCADE).
DELETE FROM connectors
 WHERE id IN ('cn-jen-02','cn-tf-03') AND NOT managed;

DELETE FROM users
 WHERE id IN ('u-camille','u-youssef','u-sofia','u-thomas','u-lea',
              'u-marc','u-nadia','u-julien','u-ines','u-helene')
   AND awx_user_id IS NULL;

DELETE FROM tenants
 WHERE id IN ('acme','contoso','northwind')
   AND awx_organization = '';

-- Services du catalogue de démonstration jamais commandés ni reliés à un
-- modèle Ascender (les autres sont référencés par de vraies demandes).
DELETE FROM services s
 WHERE s.id IN ('create-linux-server','create-windows-server','resize-server','delete-server',
                'create-dns-record','add-firewall-rule','create-load-balancer',
                'deploy-application','rollback-application','create-environment',
                'create-postgresql','create-mysql','restore-backup','create-k8s-namespace',
                'create-certificate','create-user-account','create-s3-bucket','add-monitoring')
   AND s.awx_job_template_id IS NULL
   AND s.awx_workflow_job_template_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM requests r WHERE r.service_id = s.id);

COMMIT;
