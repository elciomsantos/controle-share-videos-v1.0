import { UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { ConfigService } from "../config/config.service";
import { I18nService } from "nestjs-i18n";
import { JwtService } from "@nestjs/jwt";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";

describe("AuthService", () => {
  let prisma: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    refreshToken: {
      findUnique: jest.Mock;
      deleteMany: jest.Mock;
      create: jest.Mock;
    };
    loginToken: { create: jest.Mock; updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let jwtService: { sign: jest.Mock; decode: jest.Mock };
  let config: {
    getBoolean: jest.Mock;
    getString: jest.Mock;
    getNumber: jest.Mock;
    getTimespan: jest.Mock;
  };
  let emailService: { sendVerificationEmail: jest.Mock };
  let i18n: { t: jest.Mock; translate: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
      loginToken: { create: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    jwtService = { sign: jest.fn(() => "access-token"), decode: jest.fn() };
    config = {
      getBoolean: jest.fn(),
      getString: jest.fn(),
      getNumber: jest.fn(),
      getTimespan: jest.fn(() => ({ value: 30, unit: "days" })),
    };
    emailService = { sendVerificationEmail: jest.fn() };
    i18n = {
      t: jest.fn((key: string) => `t:${key}`),
      translate: jest.fn(() => "pt-br"),
    };
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      config as unknown as ConfigService,
      emailService as unknown as EmailService,
      i18n as unknown as I18nService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("resendVerification (SEC-06)", () => {
    it("retorna silenciosamente para e-mail não cadastrado", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.resendVerification("ghost@example.com")).resolves.toBeUndefined();
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it("retorna silenciosamente para e-mail já ativado (sem oráculo)", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "u1",
        isActivated: true,
      });

      await expect(service.resendVerification("active@example.com")).resolves.toBeUndefined();
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it("reenvia token apenas para usuário pendente", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "u1",
        isActivated: false,
      });
      prisma.user.update.mockResolvedValue({});

      await expect(service.resendVerification("pending@example.com")).resolves.toBeUndefined();
      expect(prisma.user.update).toHaveBeenCalled();
      expect(emailService.sendVerificationEmail).toHaveBeenCalled();
    });
  });

  describe("refreshAccessToken (SEC-07)", () => {
    const meta = {
      id: "rt1",
      token: "old-token",
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: "u1", email: "user@example.com" },
    };

    it("rotaciona o token dentro de uma transação", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(meta);
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
      prisma.refreshToken.create.mockResolvedValue({
        id: "rt2",
        token: "new-token",
      });

      const result = await service.refreshAccessToken("old-token");

      expect(result.accessToken).toBe("access-token");
      expect(result.refreshToken).toBe("new-token");
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it("detecta reuso, revoga a família e lança UnauthorizedException", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(meta);
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.refreshAccessToken("old-token")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      // deleteMany com count=0 dispara a revogação por userId
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: "u1" },
      });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it("lança UnauthorizedException para token inexistente ou expirado", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refreshAccessToken("missing")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe("createLoginToken (TODO loginTokens)", () => {
    it("invalida loginTokens antigos não usados antes de criar um novo", async () => {
      prisma.loginToken.updateMany.mockResolvedValue({ count: 2 });
      prisma.loginToken.create.mockResolvedValue({
        token: "new-login-token",
      });

      const result = await service.createLoginToken("u1");

      expect(prisma.loginToken.updateMany).toHaveBeenCalledWith({
        where: { userId: "u1", used: false },
        data: { used: true },
      });
      expect(prisma.loginToken.create).toHaveBeenCalled();
      expect(result).toBe("new-login-token");
    });
  });
});
