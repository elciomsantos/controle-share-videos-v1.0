import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "./audit.service";

describe("AuditService", () => {
  let prisma: {
    auditLog: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };
  let service: AuditService;

  beforeEach(() => {
    prisma = {
      auditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };
    service = new AuditService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("record", () => {
    it("grava evento com contexto e campos informados (§29.3)", async () => {
      await service.record("LOGIN_FAILURE", {
        userId: "u1",
        result: "invalid_credentials",
        resource: "user@x.com",
      });

      const data = prisma.auditLog.create.mock.calls[0][0].data;
      expect(data.eventType).toBe("LOGIN_FAILURE");
      expect(data.userId).toBe("u1");
      expect(data.result).toBe("invalid_credentials");
      expect(data.resource).toBe("user@x.com");
    });

    it("serializa metadata como JSON", async () => {
      await service.record("ROLE_CHANGED", {
        userId: "u1",
        metadata: { from: "operador", to: "admin" },
      });

      const data = prisma.auditLog.create.mock.calls[0][0].data;
      expect(JSON.parse(data.metadata)).toEqual({
        from: "operador",
        to: "admin",
      });
    });

    it("nunca lança quando a escrita falha (BKD-04)", async () => {
      prisma.auditLog.create.mockRejectedValue(new Error("db down"));

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