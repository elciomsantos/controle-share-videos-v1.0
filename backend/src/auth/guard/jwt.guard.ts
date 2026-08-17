import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../decorator/public.decorator";
import { enhanceRequestContext } from "../../common/request-context/request-context";
import { ConfigService } from "../../config/config.service";
import { SessionService } from "../service/session.service";
import { getSessionCookieName } from "../../utils/session-cookie.util";

/**
 * Guard de autenticação por sessão de acesso server-side (SEC-1.2/§10, Fase 4).
 *
 * O access token é opaco; cada requisição autenticada é validada no banco:
 * SHA-256 -> lookup -> revogado? -> expirado? -> usuário ativo?. Rotas
 * `@Public()` tentam autenticação opcional e nunca bloqueiam visitantes.
 */
@Injectable()
export class JwtGuard {
  constructor(
    private reflector: Reflector,
    private sessionService: SessionService,
    private config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context
      .switchToHttp()
      .getRequest<{ cookies?: Record<string, string>; user?: unknown }>();

    if (isPublic) {
      await this.authenticateOptional(request);
      return true;
    }

    const user = await this.authenticate(request);
    if (!user) {
      // SEC-01/R02: fail-closed. Sessão ausente, revogada, expirada ou usuário
      // inativo nunca caem em acesso anônimo fora de rotas @Public().
      throw new UnauthorizedException();
    }

    // GAP-02: stampa o usuário autenticado no request context para os logs.
    enhanceRequestContext({ userId: user.id });
    return true;
  }

  private async authenticateOptional(request: {
    cookies?: Record<string, string>;
    user?: unknown;
  }): Promise<void> {
    const user = await this.authenticate(request);
    if (user) {
      enhanceRequestContext({ userId: user.id });
    }
  }

  private async authenticate(request: {
    cookies?: Record<string, string>;
    user?: unknown;
  }) {
    const cookieName = getSessionCookieName(
      this.config.getBoolean("general.secureCookies"),
    );
    const accessToken =
      request.cookies?.[cookieName] ?? request.cookies?.access_token;
    const user = await this.sessionService.validate(accessToken);
    if (!user) return null;
    (request as { user?: unknown }).user = user;
    return user;
  }
}
