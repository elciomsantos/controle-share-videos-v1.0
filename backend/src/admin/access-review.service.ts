import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { createHmac, timingSafeEqual } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { JwtSecretService } from "../config/jwt-secret.service";
import { EmailService } from "../email/email.service";
import { AuditService } from "../audit/audit.service";
import { MetricsService } from "../metrics/metrics.service";

/**
 * Access review (issue #11) — revisão periódica de acessos.
 *
 * 2.4.1 — `list()`: usuários + role + último login + ownership de shares
 *         + MFA + status da revisão e nível de risco (fonte do painel).
 * 2.4.2 — cron trimestral: resumo por e-mail para os admins + entrada no
 *         audit log (`ACCESS_REVIEW_QUARTERLY_REMINDER`).
 * 2.4.3 — `certify()`: atestação assinada (HMAC-SHA256 com a chave do
 *         servidor) persistida em `AccessReview` + audit log
 *         (`ACCESS_REVIEW_CERTIFIED`).
 */

const REVIEW_PERIOD_DAYS = 90;
const RISK_LOGIN_STALE_DAYS = 90;

export interface AccessReviewRecord {
  id: string;
  email: string;
  username: string;
  role: "admin" | "operador";
  isAdmin: boolean;
  isActivated: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  sharesOwned: number;
  sharesAccessible: number;
  mfaEnabled: boolean;
  lastReviewedAt: string | null;
  reviewedBy: string | null;
  status: "current" | "overdue" | "never_reviewed";
  riskLevel: "low" | "medium" | "high";
}

export interface ReviewCertifyDto {
  userId: string;
  certified: boolean;
  notes: string;
}

@Injectable()
export class AccessReviewService {
  private readonly logger = new Logger(AccessReviewService.name);

  constructor(
    private prisma: PrismaService,
    private jwtSecretService: JwtSecretService,
    private emailService: EmailService,
    private auditService: AuditService,
    private metrics: MetricsService,
  ) {}

  async list(): Promise<AccessReviewRecord[]> {
    const [users, lastLogins] = await Promise.all([
      this.prisma.user.findMany({
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          isAdmin: true,
          isActivated: true,
          createdAt: true,
          totpEnabled: true,
          lastReviewedAt: true,
          reviewedBy: true,
          _count: { select: { shares: true } },
        },
        orderBy: { email: "asc" },
      }),
      // Último login de cada usuário a partir da trilha de auditoria.
      this.prisma.auditLog.groupBy({
        by: ["userId"],
        where: { eventType: "LOGIN_SUCCESS", userId: { not: null } },
        _max: { createdAt: true },
      }),
    ]);

    const loginByUser = new Map(
      lastLogins.map((l) => [l.userId ?? "", l._max.createdAt ?? null]),
    );

    // Shares acessíveis além dos próprios: recipient pelo e-mail do usuário.
    const emails = users.map((u) => u.email.toLowerCase());
    const recipients = await this.prisma.shareRecipient.findMany({
      where: { email: { in: emails.length ? emails : [""] } },
      select: { email: true },
    });
    const accessibleByEmail = new Map<string, number>();
    for (const r of recipients) {
      accessibleByEmail.set(
        r.email.toLowerCase(),
        (accessibleByEmail.get(r.email.toLowerCase()) ?? 0) + 1,
      );
    }

    return users.map((u) => {
      const lastLoginAt = loginByUser.get(u.id) ?? null;
      const status = this.reviewStatus(u.lastReviewedAt);
      const riskLevel = this.riskLevel({
        isAdmin: u.isAdmin,
        mfaEnabled: u.totpEnabled,
        status,
        lastLoginAt,
      });

      return {
        id: u.id,
        email: u.email,
        username: u.username,
        role: u.isAdmin ? ("admin" as const) : ("operador" as const),
        isAdmin: u.isAdmin,
        isActivated: u.isActivated,
        lastLoginAt: lastLoginAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
        sharesOwned: u._count.shares,
        sharesAccessible:
          u._count.shares +
          (accessibleByEmail.get(u.email.toLowerCase()) ?? 0),
        mfaEnabled: u.totpEnabled,
        lastReviewedAt: u.lastReviewedAt?.toISOString() ?? null,
        reviewedBy: u.reviewedBy,
        status,
        riskLevel,
      };
    });
  }

  private reviewStatus(lastReviewedAt: Date | null): AccessReviewRecord["status"] {
    if (!lastReviewedAt) return "never_reviewed";
    const ageDays =
      (Date.now() - lastReviewedAt.getTime()) / (1000 * 60 * 60 * 24);
    return ageDays <= REVIEW_PERIOD_DAYS ? "current" : "overdue";
  }

  private riskLevel(input: {
    isAdmin: boolean;
    mfaEnabled: boolean;
    status: AccessReviewRecord["status"];
    lastLoginAt: Date | null;
  }): AccessReviewRecord["riskLevel"] {
    if (input.isAdmin && (!input.mfaEnabled || input.status !== "current")) {
      return "high";
    }
    if (
      !input.mfaEnabled ||
      input.status !== "current" ||
      !input.lastLoginAt ||
      (Date.now() - input.lastLoginAt.getTime()) / (1000 * 60 * 60 * 24) >
        RISK_LOGIN_STALE_DAYS
    ) {
      return "medium";
    }
    return "low";
  }

  /**
   * Assina o payload da atestação (HMAC-SHA256). Verificável offline com a
   * mesma chave do servidor; qualquer alteração no registro invalida.
   */
  private signAttestation(payload: Record<string, unknown>): string {
    return createHmac("sha256", this.jwtSecretService.getCurrentSecret())
      .update(JSON.stringify(payload))
      .digest("hex");
  }

  verifyAttestation(review: {
    reviewedAt: Date;
    userId: string;
    reviewerId: string;
    certified: boolean;
    notes: string | null;
    signature: string;
  }): boolean {
    const expected = this.signAttestation({
      userId: review.userId,
      reviewerId: review.reviewerId,
      certified: review.certified,
      notes: review.notes,
      reviewedAt: review.reviewedAt.toISOString(),
    });
    try {
      return timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(review.signature, "hex"),
      );
    } catch {
      return false;
    }
  }

  async certify(
    dto: ReviewCertifyDto,
    reviewer: { id: string; email: string },
  ): Promise<{ success: true }> {
    if (!dto.userId) throw new BadRequestException("userId é obrigatório");
    if (typeof dto.certified !== "boolean") {
      throw new BadRequestException("certified deve ser boolean");
    }
    if (!dto.notes?.trim()) throw new BadRequestException("notes é obrigatório");

    const target = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, email: true },
    });
    if (!target) throw new NotFoundException("Usuário não encontrado");
    if (target.id === reviewer.id) {
      throw new BadRequestException("Auto-revisão não é permitida");
    }

    const reviewedAt = new Date();
    const notes = dto.notes.trim();

    const { signature } = await this.prisma.$transaction(async (tx) => {
      const signature = this.signAttestation({
        userId: target.id,
        reviewerId: reviewer.id,
        certified: dto.certified,
        notes,
        reviewedAt: reviewedAt.toISOString(),
      });

      await tx.user.update({
        where: { id: target.id },
        data: { lastReviewedAt: reviewedAt, reviewedBy: reviewer.email },
      });

      await tx.accessReview.create({
        data: {
          userId: target.id,
          reviewerId: reviewer.id,
          certified: dto.certified,
          notes,
          reviewedAt,
          signature,
        },
      });

      return { signature };
    });

    // Fora da transação: record nunca lança e já encadeia no WORM (#10).
    await this.auditService.record("ACCESS_REVIEW_CERTIFIED", {
      userId: target.id,
      resource: "user-access",
      result: dto.certified ? "certified" : "rejected",
      metadata: {
        reviewerId: reviewer.id,
        reviewerEmail: reviewer.email,
        signature,
        notes,
      },
    });

    return { success: true };
  }

  /**
   * 3.8.1 (#24): alimenta o gauge `access_review_overdue_users` — base real
   * do alerta `AccessReviewOverdue` no alerts.yml. Diário, antes do horário
   * útil.
   */
  @Cron("40 5 * * *", { name: "access-review-overdue-gauge" })
  async refreshOverdueGauge(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - REVIEW_PERIOD_DAYS * 86_400_000);
      const overdue = await this.prisma.user.count({
        where: {
          isActivated: true,
          OR: [{ lastReviewedAt: null }, { lastReviewedAt: { lt: cutoff } }],
        },
      });
      this.metrics.setUserAccessReviewOverdue(overdue);
      if (overdue > 0) {
        this.logger.warn(
          `${overdue} user(s) with overdue/never-done access review`,
        );
      }
    } catch (err: unknown) {
      this.logger.error(
        `Failed to refresh access review gauge: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * 2.4.2 — disparo trimestral (Jan/Abr/Jul/Out, 09:00 UTC do dia 1º):
   * resumo por e-mail para cada admin + evidência no audit log.
   */
  @Cron("0 9 1 */3 *", { name: "access-review-quarterly" })
  async sendQuarterlyReviewReminder(): Promise<void> {
    try {
      const records = await this.list();
      const summary = {
        total: records.length,
        overdue: records.filter((r) => r.status === "overdue").length,
        neverReviewed: records.filter((r) => r.status === "never_reviewed")
          .length,
      };

      const admins = await this.prisma.user.findMany({
        where: { isAdmin: true, isActivated: true },
        select: { email: true },
      });

      let sent = 0;
      for (const admin of admins) {
        try {
          await this.emailService.sendAccessReviewReminder(admin.email, summary);
          sent++;
        } catch (err: unknown) {
          this.logger.error(
            `Falha ao enviar lembrete de access review para ${admin.email}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }

      await this.auditService.record("ACCESS_REVIEW_QUARTERLY_REMINDER", {
        resource: "user-access",
        result: sent > 0 ? "success" : "failure",
        metadata: { ...summary, recipients: admins.length, sent },
      });

      this.logger.log(
        `Quarterly access review reminder sent to ${sent}/${admins.length} admins`,
      );
    } catch (err: unknown) {
      this.logger.error(
        `Quarterly access review reminder failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
