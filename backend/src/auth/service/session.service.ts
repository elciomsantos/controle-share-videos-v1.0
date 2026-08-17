import { Injectable } from "@nestjs/common";
import { User } from "../../../prisma/generated/prisma/client";
import { ConfigService } from "../../config/config.service";
import { PrismaService } from "../../prisma/prisma.service";
import { timespanToMs } from "../../utils/timespan.util";
import { TokenService } from "./token.service";

/**
 * SEC-1.2/§10-§11 (Fase 4) — Validação de requisições autenticadas por sessão
 * de acesso server-side (token opaco).
 *
 * Pipeline (§10): cookie -> hash -> lookup -> revogado? -> expirado? ->
 * usuário ativo? -> autorização. O timeout por inatividade (§11.2) usa
 * `lastActivityAt` + `general.sessionIdleTimeout`; a expiração absoluta
 * (§11.1) usa `expiresAt`. `lastActivityAt` é atualizado de forma condicional
 * (§10.4), no máximo uma vez por minuto por sessão.
 */
@Injectable()
export class SessionService {
  constructor(
    private prisma: PrismaService,
    private tokenService: TokenService,
    private config: ConfigService,
  ) {}

  /** Tempo mínimo entre atualizações de lastActivityAt (§10.4). */
  private readonly LAST_ACTIVITY_INTERVAL_MS = 60_000;

  /**
   * Valida um access token opaco e retorna o usuário autenticado, ou null se
   * inválido (ausente, revogado, expirado, inativo ou fora do idle timeout).
   */
  async validate(accessToken: string | undefined): Promise<User | null> {
    if (!accessToken) return null;

    const session = await this.tokenService.getSessionByAccessToken(accessToken);
    if (!session) return null;

    // §10: sessão revogada é recusada.
    if (session.revokedAt) return null;

    const now = Date.now();

    // §11.1: expiração absoluta.
    if (session.expiresAt.getTime() <= now) return null;

    // §11.2: timeout por inatividade.
    const idleTimeout = timespanToMs(
      this.config.getTimespan("general.sessionIdleTimeout"),
    );
    if (session.lastActivityAt.getTime() + idleTimeout <= now) return null;

    // §10: usuário deve existir e estar ativo.
    if (!session.user || !session.user.isActivated) return null;

    // §10.4: atualização condicional de lastActivityAt (no máximo 1/min).
    if (now - session.lastActivityAt.getTime() >= this.LAST_ACTIVITY_INTERVAL_MS) {
      await this.prisma.session
        .updateMany({
          where: {
            id: session.id,
            lastActivityAt: session.lastActivityAt,
          },
          data: { lastActivityAt: new Date() },
        })
        .catch(() => undefined);
    }

    return session.user;
  }

  /** Sessão de acesso corrente (para reautenticação/sign-out). */
  async findByAccessToken(accessToken: string | undefined) {
    if (!accessToken) return null;
    return this.tokenService.getSessionByAccessToken(accessToken);
  }
}
