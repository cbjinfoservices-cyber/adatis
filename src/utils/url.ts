/** URL http(s) avec un nom d'hôte qualifié (au moins un point). */
export const httpUrlIsValid = (value: string) => {
  const raw = value.trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    const okProtocol = url.protocol === 'http:' || url.protocol === 'https:';
    return okProtocol && url.hostname.includes('.');
  } catch {
    return false;
  }
};
