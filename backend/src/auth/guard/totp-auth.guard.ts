import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

/**
 * SEC-1.2/14.6, §15.2 — Exige TOTP para usuários admin.
 *
 * Admins sem totpVerified = true recebem 403 e devem completar o cadastro
 * de TOTP (via /auth/totp/enroll) antes de obter acesso total.
 * Usuários não-admin são liberados (sem TOTP obrigatório).
 */
@Injectable()
export class TotpAuthGuard implements CanActivate {
  constructor() {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return true;

    const isAdmin = user.isAdmin || user.role === "admin";

    if (isAdmin && !user.totpVerified) {
      throw new ForbiddenException({
        message: "TOTP required for administrative account",
        error: "totp_required_for_admin",
      });
    }

    return true;
  }
}