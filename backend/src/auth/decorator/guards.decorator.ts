import { applyDecorators, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../guard/jwt.guard";
import { RolesGuard } from "../guard/roles.guard";
import { Roles } from "./roles.decorator";

/**
 * Endpoint que requer autenticação (JWT válido)
 * JwtGuard já é global, mas este decorator torna explícito
 */
export const Authenticated = () => applyDecorators(
  UseGuards(JwtGuard),
);

/**
 * Endpoint apenas para admins
 * Combina JwtGuard + RolesGuard + @Roles('admin')
 */
export const AdminOnly = () => applyDecorators(
  UseGuards(JwtGuard, RolesGuard),
  Roles('admin'),
);

/**
 * Endpoint para admin ou auditor
 */
export const AdminOrAuditor = () => applyDecorators(
  UseGuards(JwtGuard, RolesGuard),
  Roles('admin', 'auditor'),
);

/**
 * Re-export para conveniência
 */
export { Public } from "./public.decorator";
export { Roles } from "./roles.decorator";
