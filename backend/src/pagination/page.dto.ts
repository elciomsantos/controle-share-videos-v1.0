import { Expose, Type } from "class-transformer";

/**
 * Página de resultados paginados.
 *
 * Contrato Breaking v1.2.0 (R03): as rotas de listagem de shares
 * (`GET /api/shares` e `GET /api/shares/all`) agora retornam este
 * envelope em vez de um array puro.
 *
 * `items` é instanciado pelo caller via plainToClass antes de entrar
 * no envelope (cada DTO mantém seu próprio `from`/`fromList`).
 */
export class PageDTO<T> {
  @Expose()
  @Type(() => Object)
  items!: T[];

  @Expose()
  total!: number;

  @Expose()
  page!: number;

  @Expose()
  perPage!: number;

  @Expose()
  totalPages!: number;

  static of<T>(items: T[], total: number, page: number, perPage: number): PageDTO<T> {
    const totalPages =
      perPage > 0 ? Math.max(1, Math.ceil(total / perPage)) : 1;
    return { items, total, page, perPage, totalPages } as PageDTO<T>;
  }
}
