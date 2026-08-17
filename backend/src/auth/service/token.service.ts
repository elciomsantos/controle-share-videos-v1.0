import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request, Response } from "express";
import { Prisma, User } from "../../../prisma/generated/prisma/client";
import dayjs from "dayjs";
import { ConfigService } from "../../config/config.service";
import { JwtSecretService } from "../../config/jwt-secret.service";
import { PrismaService } from "../../prisma/prisma.service";
import {
  REFRESH_COOKIE_NAME,
  getSessionCookieName,
} from "../../utils/session-cookie.util";

/**
 * TokenService — emissão e manipulação de tokens (access/refresh/login) e
 * cookies de sessão.
 *
 * A emissão do access token (JWT assinado), a escrita de cookies e a leitura do
 * usuário corrente a partir do request **não dependem de banco de dados**. Apenas
 * a persistência dos refresh/login tokens (para rotação/invalidação) toca o
 * Prisma, sempre de forma transacional via `tx` opcional.
 */
@Injectable()
export class TokenService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private jwtSecret: JwtSecretService,
  ) {}

  /**
   * Assina um access token JWT de curta duração (15 min), resolvendo o segredo
   * atual e o `kid` de rotação.
   */
  signAccessToken(user: User, refreshTokenId: string) {
    const secret = this.jwtSecret.getCurrentSecret();
    return this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        isAdmin: user.isAdmin,
        refreshTokenId,
      },
      {
        expiresIn: "15min",
        secret,
        keyid: this.jwtSecret.getKid(secret),
      },
    );
  }

  /**
   * Cria (e persiste) um novo refresh token para o usuário. Aceita um client de
   * transação opcional para composição com outras operações atômicas.
   */
  createRefreshToken(userId: string, tx?: Prisma.TransactionClient) {
    const prisma = tx || this.prisma;
    const sessionDuration = this.config.getTimespan("general.sessionDuration");
    return prisma.refreshToken.create({
      data: {
        userId,
        expiresAt: dayjs()
          .add(sessionDuration.value, sessionDuration.unit)
          .toDate(),
      },
    });
  }

  /**
   * Cria um login token de uso único para o segundo fator (TOTP). Invalida os
   * login tokens anteriores não usados antes de criar um novo.
   */
  createLoginToken(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.loginToken.updateMany({
        where: { userId, used: false },
        data: { used: true },
      });

      return (
        await tx.loginToken.create({
          data: { userId, expiresAt: dayjs().add(5, "minutes").toDate() },
        })
      ).token;
    });
  }

  /**
   * Grava access/refresh tokens como cookies httpOnly de sessão.
   *
   * Em produção o cookie de sessão usa o prefixo `__Host-` (exige Secure e
   * Path=/). Em dev (Secure=false) mantém o nome legado, pois o browser
   * rejeita cookies `__Host-` sem Secure.
   */
  addTokensToResponse(
    response: Response,
    refreshToken?: string,
    accessToken?: string,
  ) {
    const isSecure = this.config.getBoolean("general.secureCookies");
    const sessionCookieName = getSessionCookieName(isSecure);
    response.setHeader("Cache-Control", "no-store");
    if (accessToken)
      response.cookie(sessionCookieName, accessToken, {
        httpOnly: true,
        sameSite: "strict",
        secure: isSecure,
        path: "/",
        maxAge: 1000 * 60 * 60 * 24 * 30 * 3, // 3 months
      });
    if (refreshToken) {
      const now = dayjs();
      const sessionDuration = this.config.getTimespan("general.sessionDuration");
      const maxAge = dayjs(now)
        .add(sessionDuration.value, sessionDuration.unit)
        .diff(now);
      response.cookie(REFRESH_COOKIE_NAME, refreshToken, {
        path: "/api/auth/token",
        httpOnly: true,
        sameSite: "strict",
        secure: isSecure,
        maxAge,
      });
    }
  }

  /**
   * Returns the user id if the user is logged in, null otherwise.
   * Resolves the exact secret that signed the token by its kid (rotation-aware)
   * in O(1) instead of trying every verification secret.
   */
  async getUserIdFromRequest(request: Request): Promise<string | null> {
    const cookieName = getSessionCookieName(
      this.config.getBoolean("general.secureCookies"),
    );
    if (!request.cookies[cookieName]) return null;
    const secret =
      this.jwtSecret.resolveSecretForToken(request.cookies[cookieName]) ??
      this.jwtSecret.getCurrentSecret();
    try {
      const payload = await this.jwtService.verifyAsync(
        request.cookies[cookieName],
        { secret, algorithms: ["HS256", "HS512"] },
      );
      return payload.sub;
    } catch {
      return null;
    }
  }

  /**
   * Extrai o `refreshTokenId` (id da sessão) de um access token sem verificar
   * assinatura — usado apenas para localizar e revogar a sessão no sign-out.
   */
  extractRefreshTokenId(accessToken: string): string | undefined {
    const { refreshTokenId } = (this.jwtService.decode(accessToken) as {
      refreshTokenId?: string;
    }) || {};
    return refreshTokenId;
  }
}
