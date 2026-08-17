import { Injectable } from "@nestjs/common";
import { Request, Response } from "express";
import { Prisma } from "../../../prisma/generated/prisma/client";
import { randomBytes, createHash } from "crypto";
import dayjs from "dayjs";
import { ConfigService } from "../../config/config.service";
import { PrismaService } from "../../prisma/prisma.service";
import { getRequestContext } from "../../common/request-context/request-context";
import { timespanToMs } from "../../utils/timespan.util";
import {
  REFRESH_COOKIE_NAME,
  getSessionCookieName,
} from "../../utils/session-cookie.util";

/**
 * TokenService — emissão e manipulação de tokens (access/refresh/login) e
 * cookies de sessão.
 *
 * SEC-1.2/§6-§11 (Fase 4): o access token é um valor **opaco** de 256 bits
 * (CSPRNG), nunca armazenado — somente seu SHA-256 (`Session.tokenHash`).
 * Nenhum dado de negócio (user_id, role, email) trafega no token; a associação
 * token↔usuário existe apenas no servidor, em `Session`.
 */
@Injectable()
export class TokenService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /** Gera um access token opaco de 256 bits (CSPRNG, base64url). */
  generateAccessToken(): string {
    return randomBytes(32).toString("base64url");
  }

  /** Gera um refresh token opaco de 256 bits (CSPRNG, base64url). */
  generateRefreshToken(): string {
    return randomBytes(32).toString("base64url");
  }

  /** SHA-256 do token — única forma persistida (access e refresh, §26.3). */
  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  /**
   * Cria (e persiste) uma sessão de acesso server-side para o refresh token
   * informado. O token real é retornado para o cookie; somente o hash é
   * gravado. `expiresAt` = agora + `general.sessionMaxDuration` (§11.1).
   * IP/User-Agent vêm do request context (SEC-1.2/§28.4, truncados no
   * middleware).
   */
  async createSession(
    userId: string,
    refreshTokenId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ accessToken: string; sessionId: string }> {
    const prisma = tx || this.prisma;
    const accessToken = this.generateAccessToken();
    const maxDuration = this.config.getTimespan("general.sessionMaxDuration");
    const ctx = getRequestContext();
    const session = await prisma.session.create({
      data: {
        tokenHash: this.hashToken(accessToken),
        userId,
        refreshTokenId,
        expiresAt: dayjs()
          .add(maxDuration.value, maxDuration.unit)
          .toDate(),
        ipAddress: ctx?.ip ?? null,
        userAgent: ctx?.userAgent ?? null,
      },
      select: { id: true },
    });
    return { accessToken, sessionId: session.id };
  }

  /**
   * Cria (e persiste) um novo refresh token para o usuário. Aceita um client de
   * transação opcional para composição com outras operações atômicas.
   *
   * §26.3 (Fase 4): apenas o SHA-256 do token é persistido (`token`); o valor
   * em texto puro é retornado para o cookie e nunca fica no banco.
   *
   * `reauthAt` define o marco de autenticação recente (SEC-1.2/15.4) da nova
   * sessão: login forte, segundo fator ou reautenticação explícita o preenchem.
   */
  createRefreshToken(
    userId: string,
    tx?: Prisma.TransactionClient,
    reauthAt?: Date,
  ) {
    const prisma = tx || this.prisma;
    const sessionDuration = this.config.getTimespan("general.sessionDuration");
    const plainToken = this.generateRefreshToken();
    return prisma.refreshToken
      .create({
        data: {
          userId,
          token: this.hashToken(plainToken),
          reauthenticatedAt: reauthAt ?? null,
          expiresAt: dayjs()
            .add(sessionDuration.value, sessionDuration.unit)
            .toDate(),
        },
      })
      .then((record) => ({ ...record, token: plainToken }));
  }

  /**
   * SEC-1.2/15.4: marca a sessão como reautenticada no instante atual. Usado
   * após verificação de senha (+ TOTP) no endpoint de reautenticação.
   */
  async markReauthenticated(refreshTokenId: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id: refreshTokenId },
      data: { reauthenticatedAt: new Date() },
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
    if (accessToken) {
      const idleTimeout = this.config.getTimespan(
        "general.sessionIdleTimeout",
      );
      const maxDuration = this.config.getTimespan("general.sessionMaxDuration");
      // O cookie do access token dura o menor entre o timeout de inatividade
      // e a duração absoluta da sessão; o refresh é o que sustenta sessões
      // longas por rotação.
      const cookieMaxAge = Math.min(
        timespanToMs(idleTimeout),
        timespanToMs(maxDuration),
      );
      response.cookie(sessionCookieName, accessToken, {
        httpOnly: true,
        sameSite: "strict",
        secure: isSecure,
        path: "/",
        maxAge: cookieMaxAge,
      });
    }
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
   * Localiza a sessão de acesso pelo token opaco (hash), incluindo o refresh
   * token associado e o usuário. Retorna null quando o hash não corresponde a
   * nenhuma sessão. A validação de estado (revogado/expirado/inativo) fica no
   * SessionService.
   */
  async getSessionByAccessToken(accessToken: string) {
    if (!accessToken) return null;
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.hashToken(accessToken) },
      include: { refreshToken: true, user: true },
    });
    return session;
  }

  /**
   * Returns the user id if the user has a valid access session, null otherwise.
   */
  async getUserIdFromRequest(request: Request): Promise<string | null> {
    const cookieName = getSessionCookieName(
      this.config.getBoolean("general.secureCookies"),
    );
    const accessToken =
      request.cookies[cookieName] ?? request.cookies.access_token;
    if (!accessToken) return null;
    const session = await this.getSessionByAccessToken(accessToken);
    if (!session || session.revokedAt) return null;
    if (session.expiresAt <= new Date()) return null;
    if (!session.user || !session.user.isActivated) return null;
    return session.user.id;
  }
}
