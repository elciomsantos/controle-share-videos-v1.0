import { BadRequestException, Injectable } from "@nestjs/common";
import { RequestContextLogger } from "../common/request-context/request-context";
import { getRequestContext } from "../common/request-context/request-context";
import { Prisma } from "../../prisma/generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Eventos mínimos de auditoria (§29.4). Nomes preservados para estabilidade do
 * dashboard; adicione novos eventos aqui e use nas chamadas de `record`.
 */
export const AuditEvent = {
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILURE: "LOGIN_FAILURE",
  LOGOUT: "LOGOUT",
  SESSION_CREATED: "SESSION_CREATED",
  SESSION_REVOKED: "SESSION_REVOKED",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  PASSWORD_RESET_REQUESTED: "PASSWORD_RESET_REQUESTED",
  PASSWORD_RESET_COMPLETED: "PASSWORD_RESET_COMPLETED",
  MFA_ENABLED: "MFA_ENABLED",
  MFA_DISABLED: "MFA_DISABLED",
  MFA_FAILED: "MFA_FAILED",
  PERMISSION_CHANGED: "PERMISSION_CHANGED",
  ROLE_CHANGED: "ROLE_CHANGED",
  SHARE_CREATED: "SHARE_CREATED",
  SHARE_REVOKED: "SHARE_REVOKED",
  REFRESH_TOKEN_REUSE_DETECTED: "REFRESH_TOKEN_REUSE_DETECTED",
  ADMIN_SESSION_REVOKED: "ADMIN_SESSION_REVOKED",
} as const;

export type AuditEventType = (typeof AuditEvent)[keyof typeof AuditEvent];

export interface AuditRecordInput {
  userId?: string | null;
  sessionId?: string | null;
  resource?: string | null;
  result?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * SEC-1.2/§29 (Fase 5) — Trilha de auditoria.
 *
 * `record` nunca lança (BKD-04): falha de auditoria não pode derrubar o fluxo
 * principal. IP/User-Agent/requestId vêm do request context (§29.3/§30);
 * userId pode ser sobrescrito explicitamente quando o evento ocorre antes do
 * guard popular o contexto (ex.: login).
 */
@Injectable()
export class AuditService {
  private readonly logger = new RequestContextLogger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async record(
    eventType: AuditEventType,
    fields?: AuditRecordInput,
  ): Promise<void> {
    try {
      const ctx = getRequestContext();
      await this.prisma.auditLog.create({
        data: {
          eventType,
          userId: fields?.userId ?? ctx?.userId ?? null,
          sessionId: fields?.sessionId ?? null,
          resource: fields?.resource ?? null,
          result: fields?.result ?? null,
          metadata: fields?.metadata
            ? JSON.stringify(fields.metadata)
            : null,
          ipAddress: ctx?.ip ?? null,
          userAgent: ctx?.userAgent ?? null,
          requestId: ctx?.requestId ?? null,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "unknown error";
      this.logger.error(
        `Failed to record audit event ${eventType}: ${message}`,
        { eventType, stack: err instanceof Error ? err.stack : undefined },
      );
    }
  }

  async findAll(params: {
    eventType?: string;
    userId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const { eventType, userId, from, to, page = 1, limit = 50 } = params;

    const where: Prisma.AuditLogWhereInput = {};
    if (eventType) where.eventType = eventType;
    if (userId) where.userId = userId;
    if (from || to) {
      where.createdAt = {};
      if (from) {
        const fromDate = new Date(from);
        if (isNaN(fromDate.getTime()))
          throw new BadRequestException(`Invalid "from" date: ${from}`);
        where.createdAt.gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        if (isNaN(toDate.getTime()))
          throw new BadRequestException(`Invalid "to" date: ${to}`);
        where.createdAt.lte = toDate;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, email: true, username: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}