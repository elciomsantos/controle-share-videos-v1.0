import { AuthService } from "./auth.service";
import { ConfigService } from "../config/config.service";
import { I18nService } from "nestjs-i18n";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";

describe("AuthService (orquestrador)", () => {
  let prisma: { user: { count: jest.Mock }; $transaction: jest.Mock };
  let config: { getBoolean: jest.Mock; getTimespan: jest.Mock };
  let emailService: { sendVerificationEmail: jest.Mock };
  let i18n: { t: jest.Mock };
  let loginService: { signIn: jest.Mock; verifyPassword: jest.Mock };
  let tokenService: {
    signAccessToken: jest.Mock;
    createRefreshToken: jest.Mock;
    createLoginToken: jest.Mock;
    addTokensToResponse: jest.Mock;
    getUserIdFromRequest: jest.Mock;
  };
  let refreshService: {
    refreshAccessToken: jest.Mock;
    signOut: jest.Mock;
    logoutAllDevices: jest.Mock;
  };
  let verificationService: {
    verifyAccount: jest.Mock;
    resendVerification: jest.Mock;
    requestResetPassword: jest.Mock;
    resetPassword: jest.Mock;
  };
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      user: { count: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    config = {
      getBoolean: jest.fn(),
      getTimespan: jest.fn(() => ({ value: 30, unit: "days" })),
    };
    emailService = { sendVerificationEmail: jest.fn() };
    i18n = { t: jest.fn((key: string) => `t:${key}`) };
    loginService = {
      signIn: jest.fn(),
      verifyPassword: jest.fn(),
    };
    tokenService = {
      signAccessToken: jest.fn(() => "access-token"),
      createRefreshToken: jest.fn(),
      createLoginToken: jest.fn(),
      addTokensToResponse: jest.fn(),
      getUserIdFromRequest: jest.fn(),
    };
    refreshService = {
      refreshAccessToken: jest.fn(),
      signOut: jest.fn(),
      logoutAllDevices: jest.fn(),
    };
    verificationService = {
      verifyAccount: jest.fn(),
      resendVerification: jest.fn(),
      requestResetPassword: jest.fn(),
      resetPassword: jest.fn(),
    };
    service = new AuthService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      emailService as unknown as EmailService,
      i18n as unknown as I18nService,
      loginService as never,
      tokenService as never,
      refreshService as never,
      verificationService as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("delega signIn ao LoginService", async () => {
    const dto = { email: "a@b.com", password: "x" } as never;
    loginService.signIn.mockResolvedValue({ accessToken: "at" });
    await expect(service.signIn(dto, "ip")).resolves.toEqual({
      accessToken: "at",
    });
    expect(loginService.signIn).toHaveBeenCalledWith(dto, "ip");
  });

  it("delega resendVerification ao VerificationService (SEC-06)", async () => {
    verificationService.resendVerification.mockResolvedValue(undefined);
    await expect(service.resendVerification("a@b.com")).resolves.toBeUndefined();
    expect(verificationService.resendVerification).toHaveBeenCalledWith(
      "a@b.com",
    );
  });

  it("delega refreshAccessToken ao RefreshService (SEC-07)", async () => {
    refreshService.refreshAccessToken.mockResolvedValue({
      accessToken: "at",
      refreshToken: "rt",
      refreshTokenId: "id",
    });
    await expect(service.refreshAccessToken("rt")).resolves.toEqual({
      accessToken: "at",
      refreshToken: "rt",
      refreshTokenId: "id",
    });
    expect(refreshService.refreshAccessToken).toHaveBeenCalledWith("rt");
  });

  it("delega createLoginToken ao TokenService", async () => {
    tokenService.createLoginToken.mockResolvedValue("new-login-token");
    await expect(service.createLoginToken("u1")).resolves.toBe(
      "new-login-token",
    );
    expect(tokenService.createLoginToken).toHaveBeenCalledWith("u1");
  });

  it("delega signOut ao RefreshService", async () => {
    await service.signOut("at");
    expect(refreshService.signOut).toHaveBeenCalledWith("at");
  });

  it("delega logoutAllDevices ao RefreshService", async () => {
    await service.logoutAllDevices("u1");
    expect(refreshService.logoutAllDevices).toHaveBeenCalledWith("u1");
  });

  it("delega verifyAccount/resetPassword/requestResetPassword ao VerificationService", async () => {
    await service.verifyAccount("tok");
    await service.resetPassword("tok", "pwd");
    await service.requestResetPassword("a@b.com");
    expect(verificationService.verifyAccount).toHaveBeenCalledWith("tok");
    expect(verificationService.resetPassword).toHaveBeenCalledWith("tok", "pwd");
    expect(verificationService.requestResetPassword).toHaveBeenCalledWith(
      "a@b.com",
    );
  });
});
