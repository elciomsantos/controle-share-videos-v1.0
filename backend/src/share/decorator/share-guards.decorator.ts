import { applyDecorators, UseGuards } from "@nestjs/common";
import { IdValidation } from "../guard/shareIdValidation.guard";
import { ShareSecurityGuard } from "../guard/shareSecurity.guard";
import { ShareOwnerGuard } from "../guard/shareOwner.guard";
import { StrictShareOwnerGuard } from "../guard/strictShareOwner.guard";
import { ShareTokenSecurity } from "../guard/shareTokenSecurity.guard";

/**
 * Validação de ID + verificação de segurança do share (público com token/senha)
 */
export const SharePublicAccess = () => applyDecorators(
  UseGuards(IdValidation, ShareSecurityGuard),
);

/**
 * Validação de ID + verificação de dono do share (pode editar)
 */
export const ShareOwnerAccess = () => applyDecorators(
  UseGuards(IdValidation, ShareOwnerGuard),
);

/**
 * Validação de ID + verificação estrita de dono (apenas owner, não admin)
 */
export const StrictShareOwnerAccess = () => applyDecorators(
  UseGuards(IdValidation, StrictShareOwnerGuard),
);

/**
 * Validação de ID + verificação de token de share
 */
export const ShareTokenAccess = () => applyDecorators(
  UseGuards(IdValidation, ShareTokenSecurity),
);
