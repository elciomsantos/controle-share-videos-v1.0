import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "../../config/config.service";
import { PrismaService } from "../../prisma/prisma.service";
import { getSessionCookieName } from "../../utils/session-cookie.util";
import { TokenService } from "../service/token.service";

/**
 * SEC-1.2/15.4 — Operações críticas exigem autenticação recente.
 *
 * Verifica que o refresh token da sessão corrente carrega um marco
 * `reauthenticatedAt` dentro da janela `general.reauthWindow` (padrão 5m).
 * Login recente ou `POST /auth/reauthenticate` renovam o marco. Fora da
 * janela, a operação é recusada com 403 e o cliente deve reautenticar.
 */
@Injectable()
export class ReauthGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private tokenService: TokenService,
    private config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ cookies: Record<string, string> }>();

    const cookieName = getSessionCookieName(
      this.config.getBoolean("general.secureCookies"),
    );
    const accessToken =
      request.cookies?.[cookieName] ?? request.cookies?.access_token;

    if (!accessToken) this.raiseReauthRequired();

    const refreshTokenId = this.tokenService.extractRefreshTokenId(accessToken);

    if (!refreshTokenId) this.raiseReauthRequired();

    const session = await this.prisma.refreshToken.findUnique({
      where: { id: refreshTokenId },
      select: { reauthenticatedAt: true },
    });

    if (!session?.reauthenticatedAt) this.raiseReauthRequired();

    const { value, unit } = this.config.getTimespan("general.reauthWindow");
    const windowMs = value * toMs(unit);
    if (Date.now() - session.reauthenticatedAt.getTime() > windowMs)
      this.raiseReauthRequired();

    return true;
  }

  private raiseReauthRequired(): never {
    throw new ForbiddenException({
      message: "reauthentication_required",
      error: "reauthentication_required",
    });
  }
}

function toMs(unit: string): number {
  switch (unit) {
    case "minutes":
      return 60_000;
    case "hours":
      return 3_600_000;
    case "days":
      return 86_400_000;
    case "weeks":
      return 7 * 86_400_000;
    case "months":
      return 30 * 86_400_000;
    case "years":
      return 365 * 86_400_000;
    default:
      return 60_000;
  }
}
