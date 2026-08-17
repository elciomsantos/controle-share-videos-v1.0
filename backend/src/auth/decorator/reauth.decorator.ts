import { applyDecorators, UseGuards } from "@nestjs/common";
import { ReauthGuard } from "../guard/reauth.guard";

/**
 * SEC-1.2/15.4 — Exige autenticação recente para operações críticas.
 * Deve ser combinado com @Authenticated()/@AdminOnly() para que a sessão
 * já tenha sido validada antes do cheque de reautenticação.
 */
export const ReauthRequired = () =>
  applyDecorators(UseGuards(ReauthGuard));
