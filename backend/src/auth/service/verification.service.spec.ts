import { BadRequestException } from "@nestjs/common";
import argon from "argon2";
import { VerificationService } from "./verification.service";

jest.mock("argon2", () => ({
  hash: jest.fn(),
}));
const hashMock = argon.hash as jest.Mock;

describe("VerificationService", () => {
  let prisma: {
    user: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    resetPasswordToken: { delete: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };
  let emailService: {
    sendVerificationEmail: jest.Mock;
    sendResetPasswordEmail: jest.Mock;
  };
  let i18n: { t: jest.Mock };
  let service: VerificationService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      resetPasswordToken: { delete: jest.fn(), create: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    emailService = {
      sendVerificationEmail: jest.fn(),
      sendResetPasswordEmail: jest.fn(),
    };
    i18n = { t: jest.fn((key: string) => `t:${key}`) };
    hashMock.mockResolvedValue("hashed");
    service = new VerificationService(
      prisma as never,
      emailService as never,
      i18n as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("verifyAccount", () => {
    it("ativa a conta e limpa o token", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "u1",
        activationTokenExpiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.update.mockResolvedValue({});

      await service.verifyAccount("tok");

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: {
          isActivated: true,
          activationToken: null,
          activationTokenExpiresAt: null,
        },
      });
    });

    it("lança BadRequestException para token inválido", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.verifyAccount("bad")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("lança BadRequestException para token expirado", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "u1",
        activationTokenExpiresAt: new Date(Date.now() - 60_000),
      });
      await expect(service.verifyAccount("expired")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe("resendVerification (SEC-06)", () => {
    it("retorna silenciosamente para e-mail não cadastrado", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.resendVerification("ghost@example.com"),
      ).resolves.toBeUndefined();
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it("retorna silenciosamente para e-mail já ativado (sem oráculo)", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "u1", isActivated: true });
      await expect(
        service.resendVerification("active@example.com"),
      ).resolves.toBeUndefined();
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it("reenvia token apenas para usuário pendente", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "u1",
        email: "pending@example.com",
        isActivated: false,
      });
      prisma.user.update.mockResolvedValue({});

      await expect(
        service.resendVerification("pending@example.com"),
      ).resolves.toBeUndefined();
      expect(prisma.user.update).toHaveBeenCalled();
      expect(emailService.sendVerificationEmail).toHaveBeenCalled();
    });
  });

  describe("requestResetPassword", () => {
    it("cria token e envia e-mail", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "u1",
        email: "a@b.com",
        resetPasswordToken: null,
      });
      prisma.resetPasswordToken.create.mockResolvedValue({ token: "rst" });

      await service.requestResetPassword("a@b.com");

      expect(prisma.resetPasswordToken.create).toHaveBeenCalled();
      expect(emailService.sendResetPasswordEmail).toHaveBeenCalledWith(
        "a@b.com",
        "rst",
      );
    });

    it("não faz nada para e-mail inexistente", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.requestResetPassword("ghost@example.com"),
      ).resolves.toBeUndefined();
      expect(emailService.sendResetPasswordEmail).not.toHaveBeenCalled();
    });
  });

  describe("resetPassword", () => {
    it("redefine a senha para token válido", async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: "u1",
        resetPasswordToken: {
          token: "rst",
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      prisma.user.update.mockResolvedValue({});

      await service.resetPassword("rst", "NovaSenha123");

      expect(hashMock).toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: { password: "hashed" },
      });
    });

    it("lança BadRequestException para token expirado e o apaga", async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: "u1",
        resetPasswordToken: {
          token: "rst",
          expiresAt: new Date(Date.now() - 60_000),
        },
      });

      await expect(service.resetPassword("rst", "x")).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.resetPasswordToken.delete).toHaveBeenCalledWith({
        where: { token: "rst" },
      });
    });
  });
});
