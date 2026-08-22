import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditWormService } from "./audit-worm.service";
import { AuditService } from "./audit.service";

describe("AuditService", () => {
  let prisma: {
    auditLog: {
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };
  let worm: {
    record: jest.Mock;
  };
  let service: AuditService;

  beforeEach(() => {
    prisma = {
      auditLog: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };
    worm = {
      record: jest.fn().mockResolvedValue(undefined),
    };
    service = new AuditService(
      prisma as unknown as PrismaService,
      worm as unknown as AuditWormService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("record", () => {
    it("delega ao AuditWormService com contexto e campos informados (§29.3)", async () => {
      await service.record("LOGIN_FAILURE", {
        userId: "u1",
        result: "invalid_credentials",
        resource: "user@x.com",
        metadata: { attempt: 1 },
      });

      expect(worm.record).toHaveBeenCalledWith(
        "LOGIN_FAILURE",
        expect.objectContaining({
          userId: "u1",
          result: "invalid_credentials",
          resource: "user@x.com",
          metadata: { attempt: 1 },
        }),
      );
    });

    it("preenche userId do request context quando não informado (§29.3)", async () => {
      // Sem request context ativo, userId segue nulo.
      await service.record("SHARE_CREATED", {});

      expect(worm.record).toHaveBeenCalledWith(
        "SHARE_CREATED",
        expect.objectContaining({ userId: null }),
      );
    });

    it("nunca lança quando a escrita falha (BKD-04)", async () => {
      worm.record.mockRejectedValue(new Error("db down"));

      await expect(
        service.record("MFA_FAILED", { userId: "u1" }),
      ).resolves.toBeUndefined();
    });
  });

  describe("findAll", () => {
    it("filtra por evento, usuário e período, com paginação", async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.findAll({
        eventType: "LOGIN_SUCCESS",
        userId: "u1",
        from: "2026-01-01",
        to: "2026-01-31",
        page: 2,
        limit: 10,
      });

      const where = prisma.auditLog.findMany.mock.calls[0][0].where;
      expect(where.eventType).toBe("LOGIN_SUCCESS");
      expect(where.userId).toBe("u1");
      expect(where.createdAt.gte).toEqual(new Date("2026-01-01"));
      expect(where.createdAt.lte).toEqual(new Date("2026-01-31"));
      expect(prisma.auditLog.findMany.mock.calls[0][0].skip).toBe(10);
    });

    it("lança BadRequest para datas inválidas", async () => {
      await expect(
        service.findAll({ from: "not-a-date" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
