import { BadRequestException, Injectable } from "@nestjs/common";
import { RequestContextLogger } from "../common/request-context/request-context";
import { getRequestContext } from "../common/request-context/request-context";
import { Prisma } from "../../prisma/generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  AuditEvent,
  AuditEventType,
  AuditRecordInput,
} from "./audit-events";
import { AuditWormService } from "./audit-worm.service";

// Reexportado p/ estabilidade dos consumidores existentes.
export { AuditEvent, AuditEventType, AuditRecordInput };

/**
 * SEC-1.2/§29 (Fase 5) — Trilha de auditoria.
 *
 * `record` nunca lança (BKD-04): falha de auditoria não pode derrubar o fluxo
 * principal. IP/User-Agent/requestId vêm do request context (§29.3/§30);
 * userId pode ser sobrescrito explicitamente quando o evento ocorre antes do
 * guard popular o contexto (ex.: login).
 *
 * GENESIS (#10): a escrita é delegada ao AuditWormService, que encadeia cada
 * evento com hash (2.3.2), espelha em NDJSON append-only (2.3.1) e alimenta
 * o job diário de integridade (2.3.3).
 */
@Injectable()
export class AuditService {
  private readonly logger = new RequestContextLogger(AuditService.name);

  constructor(
    private prisma: PrismaService,
    private worm: AuditWormService,
  ) {}

  async record(
    eventType: AuditEventType,
    fields?: AuditRecordInput,
  ): Promise<void> {
    try {
      const ctx = getRequestContext();
      await this.worm.record(eventType, {
        userId: fields?.userId ?? ctx?.userId ?? null,
        sessionId: fields?.sessionId ?? null,
        resource: fields?.resource ?? null,
        result: fields?.result ?? null,
        metadata: fields?.metadata ?? null,
        ipAddress: ctx?.ip ?? null,
        userAgent: ctx?.userAgent ?? null,
        requestId: ctx?.requestId ?? null,
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