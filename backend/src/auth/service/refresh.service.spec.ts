import { UnauthorizedException } from "@nestjs/common";
import { RefreshService } from "./refresh.service";

describe("RefreshService (SEC-07)", () => {
  let prisma: {
    refreshToken: {
      findUnique: jest.Mock;
      deleteMany: jest.Mock;
      delete: jest.Mock;
    };
    loginToken: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let tokenService: {
    createRefreshToken: jest.Mock;
    signAccessToken: jest.Mock;
    extractRefreshTokenId: jest.Mock;
  };
  let service: RefreshService;

  beforeEach(() => {
    prisma = {
      refreshToken: {
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
        delete: jest.fn(),
      },
      loginToken: { updateMany: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    tokenService = {
      createRefreshToken: jest.fn(),
      signAccessToken: jest.fn(() => "access-token"),
      extractRefreshTokenId: jest.fn(),
    };
    service = new RefreshService(
      prisma as never,
      tokenService as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("refreshAccessToken", () => {
    const meta = {
      id: "rt1",
      token: "old-token",
      expiresAt: new Date(Date.now() + 60_000),
      reauthenticatedAt: null as Date | null,
      user: { id: "u1", email: "user@example.com" },
    };

    it("rotaciona o token dentro de uma transação", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(meta);
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
      tokenService.createRefreshToken.mockResolvedValue({
        id: "rt2",
        token: "new-token",
      });

      const result = await service.refreshAccessToken("old-token");

      expect(result.accessToken).toBe("access-token");
      expect(result.refreshToken).toBe("new-token");
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(tokenService.createRefreshToken).toHaveBeenCalledWith(
        "u1",
        prisma,
        undefined,
      );
    });

    it("detecta reuso, revoga a família e lança UnauthorizedException", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(meta);
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.refreshAccessToken("old-token")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: "u1" },
      });
      expect(tokenService.createRefreshToken).not.toHaveBeenCalled();
    });

    it("lança UnauthorizedException para token inexistente ou expirado", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refreshAccessToken("missing")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it("lança UnauthorizedException para token expirado", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...meta,
        expiresAt: new Date(Date.now() - 60_000),
      });

      await expect(service.refreshAccessToken("expired")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe("signOut", () => {
    it("remove a sessão identificada pelo refreshTokenId", async () => {
      tokenService.extractRefreshTokenId.mockReturnValue("rt1");
      prisma.refreshToken.delete.mockResolvedValue({});

      await service.signOut("access-token");

      expect(prisma.refreshToken.delete).toHaveBeenCalledWith({
        where: { id: "rt1" },
      });
    });

    it("não faz nada quando o token não carrega refreshTokenId", async () => {
      tokenService.extractRefreshTokenId.mockReturnValue(undefined);

      await service.signOut("access-token");

      expect(prisma.refreshToken.delete).not.toHaveBeenCalled();
    });
  });

  describe("logoutAllDevices", () => {
    it("revoga todos os refresh tokens e invalida login tokens", async () => {
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 2 });
      prisma.loginToken.updateMany.mockResolvedValue({ count: 1 });

      await service.logoutAllDevices("u1");

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: "u1" },
      });
      expect(prisma.loginToken.updateMany).toHaveBeenCalledWith({
        where: { userId: "u1", used: false },
        data: { used: true },
      });
    });
  });
});
