export function safeRedirectPath(path: string | undefined) {
  const fallback = "/";

  if (!path) return fallback;

  // Caracteres de controle podem smugglear URLs (\n, \r, tab).
  if (/[\u0000-\u001f\u007f]/.test(path)) return fallback;

  // Protocol-relative ("//host" ou "/\host") vira troca de origem no
  // navegador — open redirect. Exige caminho relativo ao app.
  if (/^\/+[\\/]/.test(path)) return fallback;

  if (!path.startsWith("/")) return `/${path}`;

  return path;
}

export function getQueryString(
  value: string | string[] | undefined,
): string | undefined {
  return typeof value === "string" ? value : undefined;
}
