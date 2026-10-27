/**
 * Cellule CSV sûre pour un tableur.
 *
 * - Guillemets si la valeur contient un séparateur, un guillemet ou un saut de ligne.
 * - Injection de formule neutralisée : une valeur commençant par = + - @ ou par
 *   une tabulation / un retour chariot serait exécutée par Excel ou LibreOffice
 *   à l'ouverture ; elle est préfixée d'une apostrophe et reste du texte.
 */
export const csvCell = (value: unknown) => {
  let raw = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(raw)) raw = `'${raw}`;
  return /[";,\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
};

/** Lignes -> texte CSV (séparateur « ; », fins de ligne Windows). */
export const toCsv = (rows: unknown[][]) => rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
