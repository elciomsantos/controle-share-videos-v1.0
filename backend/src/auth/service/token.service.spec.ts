import { TokenService } from "./token.service";

describe("TokenService", () => {
  let prisma: {
    refreshToken: { create: jest.Mock };
    loginToken: { create: jest.Mock; updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let jwtService: { sign: jest.Mock; verifyAsync: jest.Mock; decode: jest.Mock };
  let config: { getBoolean: jest.Mock; getTimespan: jest.Mock };
  let jwtSecret: {
    getCurrentSecret: jest.Mock;
    getKid: jest.Mock;
    resolveSecretForToken: jest.Mock;
  };
  let service: TokenService;

  beforeEach(() => {
    prisma = {
      refreshToken: { create: jest.fn() },
      loginToken: { create: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    jwtService = { sign: jest.fn(), verifyAsync: jest.fn(), decode: jest.fn() };
    config = {
      getBoolean: jest.fn(() => true),
      getTimespan: jest.fn(() => ({ value: 30, unit: "days" })),
    };
    jwtSecret = {
      getCurrentSecret: jest.fn(() => "secret"),
      getKid: jest.fn(() => "kid-1"),
      resolveSecretForToken: jest.fn(() => "secret"),
    };
    service = new TokenService(
      prisma as never,
      jwtService as never,
      config as never,
      jwtSecret as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("signAccessToken", () => {
    it("assina com o secret atual e o kid de rotação", () => {
      jwtService.sign.mockReturnValue("jwt");

      const result = service.signAccessToken(
        {
          id: "u1",
          email: "a@b.com",
          role: "admin",
          isAdmin: true,
        } as never,
        "rt1",
      );

      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          sub: "u1",
          email: "a@b.com",
          role: "admin",
          isAdmin: true,
          refreshTokenId: "rt1",
        },
        { expiresIn: "15min", secret: "secret", keyid: "kid-1" },
      );
      expect(result).toBe("jwt");
    });
  });

  describe("createRefreshToken", () => {
    it("persiste um refresh token com expiry baseado na duração da sessão", async () => {
      prisma.refreshToken.create.mockResolvedValue({ id: "rt1", token: "tok" });

      const result = await service.createRefreshToken("u1");

      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: {
          userId: "u1",
          expiresAt: expect.any(Date),
        },
      });
      expect(config.getTimespan).toHaveBeenCalledWith("general.sessionDuration");
      expect(result.id).toBe("rt1");
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

  describe("addTokensToResponse", () => {
    const makeResponse = () => ({ cookie: jest.fn(), setHeader: jest.fn() });

    it("grava cookies httpOnly com flags de sessão", () => {
      const response = makeResponse();

      service.addTokensToResponse(
        response as never,
        "refresh",
        "access",
      );

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
    it("retorna o sub quando o token é válido", async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: "u1" });

      const result = await service.getUserIdFromRequest({
        cookies: { "__Host-SID": "jwt" },
      } as never);

      expect(result).toBe("u1");
      expect(jwtSecret.resolveSecretForToken).toHaveBeenCalledWith("jwt");
    });

    it("retorna null sem token ou com token inválido", async () => {
      await expect(
        service.getUserIdFromRequest({ cookies: {} } as never),
      ).resolves.toBeNull();

      jwtService.verifyAsync.mockRejectedValue(new Error("bad"));
      await expect(
        service.getUserIdFromRequest({
          cookies: { "__Host-SID": "jwt" },
        } as never),
      ).resolves.toBeNull();
    });
  });

  describe("extractRefreshTokenId", () => {
    it("decodifica o refreshTokenId do access token", () => {
      jwtService.decode.mockReturnValue({ refreshTokenId: "rt1" });
      expect(service.extractRefreshTokenId("jwt")).toBe("rt1");
    });

    it("retorna undefined quando não presente", () => {
      jwtService.decode.mockReturnValue({});
      expect(service.extractRefreshTokenId("jwt")).toBeUndefined();
    });
  });
});
