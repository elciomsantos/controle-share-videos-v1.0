/**
 * SEC-NEW-1: extrai um valor de `window.location.hash` (formato `#token=...`).
 * Fragments não são enviados ao servidor, portanto não aparecem nos access
 * logs. Retorna `null` quando ausente ou sem valor.
 */
export const getHashValue = (key: string): string | null => {
  if (typeof window === "undefined") return null;

  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;

  const params = new URLSearchParams(hash);
  const value = params.get(key);
  return value && value.length > 0 ? value : null;
};