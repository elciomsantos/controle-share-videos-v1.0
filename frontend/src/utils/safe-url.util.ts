/**
 * SEC-URL: URLs vindas de configuração (ex.: general.appUrl, legal.*Url) são
 * renderizadas como href ou redirect. Só http(s) é considerado seguro —
 * esquemas executáveis (javascript:, data:) são descartados.
 */
export const isSafeHttpUrl = (url: string | undefined | null): boolean => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

/** Retorna a URL se for http(s) seguro; caso contrário, null. */
export const safeHttpUrl = (url: string | undefined | null): string | null =>
  isSafeHttpUrl(url) ? (url as string) : null;

/**
 * Base segura para montar links de compartilhamento a partir de
 * general.appUrl: só aceita http(s); caso contrário, cai para a origem atual.
 */
export const safeShareLinkBase = (url: string | undefined | null): string =>
  isSafeHttpUrl(url)
    ? (url as string)
    : typeof window !== "undefined"
      ? window.location.origin
      : "";
