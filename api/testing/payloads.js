/** Valeurs de formulaire valides pour les services utilisés par les tests. */
const PAYLOADS = {
  'create-dns-record': {
    zone: 'acme.fr', record_type: 'A', fqdn: 'app.acme.fr', value: '10.0.0.12',
  },
  'create-linux-server': {
    hostname: 'web-test-01',
    environment: 'dev',
    os: 'rocky9',
    cpu: 2,
    ram_gb: 4,
    subnet: '10.20.0.0/24',
    owner_email: 'alice@acme.fr',
  },
  'delete-server': {
    server: 'old-app-07', confirm: 'old-app-07', reason: 'Serveur décommissionné après migration.',
  },
};

module.exports = { PAYLOADS };
