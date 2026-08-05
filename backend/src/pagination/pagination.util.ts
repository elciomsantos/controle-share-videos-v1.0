/**
 * Limite máximo de `perPage` aceito pelas listagens paginadas (R03).
 * Evita que um cliente solicite a base inteira num único round-trip.
 */
export const MAX_PER_PAGE = 100;
const DEFAULT_PER_PAGE = 20;
const DEFAULT_PAGE = 1;

export interface PaginationQuery {
  page?: unknown;
  perPage?: unknown;
}

export interface NormalizedPagination {
  page: number;
  perPage: number;
  skip: number;
}

/**
 * Coage e normaliza os parâmetros de paginação vindos da query string.
 *
 * - `page` inteiro >= 1 (default 1).
 * - `perPage` inteiro 1..MAX_PER_PAGE (default 20).
 * - Entradas inválidas (NaN, <=0, não-finitas) caem no default.
 *
 * Mantido puro (sem deps) para testes unitários cobrirem todos os ramos.
 */
export function normalizePagination(
  query: PaginationQuery,
): NormalizedPagination {
  const page = clampInt(query.page, DEFAULT_PAGE, DEFAULT_PAGE, Number.POSITIVE_INFINITY);
  const perPage = clampInt(
    query.perPage,
    DEFAULT_PER_PAGE,
    1,
    MAX_PER_PAGE,
  );
  return { page, perPage, skip: (page - 1) * perPage };
}

function clampInt(
  raw: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === null || raw === undefined || raw === "") return fallback;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < min) return fallback;
  if (n > max) return max;
  return Math.trunc(n);
}
