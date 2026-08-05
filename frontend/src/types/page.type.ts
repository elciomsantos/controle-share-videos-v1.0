/**
 * Envelope paginado retornado pelas rotas de listagem (R03, v1.2.0 breaking).
 * Espelha `PageDTO<T>` do backend (backend/src/pagination/page.dto.ts).
 */
export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
};

/**
 * Parâmetros de paginação opcionais aceitos pelas listagens.
 * `perPage` tem teto de 100 no backend (qualquer valor maior é clamped).
 */
export type PaginationParams = {
  page?: number;
  perPage?: number;
};

/**
 * Monta a query string de paginação para um `api.get` (axios).
 * Retorna string vazia quando não há params, evita `?page=undefined`.
 */
export function toPaginationQuery(
  params?: PaginationParams,
): Record<string, number> {
  const query: Record<string, number> = {};
  if (params && Number.isFinite(params.page) && params.page! > 0) {
    query.page = params.page!;
  }
  if (
    params &&
    Number.isFinite(params.perPage) &&
    params.perPage! > 0
  ) {
    query.perPage = params.perPage!;
  }
  return query;
}
