import { applyDecorators, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../guard/jwt.guard";
import { RolesGuard } from "../guard/roles.guard";
import { Roles } from "./roles.decorator";
import { TotpAuthGuard } from "../guard/totp-auth.guard";

/**
 * Endpoint que requer autenticação (JWT válido)
 * JwtGuard já é global, mas este decorator torna explícito
 */
export const Authenticated = () => applyDecorators(
  UseGuards(JwtGuard),
);

/**
 * Endpoint apenas para admins com TOTP obrigatório.
 * Combina JwtGuard + RolesGuard + @Roles('admin') + TOTP check.
 * Admins sem totpVerified recebem 403 e devem completar cadastro de TOTP.
 */
export const AdminOnly = () => applyDecorators(
  UseGuards(JwtGuard, RolesGuard, TotpAuthGuard),
  Roles('admin'),
);

/**
 * Endpoint para admin ou auditor com TOTP obrigatório.
 */
export const AdminOrAuditor = () => applyDecorators(
  UseGuards(JwtGuard, RolesGuard, TotpAuthGuard),
  Roles('admin', 'auditor'),
);

/**
 * Re-export para conveniência
 */
export { Public } from "./public.decorator";
export { Roles } from "./roles.decorator";
