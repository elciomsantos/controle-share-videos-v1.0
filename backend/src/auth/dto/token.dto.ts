import { Expose, plainToClass } from "class-transformer";

export class TokenDTO {
  @Expose()
  accessToken!: string;

  // VULN-19: o refresh token NUNCA é serializado no body — viaja somente no
  // cookie httpOnly emitido por token.service.addTokensToResponse. O campo
  // permanece tipado porque os serviços o devolvem junto com o accessToken.
  refreshToken!: string;

  from(partial: Partial<TokenDTO>) {
    return plainToClass(TokenDTO, partial, {
      excludeExtraneousValues: true,
    });
  }
}
