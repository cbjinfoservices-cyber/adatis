const awxJobs = require('./awxJobs');

/**
 * Moteurs d'exécution (types de connecteur).
 *
 * Chaque service est rattaché à un connecteur ; sa demande garde le type du
 * connecteur (requests.connector_kind). Seuls les moteurs de WIRED lancent
 * réellement des jobs ; les autres sont suivis mais « non branchés ».
 */

const WIRED = ['ascender'];

const isWired = (kind) => WIRED.includes(kind);

/**
 * Moteur d'un service (ligne services + c.kind AS connector_kind).
 * Sans connecteur : Ascender si un modèle est affecté (comportement historique).
 */
const engineForService = (row) => {
  if (row?.connector_kind) return row.connector_kind;
  return awxJobs.templateForService(row) ? 'ascender' : '';
};

/** Statut de suivi d'une demande routée vers un moteur non branché. */
const NOT_WIRED = 'not_wired';

module.exports = {
  WIRED, NOT_WIRED, isWired, engineForService,
};
