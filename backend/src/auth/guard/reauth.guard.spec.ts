import { ForbiddenException } from "@nestjs/common";
import { ReauthGuard } from "./reauth.guard";

describe("ReauthGuard", () => {
  let sessionService: {
    findByAccessToken: jest.Mock;
  };
  let tokenService: {
    clearReauthenticated: jest.Mock;
  };
  let config: {
    getBoolean: jest.Mock;
    getTimespan: jest.Mock;
  };
  let guard: ReauthGuard;

  const makeContext = (cookies: Record<string, string>) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ cookies }) }) }) as never;

  const makeSession = (minsAgo: number | null) => ({
    refreshToken: {
      id: "refresh-token-id",
      reauthenticatedAt:
        minsAgo === null ? null : new Date(Date.now() - minsAgo * 60_000),
    },
  });

  beforeEach(() => {
    sessionService = {
      findByAccessToken: jest.fn(() =>
        Promise.resolve(makeSession(1)),
      ),
    };
    tokenService = {
      clearReauthenticated: jest.fn(() => Promise.resolve()),
    };
    config = {
      getBoolean: jest.fn(() => false), // dev: cookie legado access_token
      getTimespan: jest.fn(() => ({ value: 5, unit: "minutes" })),
    };
    guard = new ReauthGuard(
      sessionService as never,
      tokenService as never,
      config as never,
    );
  });

  it("aceita quando a sessão foi reautenticada dentro da janela e consome o marco (reauth de uso único)", async () => {
    await expect(
      guard.canActivate(makeContext({ access_token: "opaque" })),
    ).resolves.toBe(true);

    expect(tokenService.clearReauthenticated).toHaveBeenCalledWith(
      "refresh-token-id",
    );
  });

  it("não consome o marco quando a sessão foi reautenticada fora da janela", async () => {
    sessionService.findByAccessToken.mockResolvedValue(makeSession(10));

    await expect(
      guard.canActivate(makeContext({ access_token: "opaque" })),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(tokenService.clearReauthenticated).not.toHaveBeenCalled();
  });

  it("recusa quando o cookie de sessão está ausente", async () => {
    await expect(
      guard.canActivate(makeContext({})),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("recusa quando a sessão opaca não é encontrada", async () => {
    sessionService.findByAccessToken.mockResolvedValue(null);

    await expect(
      guard.canActivate(makeContext({ access_token: "opaque" })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("recusa quando nunca houve reautenticação na sessão", async () => {
    sessionService.findByAccessToken.mockResolvedValue(makeSession(null));

    await expect(
      guard.canActivate(makeContext({ access_token: "opaque" })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("recusa quando a reautenticação está fora da janela", async () => {
    sessionService.findByAccessToken.mockResolvedValue(makeSession(10));

    await expect(
      guard.canActivate(makeContext({ access_token: "opaque" })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});