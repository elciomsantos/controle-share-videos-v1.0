import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { Prisma } from "../../prisma/generated/prisma/client";
import { DATA_DIRECTORY } from "../constants";
import { MetricsService } from "../metrics/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  AuditEventType,
  AuditRecordInput,
} from "./audit-events";

/**
 * GENESIS (issue #10) — WORM (Write Once, Read Many) da trilha de auditoria.
 *
 * 2.3.1 — espelho append-only: cada evento é anexado em NDJSON diário sob
 *         `DATA_DIRECTORY/audit-worm/` (nunca reescrito; sem DELETE/UPDATE
 *         via app). Espaço para upload p/ Object Lock fica no env
 *         `AUDIT_WORM_MIRROR_DIR` (basta montar o bucket lá).
 * 2.3.2 — hash chain: `currentHash = SHA256(previousHash + canonical)`,
 *         com serialização determinística apenas dos campos persistidos
 *         (verificação reconstrói exatamente o mesmo payload).
 * 2.3.3 — job diário (`verifyIntegrity`) que valida a chain inteira e
 *         exporta o gauge `audit_log_hash_chain_broken` (alerta Prometheus).
 *
 * `record` nunca lança (BKD-04): falha de auditoria não derruba o fluxo
 * principal. Linhas anteriores à migration 20260822000000 (sem hash) ficam
 * fora da chain e são reportadas como `legacyUnchained`.
 */
@Injectable()
export class AuditWormService implements OnModuleInit {
  static readonly GENESIS_HASH = "0".repeat(64);
  static readonly INTEGRITY_EVENT = "AUDIT_INTEGRITY_CHECK";

  private readonly logger = new Logger(AuditWormService.name);
  private readonly verifyBatchSize = 500;
  private mirrorDirectory: string | null;

  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
  ) {
    const configured =
      process.env.AUDIT_WORM_MIRROR_DIR ||
      path.resolve(DATA_DIRECTORY, "audit-worm");
    this.mirrorDirectory =
      process.env.AUDIT_WORM_MIRROR === "off" ? null : configured;
  }

  onModuleInit(): void {
    this.metrics.setAuditChainBroken(false);
    if (this.mirrorDirectory) {
      try {
        fs.mkdirSync(this.mirrorDirectory, { recursive: true });
      } catch (err: unknown) {
        this.logger.error(
          `audit-worm mirror directory unavailable (${String(err)}); continuing without NDJSON mirror`,
        );
      }
    }
  }

  /**
   * Grava um evento encadeado. Nunca lança.
   */
  async record(
    eventType: AuditEventType | string,
    fields?: AuditRecordInput,
  ): Promise<void> {
    try {
      await this.recordChained(eventType, fields ?? {});
    } catch (err: unknown) {
      this.logger.error(
        `Failed to record chained audit event ${eventType}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async recordChained(
    eventType: string,
    fields: AuditRecordInput,
  ): Promise<void> {
    // Head lido do banco a cada evento: à prova de restarts e de múltiplos
    // processos; o índice UNIQUE(sequenceNumber) é a última linha de defesa.
    for (let attempt = 0; attempt < 2; attempt++) {
      const head = await this.prisma.auditLog.findFirst({
        where: { sequenceNumber: { not: null } },
        orderBy: { sequenceNumber: "desc" },
        select: { sequenceNumber: true, currentHash: true },
      });
      const sequenceNumber = (head?.sequenceNumber ?? 0) + 1;
      const previousHash = head?.currentHash ?? AuditWormService.GENESIS_HASH;
      const createdAt = new Date();
      const metadata = fields.metadata
        ? JSON.stringify(fields.metadata)
        : null;

      const currentHash = this.computeHash(previousHash, {
        sequenceNumber,
        eventType,
        userId: fields.userId ?? null,
        sessionId: fields.sessionId ?? null,
        resource: fields.resource ?? null,
        result: fields.result ?? null,
        metadata,
        ipAddress: fields.ipAddress ?? null,
        userAgent: fields.userAgent ?? null,
        requestId: fields.requestId ?? null,
        createdAt: createdAt.toISOString(),
      });

      try {
        const created = await this.prisma.auditLog.create({
          data: {
            eventType,
            userId: fields.userId ?? null,
            sessionId: fields.sessionId ?? null,
            resource: fields.resource ?? null,
            result: fields.result ?? null,
            metadata,
            ipAddress: fields.ipAddress ?? null,
            userAgent: fields.userAgent ?? null,
            requestId: fields.requestId ?? null,
            createdAt,
            sequenceNumber,
            previousHash,
            currentHash,
          },
        });
        this.appendMirror(created as unknown as ChainedRow);
        return;
      } catch (err: unknown) {
        const conflict =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002";
        if (!conflict || attempt === 1) throw err;
        // Corrida com outro writer: relê head e tenta uma vez mais.
      }
    }
  }

  /**
   * Serialização canônica (determinística) usada tanto na escrita quanto na
   * verificação — inclui somente campos persistidos no banco.
   */
  private canonical(payload: Record<string, unknown>): string {
    return JSON.stringify(payload, Object.keys(payload).sort());
  }

  private computeHash(
    previousHash: string,
    payload: Record<string, unknown>,
  ): string {
    return createHash("sha256")
      .update(previousHash + this.canonical(payload))
      .digest("hex");
  }

  /**
   * 2.3.1 — espelho append-only (NDJSON por dia). Fire-and-forget: nunca
   * bloqueia nem derruba o fluxo principal.
   */
  private appendMirror(row: ChainedRow): void {
    if (!this.mirrorDirectory) return;
    try {
      const day = row.createdAt.toISOString().slice(0, 10);
      const file = path.join(this.mirrorDirectory, `audit-${day}.ndjson`);
      fs.appendFileSync(file, `${JSON.stringify(row)}\n`, { flag: "a" });
    } catch (err: unknown) {
      this.logger.warn(
        `audit-worm NDJSON mirror write failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * 2.3.3 — valida a chain inteira (batches ordenados por sequenceNumber).
   * Agenda diária e exporta gauge p/ alerta Prometheus.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: "audit-worm-integrity" })
  async verifyIntegrity(): Promise<IntegrityResult> {
    let expectedPreviousHash: string | null = null;
    let brokenAt: number | undefined;
    let expectedSequence: number | undefined;
    let checked = 0;
    let legacyUnchained = 0;
    let cursor: number | undefined;

    try {
      while (brokenAt === undefined) {
        const batch = await this.prisma.auditLog.findMany({
          where: { sequenceNumber: { not: null } },
          orderBy: { sequenceNumber: "asc" },
          take: this.verifyBatchSize,
          ...(cursor !== undefined
            ? { skip: 1, cursor: { sequenceNumber: cursor } }
            : {}),
        });
        if (batch.length === 0) break;

        for (const row of batch) {
          cursor = row.sequenceNumber ?? undefined;
          if (
            expectedSequence !== undefined &&
            row.sequenceNumber !== expectedSequence
          ) {
            brokenAt = row.sequenceNumber ?? undefined;
            break;
          }
          const recomputed = this.computeHash(row.previousHash ?? "", {
            sequenceNumber: row.sequenceNumber,
            eventType: row.eventType,
            userId: row.userId,
            sessionId: row.sessionId,
            resource: row.resource,
            result: row.result,
            metadata: row.metadata,
            ipAddress: row.ipAddress,
            userAgent: row.userAgent,
            requestId: row.requestId,
            createdAt: row.createdAt.toISOString(),
          });
          if (
            recomputed !== row.currentHash ||
            (expectedPreviousHash !== null &&
              row.previousHash !== expectedPreviousHash)
          ) {
            brokenAt = row.sequenceNumber ?? undefined;
            break;
          }
          expectedPreviousHash = row.currentHash;
          expectedSequence = (row.sequenceNumber ?? 0) + 1;
          checked++;
        }
      }

      legacyUnchained = await this.prisma.auditLog.count({
        where: { sequenceNumber: null },
      });
    } catch (err: unknown) {
      this.logger.error(
        `Audit chain verification could not run: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      // Fail-closed: não conseguimos provar integridade → sinaliza quebrada.
      this.metrics.setAuditChainBroken(true);
      return {
        valid: false,
        checked,
        legacyUnchained,
        details: "verification error (fail-closed)",
      };
    }

    const valid = brokenAt === undefined;
    this.metrics.setAuditChainBroken(!valid);

    const details = valid
      ? `Chain verified: ${checked} records${
          legacyUnchained > 0 ? ` (+${legacyUnchained} legacy unchained)` : ""
        }`
      : `Hash chain broken at sequence ${brokenAt}`;

    if (valid) {
      this.logger.log(details);
    } else {
      this.logger.error(`${details} — possible tampering; treat as incident`);
    }

    // O próprio resultado vira evento encadeado (evidência da verificação).
    await this.record(AuditWormService.INTEGRITY_EVENT, {
      resource: "audit-log-chain",
      result: valid ? "success" : "failure",
      metadata: {
        brokenAt: brokenAt ?? null,
        checked,
        legacyUnchained,
      },
    });

    return { valid, brokenAt, checked, legacyUnchained, details };
  }

  /**
   * Cabeçalho atual da chain (p/ dashboards e verificação pontual).
   */
  async getChainHead(): Promise<{
    sequenceNumber: number;
    currentHash: string;
  } | null> {
    const head = await this.prisma.auditLog.findFirst({
      where: { sequenceNumber: { not: null } },
      orderBy: { sequenceNumber: "desc" },
      select: { sequenceNumber: true, currentHash: true },
    });
    return head
      ? { sequenceNumber: head.sequenceNumber ?? 0, currentHash: head.currentHash ?? "" }
      : null;
  }
}

interface ChainedRow {
  createdAt: Date;
  [key: string]: unknown;
}

export interface IntegrityResult {
  valid: boolean;
  brokenAt?: number;
  checked: number;
  legacyUnchained: number;
  details: string;
}
