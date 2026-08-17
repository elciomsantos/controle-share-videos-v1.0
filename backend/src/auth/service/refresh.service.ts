import { Injectable, UnauthorizedException } from "@nestjs/common";
import { RequestContextLogger } from "../../common/request-context/request-context";
import { PrismaService } from "../../prisma/prisma.service";
import { TokenService } from "./token.service";

/**
 * RefreshService — ciclo de vida das sessões: rotação do refresh token (com
 * detecção de reuso SEC-07), emissão de sessões de acesso opacas e revogação
 * ativa de sessões.
 */
@Injectable()
export class RefreshService {
  constructor(
    private prisma: PrismaService,
    private tokenService: TokenService,
  ) {}
  private readonly logger = new RequestContextLogger(RefreshService.name);

  /**
   * Rotaciona o refresh token emitindo um novo par access/refresh dentro de uma
   * transação. Se um token já consumido (reusado) for apresentado, revoga toda
   * a família de sessões do usuário antes de recusar a requisição.
   *
   * A rotação elimina o refresh anterior (cascateando a exclusão da sessão de
   * acesso vinculada) e emite uma nova sessão de acesso opaca (§6) ligada ao
   * novo refresh, carregando o marco de reautenticação da família.
   */
  async refreshAccessToken(refreshToken: string) {
    const refreshTokenMetaData = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });
    if (!refreshTokenMetaData || refreshTokenMetaData.expiresAt < new Date())
      throw new UnauthorizedException();

    // SEC-07: atomic rotation + reuse detection. delete+create happen inside a
    // transaction; deleteMany reports the count so a replayed token (already
    // consumed by a previous rotation) is detected and the whole family is
    // revoked. The revocation commits (it's returned from the tx) before the
    // UnauthorizedException is raised, so it persists across the throw.
    try {
      const outcome = await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.refreshToken.deleteMany({
          where: { id: refreshTokenMetaData.id },
        });

        if (count === 0) {
          // Reuse detected — a rotated token was presented again. Revoke every
          // session token for the user before refusing.
          await tx.refreshToken.deleteMany({
            where: { userId: refreshTokenMetaData.user.id },
          });
          return { reuse: true } as const;
        }

        const newRefreshToken = await this.tokenService.createRefreshToken(
          refreshTokenMetaData.user.id,
          tx,
          refreshTokenMetaData.reauthenticatedAt ?? undefined,
        );

        const { accessToken } = await this.tokenService.createSession(
          refreshTokenMetaData.user.id,
          newRefreshToken.id,
          tx,
        );

        return {
          reuse: false,
          accessToken,
          refreshToken: newRefreshToken.token,
          refreshTokenId: newRefreshToken.id,
        } as const;
      });

      if (outcome.reuse) {
        this.logger.warn(
          `Reuse of refresh token detected for user ${refreshTokenMetaData.user.email}; all sessions revoked`,
        );
        throw new UnauthorizedException();
      }

      const { accessToken, refreshToken: newToken, refreshTokenId } = outcome;
      return { accessToken, refreshToken: newToken, refreshTokenId };
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException();
    }
  }

  /**
   * Revoga a sessão de acesso informada (endpoint signOut). A exclusão do
   * refresh token associado cascateia (FK) para a sessão de acesso.
   */
  async signOut(accessToken: string) {
    if (!accessToken) return;

    const session = await this.tokenService.getSessionByAccessToken(accessToken);
    if (!session) return;

    await this.prisma.refreshToken
      .delete({ where: { id: session.refreshTokenId } })
      .catch((e) => {
        // Ignore error if refresh token doesn't exist
        if (e.code != "P2025") throw e;
      });
  }

  /**
   * Revoga todas as sessões (refresh tokens e sessões de acesso) e invalida
   * login tokens pendentes do usuário.
   */
  async logoutAllDevices(userId: string) {
    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });

    await this.prisma.loginToken.updateMany({
      where: { userId, used: false },
      data: { used: true },
    });
  }
}