import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import argon from "argon2";
import { LoginService } from "./login.service";

jest.mock("argon2", () => ({
  verify: jest.fn(),
  hash: jest.fn(),
}));
const verifyMock = argon.verify as jest.Mock;

describe("LoginService", () => {
  let prisma: {
    user: { findFirst: jest.Mock };
  };
  let tokenService: {
    createLoginToken: jest.Mock;
    createRefreshToken: jest.Mock;
    createSession: jest.Mock;
  };
  let i18n: { t: jest.Mock };
  let service: LoginService;

  const makeUser = (overrides: Record<string, unknown> = {}) => ({
    id: "u1",
    email: "user@example.com",
    password: "$argon2id$m=65536,t=3,p=4$hash", // valor fictício, verificado por mock
    username: "user",
    isActivated: true,
    totpVerified: false,
    role: "operador",
    isAdmin: false,
    ...overrides,
  });

  beforeEach(() => {
    prisma = { user: { findFirst: jest.fn() } };
    tokenService = {
      createLoginToken: jest.fn(),
      createRefreshToken: jest.fn(),
      createSession: jest.fn(() => ({ accessToken: "access-token" })),
    };
    i18n = { t: jest.fn((key: string) => `t:${key}`) };
    service = new LoginService(
      prisma as never,
      tokenService as never,
      i18n as never,
    );

    verifyMock.mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("signIn", () => {
    it("emite access+refresh para login com senha válida", async () => {
      const user = makeUser();
      prisma.user.findFirst.mockResolvedValue(user);
      tokenService.createRefreshToken.mockResolvedValue({
        id: "rt1",
        token: "refresh-token",
      });

      const result = await service.signIn(
        { email: "user@example.com", password: "secret" } as never,
        "1.2.3.4",
      );

      expect(result).toEqual({
        accessToken: "access-token",
        refreshToken: "refresh-token",
      });
      expect(tokenService.createSession).toHaveBeenCalledWith("u1", "rt1");
    });

    it("retorna loginToken quando o usuário tem TOTP habilitado", async () => {
      const user = makeUser({ totpVerified: true });
      prisma.user.findFirst.mockResolvedValue(user);
      tokenService.createLoginToken.mockResolvedValue("login-token-1");

      const result = await service.signIn(
        { username: "user", password: "secret" } as never,
        "1.2.3.4",
      );

      expect(result).toEqual({ loginToken: "login-token-1" });
      expect(tokenService.createRefreshToken).not.toHaveBeenCalled();
    });

    it("admin sem TOTP verificado recebe loginToken com requiresTotpSetup (SEC-1.2/14.6)", async () => {
      const user = makeUser({ isAdmin: true, role: "admin" });
      prisma.user.findFirst.mockResolvedValue(user);
      tokenService.createLoginToken.mockResolvedValue("login-token-admin");

      const result = await service.signIn(
        { email: "user@example.com", password: "secret" } as never,
        "1.2.3.4",
      );

      expect(result).toEqual({
        loginToken: "login-token-admin",
        requiresTotpSetup: true,
      });
      expect(tokenService.createRefreshToken).not.toHaveBeenCalled();
      expect(tokenService.createSession).not.toHaveBeenCalled();
    });

    it("lança UnauthorizedException para credenciais inválidas", async () => {
      prisma.user.findFirst.mockResolvedValue(makeUser());
      verifyMock.mockResolvedValue(false);

      await expect(
        service.signIn({ email: "user@example.com", password: "wrong" } as never, "ip"),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("lança UnauthorizedException para usuário não ativado", async () => {
      prisma.user.findFirst.mockResolvedValue(makeUser({ isActivated: false }));

      await expect(
        service.signIn({ email: "user@example.com", password: "secret" } as never, "ip"),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("lança BadRequestException quando não há email nem username", async () => {
      await expect(
        service.signIn({ password: "secret" } as never, "ip"),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("verifyPassword", () => {
    it("retorna false quando o usuário não tem hash de senha", async () => {
      const user = makeUser({ password: null });
      await expect(
        service.verifyPassword(user as never, "x"),
      ).resolves.toBe(false);
    });
  });
});
