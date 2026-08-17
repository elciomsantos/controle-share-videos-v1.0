import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "../../config/config.service";
import { getSessionCookieName } from "../../utils/session-cookie.util";
import { timespanToMs } from "../../utils/timespan.util";
import { SessionService } from "../service/session.service";

/**
 * SEC-1.2/15.4 — Operações críticas exigem autenticação recente.
 *
 * Verifica que o refresh token da sessão corrente (descoberta via sessão de
 * acesso server-side) carrega um marco `reauthenticatedAt` dentro da janela
 * `general.reauthWindow` (padrão 5m). Login recente ou
 * `POST /auth/reauthenticate` renovam o marco. Fora da janela, a operação é
 * recusada com 403 e o cliente deve reautenticar.
 */
@Injectable()
export class ReauthGuard implements CanActivate {
  constructor(
    private sessionService: SessionService,
    private config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ cookies: Record<string, string> }>();

    const cookieName = getSessionCookieName(
      this.config.getBoolean("general.secureCookies"),
    );
    const accessToken =
      request.cookies?.[cookieName] ?? request.cookies?.access_token;

    if (!accessToken) this.raiseReauthRequired();

    const session = await this.sessionService.findByAccessToken(accessToken);

    const reauthenticatedAt = session?.refreshToken?.reauthenticatedAt;
    if (!reauthenticatedAt) this.raiseReauthRequired();

    const { value, unit } = this.config.getTimespan("general.reauthWindow");
    const windowMs = timespanToMs({ value, unit });
    if (Date.now() - reauthenticatedAt.getTime() > windowMs)
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