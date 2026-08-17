import { TokenService } from "./token.service";

describe("TokenService", () => {
  let prisma: {
    refreshToken: { create: jest.Mock };
    session: { create: jest.Mock; findUnique: jest.Mock };
    loginToken: { create: jest.Mock; updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let config: { getBoolean: jest.Mock; getTimespan: jest.Mock };
  let service: TokenService;

  beforeEach(() => {
    prisma = {
      refreshToken: { create: jest.fn() },
      session: { create: jest.fn(), findUnique: jest.fn() },
      loginToken: { create: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    config = {
      getBoolean: jest.fn(() => true),
      getTimespan: jest.fn(() => ({ value: 30, unit: "days" })),
    };
    service = new TokenService(prisma as never, config as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("generateAccessToken / hashToken", () => {
    it("gera token opaco de 256 bits e armazena somente o SHA-256", () => {
      const token = service.generateAccessToken();
      const hash = service.hashToken(token);

      expect(token).toBeDefined();
      // 32 bytes em base64url -> ~43 caracteres.
      expect(token.length).toBeGreaterThan(40);
      // SHA-256 hex -> exatamente 64 caracteres.
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      // O hash não contém o token real.
      expect(hash).not.toContain(token);
    });
  });

  describe("createSession", () => {
    it("cria a sessão com hash + expiração absoluta e retorna o token real", async () => {
      prisma.session.create.mockResolvedValue({ id: "s1" });
      config.getTimespan.mockImplementation((key: string) =>
        key === "general.sessionMaxDuration"
          ? { value: 8, unit: "hours" }
          : { value: 30, unit: "days" },
      );

      const result = await service.createSession("u1", "rt1");

      const data = prisma.session.create.mock.calls[0][0].data;
      expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(service.hashToken(result.accessToken)).toBe(data.tokenHash);
      expect(data.userId).toBe("u1");
      expect(data.refreshTokenId).toBe("rt1");
      expect(data.expiresAt).toBeInstanceOf(Date);
      expect(result.sessionId).toBe("s1");
    });
  });

  describe("createRefreshToken", () => {
    it("persiste apenas o hash do refresh token e retorna o texto puro (§26.3)", async () => {
      prisma.refreshToken.create.mockResolvedValue({ id: "rt1", token: "ignored" });

      const result = await service.createRefreshToken("u1");

      const data = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(data.userId).toBe("u1");
      expect(data.reauthenticatedAt).toBeNull();
      expect(data.expiresAt).toBeInstanceOf(Date);
      expect(data.token).toMatch(/^[0-9a-f]{64}$/);
      expect(result.id).toBe("rt1");
      // O valor retornado (cookie) é o texto puro; o banco só tem o SHA-256.
      expect(result.token).not.toBe(data.token);
      expect(service.hashToken(result.token)).toBe(data.token);
      expect(config.getTimespan).toHaveBeenCalledWith("general.sessionDuration");
    });
  });

  describe("createLoginToken", () => {
    it("invalida loginTokens antigos não usados antes de criar um novo", async () => {
      prisma.loginToken.updateMany.mockResolvedValue({ count: 2 });
      prisma.loginToken.create.mockResolvedValue({ token: "new-login-token" });

      const result = await service.createLoginToken("u1");

      expect(prisma.loginToken.updateMany).toHaveBeenCalledWith({
        where: { userId: "u1", used: false },
        data: { used: true },
      });
      expect(prisma.loginToken.create).toHaveBeenCalled();
      expect(result).toBe("new-login-token");
    });
  });

  describe("getSessionByAccessToken", () => {
    it("localiza a sessão pelo hash do token opaco", async () => {
      prisma.session.findUnique.mockResolvedValue({ id: "s1", userId: "u1" });

      const result = await service.getSessionByAccessToken("some-token");

      expect(prisma.session.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: service.hashToken("some-token") },
        include: { refreshToken: true, user: true },
      });
      expect(result?.id).toBe("s1");
    });

    it("retorna null sem token", async () => {
      await expect(service.getSessionByAccessToken("")).resolves.toBeNull();
    });
  });

  describe("addTokensToResponse", () => {
    const makeResponse = () => ({ cookie: jest.fn(), setHeader: jest.fn() });

    it("grava cookies httpOnly com flags de sessão", () => {
      const response = makeResponse();

      service.addTokensToResponse(response as never, "refresh", "access");

      expect(response.cookie).toHaveBeenCalledWith(
        "__Host-SID",
        "access",
        expect.objectContaining({ httpOnly: true, sameSite: "strict" }),
      );
      expect(response.cookie).toHaveBeenCalledWith(
        "refresh_token",
        "refresh",
        expect.objectContaining({ path: "/api/auth/token" }),
      );
    });

    it("usa o nome legado quando secureCookies está desabilitado", () => {
      config.getBoolean.mockReturnValue(false);
      const response = makeResponse();

      service.addTokensToResponse(response as never, "refresh", "access");

      expect(response.cookie).toHaveBeenCalledWith(
        "access_token",
        "access",
        expect.objectContaining({ httpOnly: true, sameSite: "strict" }),
      );
    });
  });

  describe("getUserIdFromRequest", () => {
    it("retorna o user id quando a sessão é válida", async () => {
      prisma.session.findUnique.mockResolvedValue({
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: "u1", isActivated: true },
      });

      const result = await service.getUserIdFromRequest({
        cookies: { "__Host-SID": "access" },
      } as never);

      expect(result).toBe("u1");
    });

    it("retorna null sem token, com sessão revogada ou expirada", async () => {
      await expect(
        service.getUserIdFromRequest({ cookies: {} } as never),
      ).resolves.toBeNull();

      prisma.session.findUnique.mockResolvedValue({
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: "u1", isActivated: true },
      });
      await expect(
        service.getUserIdFromRequest({
          cookies: { "__Host-SID": "access" },
        } as never),
      ).resolves.toBeNull();

      prisma.session.findUnique.mockResolvedValue({
        revokedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
        user: { id: "u1", isActivated: true },
      });
      await expect(
        service.getUserIdFromRequest({
          cookies: { "__Host-SID": "access" },
        } as never),
      ).resolves.toBeNull();
    });
  });
});