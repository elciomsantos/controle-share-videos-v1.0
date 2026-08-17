import { ForbiddenException } from "@nestjs/common";
import { ReauthGuard } from "./reauth.guard";

describe("ReauthGuard", () => {
  let prisma: {
    refreshToken: { findUnique: jest.Mock };
  };
  let tokenService: { extractRefreshTokenId: jest.Mock };
  let config: {
    getBoolean: jest.Mock;
    getTimespan: jest.Mock;
  };
  let guard: ReauthGuard;

  const makeContext = (cookies: Record<string, string>) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ cookies }) }) }) as never;

  const makeSession = (minsAgo: number | null) => ({
    reauthenticatedAt:
      minsAgo === null ? null : new Date(Date.now() - minsAgo * 60_000),
  });

  beforeEach(() => {
    prisma = { refreshToken: { findUnique: jest.fn() } };
    tokenService = { extractRefreshTokenId: jest.fn(() => "rt1") };
    config = {
      getBoolean: jest.fn(() => false), // dev: cookie legado access_token
      getTimespan: jest.fn(() => ({ value: 5, unit: "minutes" })),
    };
    guard = new ReauthGuard(
      prisma as never,
      tokenService as never,
      config as never,
    );
  });

  it("aceita quando a sessão foi reautenticada dentro da janela", async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(makeSession(1));

    await expect(
      guard.canActivate(makeContext({ access_token: "jwt" })),
    ).resolves.toBe(true);
  });

  it("recusa quando o cookie de sessão está ausente", async () => {
    await expect(
      guard.canActivate(makeContext({})),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("recusa quando o access token não referencia a sessão", async () => {
    tokenService.extractRefreshTokenId.mockReturnValue(undefined);

    await expect(
      guard.canActivate(makeContext({ access_token: "jwt" })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("recusa quando nunca houve reautenticação na sessão", async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(makeSession(null));

    await expect(
      guard.canActivate(makeContext({ access_token: "jwt" })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("recusa quando a reautenticação está fora da janela", async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(makeSession(10));

    await expect(
      guard.canActivate(makeContext({ access_token: "jwt" })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});