/** Déclenche le téléchargement d'un fichier généré dans le navigateur. */
const downloadFile = (fileName: string, content: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/** CSV avec BOM UTF-8 : accents corrects à l'ouverture dans Excel. */
export const downloadCsv = (fileName: string, content: string) =>
  downloadFile(fileName, `\ufeff${content}`, 'text/csv;charset=utf-8;');

export const downloadJson = (fileName: string, content: string) =>
  downloadFile(fileName, content, 'application/json;charset=utf-8;');
