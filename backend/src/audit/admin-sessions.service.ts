import { Injectable, NotFoundException } from "@nestjs/common";
import { I18nService } from "nestjs-i18n";
import { Prisma } from "../../prisma/generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ConfigService } from "../config/config.service";
import { timespanToMs } from "../utils/timespan.util";
import { AuditEvent, AuditService } from "./audit.service";

type SessionState = "active" | "idle" | "expired" | "revoked";

/**
 * SEC-1.2/§34 (Fase 5) — Admin de sessões: listar sessões ativas com IP,
 * User-Agent e estado; revogar sessões de usuários. Nunca expõe o token (o
 * `tokenHash` jamais é selecionado — §34.1). Revogação é operação crítica e
 * auditada (§34.3, ADMIN_SESSION_REVOKED).
 */
@Injectable()
export class AdminSessionsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private readonly i18n: I18nService,
    private audit: AuditService,
  ) {}

  async findAll(params: { userId?: string; page?: number; limit?: number }) {
    const { userId, page = 1, limit = 50 } = params;

    const where: Prisma.SessionWhereInput = {};
    if (userId) where.userId = userId;

    const idleTimeoutMs = timespanToMs(
      this.config.getTimespan("general.sessionIdleTimeout"),
    );
    const now = Date.now();

    const [data, total] = await Promise.all([
      this.prisma.session.findMany({
        where,
        orderBy: { lastActivityAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              isAdmin: true,
              role: true,
            },
          },
        },
      }),
      this.prisma.session.count({ where }),
    ]);

    const sessions = data.map((s) => {
      let state: SessionState = "active";
      if (s.revokedAt) state = "revoked";
      else if (s.expiresAt.getTime() <= now) state = "expired";
      else if (s.lastActivityAt.getTime() + idleTimeoutMs <= now) state = "idle";

      return {
        id: s.id,
        userId: s.userId,
        username: s.user?.username ?? null,
        email: s.user?.email ?? null,
        role: s.user?.role ?? null,
        isAdmin: s.user?.isAdmin ?? false,
        createdAt: s.createdAt,
        lastActivityAt: s.lastActivityAt,
        expiresAt: s.expiresAt,
        revokedAt: s.revokedAt,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        state,
      };
    });

    return {
      data: sessions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Revoga uma sessão de acesso específica (exclui o refresh token, cascata). */
  async revoke(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        user: { select: { id: true, email: true, username: true } },
        refreshToken: { select: { id: true } },
      },
    });

    if (!session)
      throw new NotFoundException(this.i18n.t("session.notFound"));

    await this.prisma.refreshToken.deleteMany({
      where: { id: session.refreshToken.id },
    });

    await this.audit.record(AuditEvent.ADMIN_SESSION_REVOKED, {
      userId: session.userId,
      sessionId: session.id,
      resource: "session",
      result: "success",
      metadata: {
        targetUserId: session.userId,
        targetEmail: session.user.email,
      },
    });

    return { ok: true };
  }

  /** Revoga todas as sessões de um usuário (§34). */
  async revokeAllByUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, username: true },
    });

    if (!user)
      throw new NotFoundException(this.i18n.t("session.userNotFound"));

    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });

    await this.audit.record(AuditEvent.ADMIN_SESSION_REVOKED, {
      userId,
      resource: "sessions",
      result: "success",
      metadata: {
        targetUserId: userId,
        targetEmail: user.email,
        revokedCount: count,
      },
    });

    return { ok: true, revokedCount: count };
  }
}