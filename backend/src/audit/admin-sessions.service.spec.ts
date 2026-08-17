import { NotFoundException } from "@nestjs/common";
import { I18nService } from "nestjs-i18n";
import { PrismaService } from "../prisma/prisma.service";
import { ConfigService } from "../config/config.service";
import { AuditService } from "./audit.service";
import { AdminSessionsService } from "./admin-sessions.service";

describe("AdminSessionsService", () => {
  const now = Date.now();

  const makeSession = (overrides: Record<string, unknown> = {}) => ({
    id: "s1",
    userId: "u1",
    createdAt: new Date(now - 3_600_000),
    lastActivityAt: new Date(now - 60_000),
    expiresAt: new Date(now + 3_600_000),
    revokedAt: null,
    ipAddress: "200.1.2.3",
    userAgent: "curl/8",
    tokenHash: "should-never-leak",
    refreshTokenId: "rt1",
    user: {
      id: "u1",
      email: "user@x.com",
      username: "userx",
      isAdmin: false,
      role: "operador",
    },
    ...overrides,
  });

  let prisma: {
    session: { findUnique: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    refreshToken: { deleteMany: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  let config: { getTimespan: jest.Mock };
  let audit: { record: jest.Mock };
  let service: AdminSessionsService;

  beforeEach(() => {
    prisma = {
      session: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      refreshToken: { deleteMany: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    config = { getTimespan: jest.fn(() => ({ value: 30, unit: "minutes" })) };
    audit = { record: jest.fn() };
    service = new AdminSessionsService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      { t: (k: string) => `t:${k}` } as unknown as I18nService,
      audit as unknown as AuditService,
    );
  });

  describe("findAll", () => {
    it("nunca expõe o token e calcula o estado (§34.1)", async () => {
      prisma.session.findMany.mockResolvedValue([
        makeSession(),
        makeSession({ id: "s2", revokedAt: new Date() }),
        makeSession({ id: "s3", expiresAt: new Date(now - 1000) }),
        makeSession({ id: "s4", lastActivityAt: new Date(now - 3_600_000) }),
      ]);
      prisma.session.count.mockResolvedValue(4);

      const result = await service.findAll({});

      const json = JSON.stringify(result.data);
      expect(json).not.toContain("should-never-leak");
      expect(json).not.toContain("tokenHash");

      const byId = Object.fromEntries(
        result.data.map((s: { id: string; state: string }) => [s.id, s]),
      );
      expect(byId.s1.state).toBe("active");
      expect(byId.s2.state).toBe("revoked");
      expect(byId.s3.state).toBe("expired");
      expect(byId.s4.state).toBe("idle");
      expect(result.total).toBe(4);
    });
  });

  describe("revoke", () => {
    it("exclui o refresh token (cascata) e audita ADMIN_SESSION_REVOKED", async () => {
      prisma.session.findUnique.mockResolvedValue(
        makeSession({ refreshToken: { id: "rt1" } }),
      );
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

      await service.revoke("s1");

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { id: "rt1" },
      });
      expect(audit.record).toHaveBeenCalledWith(
        "ADMIN_SESSION_REVOKED",
        expect.objectContaining({ sessionId: "s1", userId: "u1" }),
      );
    });

    it("lança NotFound para sessão inexistente", async () => {
      prisma.session.findUnique.mockResolvedValue(null);

      await expect(service.revoke("nope")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("revokeAllByUser", () => {
    it("revoga todas as sessões do usuário e audita", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "u1",
        email: "user@x.com",
        username: "userx",
      });
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 });

      const result = await service.revokeAllByUser("u1");

      expect(result.revokedCount).toBe(3);
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: "u1" },
      });
      expect(audit.record).toHaveBeenCalledWith(
        "ADMIN_SESSION_REVOKED",
        expect.objectContaining({
          userId: "u1",
          metadata: expect.objectContaining({ revokedCount: 3 }),
        }),
      );
    });

    it("lança NotFound para usuário inexistente", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.revokeAllByUser("nope")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});