import { BadRequestException, NotFoundException } from "@nestjs/common";
import { createHmac } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { JwtSecretService } from "../config/jwt-secret.service";
import { EmailService } from "../email/email.service";
import { AuditService } from "../audit/audit.service";
import { AccessReviewService } from "./access-review.service";

const SECRET = "test-signing-secret";

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
const LAST_LOGIN = daysAgo(1);

describe("AccessReviewService", () => {
  let prisma: {
    user: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    auditLog: { groupBy: jest.Mock };
    shareRecipient: { findMany: jest.Mock };
    accessReview: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let jwtSecretService: { getCurrentSecret: jest.Mock };
  let emailService: { sendAccessReviewReminder: jest.Mock };
  let auditService: { record: jest.Mock };
  let service: AccessReviewService;

  const baseUser = {
    id: "u1",
    email: "admin@x.com",
    username: "admin",
    role: "admin",
    isAdmin: true,
    isActivated: true,
    createdAt: daysAgo(400),
    totpEnabled: true,
    lastReviewedAt: daysAgo(10),
    reviewedBy: "sec@x.com",
    _count: { shares: 3 },
  };

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([baseUser]),
        findUnique: jest
          .fn()
          .mockImplementation(({ where }: { where: { id: string } }) => {
            const users = [
              { id: "u2", email: "op@x.com" },
              { id: "r1", email: "sec@x.com" },
            ];
            return Promise.resolve(
              users.find((u) => u.id === where.id) ?? null,
            );
          }),
        update: jest.fn().mockResolvedValue({}),
      },
      auditLog: {
        groupBy: jest
          .fn()
          .mockResolvedValue([{ userId: "u1", _max: { createdAt: LAST_LOGIN } }]),
      },
      shareRecipient: { findMany: jest.fn().mockResolvedValue([]) },
      accessReview: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(),
    };
    jwtSecretService = { getCurrentSecret: jest.fn().mockReturnValue(SECRET) };
    emailService = {
      sendAccessReviewReminder: jest.fn().mockResolvedValue(undefined),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };

    service = new AccessReviewService(
      prisma as unknown as PrismaService,
      jwtSecretService as unknown as JwtSecretService,
      emailService as unknown as EmailService,
      auditService as unknown as AuditService,
    );
  });

  describe("list", () => {
    it("monta record com último login, shares e MFA", async () => {
      const records = await service.list();

      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        id: "u1",
        role: "admin",
        lastLoginAt: LAST_LOGIN.toISOString(),
        sharesOwned: 3,
        mfaEnabled: true,
        status: "current",
        riskLevel: "low",
      });
    });

    it("admin sem MFA é high risk", async () => {
      prisma.user.findMany.mockResolvedValue([
        { ...baseUser, totpEnabled: false },
      ]);

      const records = await service.list();
      expect(records[0].riskLevel).toBe("high");
    });

    it("review vencida (>90d) marca overdue e médio risco p/ operador", async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          ...baseUser,
          id: "u9",
          email: "op@x.com",
          username: "op",
          isAdmin: false,
          role: "operador",
          totpEnabled: true,
          lastReviewedAt: daysAgo(120),
        },
      ]);

      const records = await service.list();
      expect(records[0].status).toBe("overdue");
      expect(records[0].riskLevel).toBe("medium");
    });

    it("usuário nunca revisado é never_reviewed/high se admin", async () => {
      prisma.user.findMany.mockResolvedValue([
        { ...baseUser, lastReviewedAt: null, reviewedBy: null },
      ]);

      const records = await service.list();
      expect(records[0].status).toBe("never_reviewed");
      expect(records[0].lastLoginAt).toBeTruthy();
    });

    it("contabiliza shares acessíveis via recipient por e-mail", async () => {
      prisma.shareRecipient.findMany.mockResolvedValue([
        { email: "admin@x.com" },
        { email: "admin@x.com" },
      ]);

      const records = await service.list();
      expect(records[0].sharesAccessible).toBe(5);
    });
  });

  describe("certify", () => {
    const reviewer = { id: "r1", email: "sec@x.com" };

    beforeEach(() => {
      prisma.$transaction.mockImplementation(async (fn: unknown) =>
        (fn as (tx: unknown) => Promise<{ signature: string }>)({
          user: { update: prisma.user.update },
          accessReview: { create: prisma.accessReview.create },
        }),
      );
    });

    it("grava atestação assinada, atualiza usuário e audita (2.4.3)", async () => {
      await service.certify(
        { userId: "u2", certified: true, notes: "ok" },
        reviewer,
      );

      const created = prisma.accessReview.create.mock.calls[0][0].data;
      expect(created.userId).toBe("u2");
      expect(created.reviewerId).toBe("r1");
      expect(created.certified).toBe(true);
      expect(created.signature).toMatch(/^[a-f0-9]{64}$/);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u2" },
        data: expect.objectContaining({
          reviewedBy: "sec@x.com",
          lastReviewedAt: expect.any(Date),
        }),
      });

      expect(auditService.record).toHaveBeenCalledWith(
        "ACCESS_REVIEW_CERTIFIED",
        expect.objectContaining({
          userId: "u2",
          result: "certified",
          metadata: expect.objectContaining({ signature: created.signature }),
        }),
      );
    });

    it("rejeita auto-revisão", async () => {
      await expect(
        service.certify(
          { userId: "r1", certified: true, notes: "eu mesmo" },
          reviewer,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("valida notas obrigatórias", async () => {
      await expect(
        service.certify({ userId: "u2", certified: true, notes: "  " }, reviewer),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("404 para usuário inexistente", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.certify(
          { userId: "ghost", certified: true, notes: "ok" },
          reviewer,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("verifyAttestation", () => {
    it("confere HMAC do payload e detecta adulteração", async () => {
      const reviewedAt = new Date("2026-08-01T12:00:00Z");
      const payload = {
        userId: "u2",
        reviewerId: "r1",
        certified: true,
        notes: "ok",
        reviewedAt: reviewedAt.toISOString(),
      };
      const signature = createHmac("sha256", SECRET)
        .update(JSON.stringify(payload))
        .digest("hex");

      const valid = service.verifyAttestation({
        ...payload,
        reviewedAt,
        signature,
      });
      expect(valid).toBe(true);

      const tampered = service.verifyAttestation({
        userId: payload.userId,
        reviewerId: payload.reviewerId,
        certified: payload.certified,
        notes: "alterado depois",
        reviewedAt,
        signature,
      });
      expect(tampered).toBe(false);
    });
  });

  describe("cron trimestral (2.4.2)", () => {
    it("envia resumo a cada admin e registra evidência no audit log", async () => {
      prisma.user.findMany
        .mockResolvedValueOnce([baseUser])
        .mockResolvedValueOnce([
          { email: "a@x.com" },
          { email: "b@x.com" },
        ]);

      await service.sendQuarterlyReviewReminder();

      expect(emailService.sendAccessReviewReminder).toHaveBeenCalledTimes(2);
      expect(emailService.sendAccessReviewReminder).toHaveBeenCalledWith(
        "a@x.com",
        expect.objectContaining({
          total: 1,
          overdue: expect.any(Number),
          neverReviewed: expect.any(Number),
        }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        "ACCESS_REVIEW_QUARTERLY_REMINDER",
        expect.objectContaining({
          result: "success",
          metadata: expect.objectContaining({ sent: 2, recipients: 2 }),
        }),
      );
    });

    it("falha de SMTP de um admin não derruba os demais", async () => {
      prisma.user.findMany
        .mockResolvedValueOnce([baseUser])
        .mockResolvedValueOnce([{ email: "a@x.com" }, { email: "b@x.com" }]);
      emailService.sendAccessReviewReminder
        .mockRejectedValueOnce(new Error("smtp down"))
        .mockResolvedValueOnce(undefined);

      await expect(service.sendQuarterlyReviewReminder()).resolves.toBeUndefined();
      expect(auditService.record).toHaveBeenCalledWith(
        "ACCESS_REVIEW_QUARTERLY_REMINDER",
        expect.objectContaining({
          result: "success",
          metadata: expect.objectContaining({ recipients: 2, sent: 1 }),
        }),
      );
    });
  });
});
