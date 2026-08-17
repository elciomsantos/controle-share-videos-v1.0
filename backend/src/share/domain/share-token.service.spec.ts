import { Share } from "../../../prisma/generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ShareTokenService } from "./share-token.service";

describe("ShareTokenService", () => {
  let prisma: {
    shareToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let service: ShareTokenService;

  const makeShare = (overrides: Record<string, unknown> = {}): Share =>
    ({
      id: "s1",
      expiration: new Date("2026-12-01T00:00:00Z"),
      ...overrides,
    }) as unknown as Share;

  beforeEach(() => {
    prisma = {
      shareToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    service = new ShareTokenService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("generateShareToken", () => {
    it("gera token opaco de 256 bits e persiste apenas o SHA-256 (§23.2)", async () => {
      const result = await service.generateShareToken(makeShare());

      expect(result).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const data = prisma.shareToken.create.mock.calls[0][0].data;
      expect(data.shareId).toBe("s1");
      expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(service.hashToken(result)).toBe(data.tokenHash);
      expect(data.expiresAt).toEqual(new Date("2026-12-01T00:00:00Z"));
    });

    it("usa expiração de 1 ano para epoch zero", async () => {
      const result = await service.generateShareToken(
        makeShare({ expiration: new Date(0) }),
      );

      const { expiresAt } = prisma.shareToken.create.mock.calls[0][0].data;
      const oneYear = 365 * 24 * 60 * 60 * 1000;
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + oneYear - 10_000);
      expect(service.hashToken(result)).toBe(
        prisma.shareToken.create.mock.calls[0][0].data.tokenHash,
      );
    });

    it("persiste contexto (ip e user agent) quando informado", async () => {
      await service.generateShareToken(makeShare(), {
        ip: "200.1.2.3",
        userAgent: "curl/8",
      });

      const data = prisma.shareToken.create.mock.calls[0][0].data;
      expect(data.ipAddress).toBe("200.1.2.3");
      expect(data.userAgent).toBe("curl/8");
    });
  });

  describe("verifyShareToken", () => {
    it("retorna false sem token", async () => {
      const result = await service.verifyShareToken(makeShare());

      expect(result).toBe(false);
      expect(prisma.shareToken.findUnique).not.toHaveBeenCalled();
    });

    it("retorna true para token válido e não revogado", async () => {
      const plain = await service.generateShareToken(makeShare());
      prisma.shareToken.findUnique.mockResolvedValue({
        tokenHash: service.hashToken(plain),
        shareId: "s1",
        revokedAt: null,
        expiresAt: new Date("2026-12-01T00:00:00Z"),
      });

      const result = await service.verifyShareToken(makeShare(), plain);

      expect(result).toBe(true);
      expect(prisma.shareToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: service.hashToken(plain) },
      });
    });

    it("retorna false quando o token não existe", async () => {
      prisma.shareToken.findUnique.mockResolvedValue(null);

      const result = await service.verifyShareToken(makeShare(), "token");

      expect(result).toBe(false);
    });

    it("retorna false quando o token pertence a outro share", async () => {
      prisma.shareToken.findUnique.mockResolvedValue({
        tokenHash: "hash",
        shareId: "outro",
        revokedAt: null,
        expiresAt: new Date("2026-12-01T00:00:00Z"),
      });

      const result = await service.verifyShareToken(makeShare(), "token");

      expect(result).toBe(false);
    });

    it("retorna false quando o token foi revogado (§23.4)", async () => {
      prisma.shareToken.findUnique.mockResolvedValue({
        tokenHash: "hash",
        shareId: "s1",
        revokedAt: new Date(),
        expiresAt: new Date("2026-12-01T00:00:00Z"),
      });

      const result = await service.verifyShareToken(makeShare(), "token");

      expect(result).toBe(false);
    });

    it("retorna false quando o token expirou (§23.4)", async () => {
      prisma.shareToken.findUnique.mockResolvedValue({
        tokenHash: "hash",
        shareId: "s1",
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      const result = await service.verifyShareToken(makeShare(), "token");

      expect(result).toBe(false);
    });
  });

  describe("revokeAllForShare", () => {
    it("revoga em lote apenas tokens ativos, mantendo histórico", async () => {
      prisma.shareToken.updateMany.mockResolvedValue({ count: 2 });

      await service.revokeAllForShare("s1");

      const args = prisma.shareToken.updateMany.mock.calls[0][0];
      expect(args.where).toEqual({ shareId: "s1", revokedAt: null });
      expect(args.data.revokedAt).toBeInstanceOf(Date);
    });
  });

  describe("hashToken", () => {
    it("produz SHA-256 em hex", () => {
      expect(service.hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
      expect(service.hashToken("abc")).toBe(service.hashToken("abc"));
      expect(service.hashToken("abc")).not.toBe(service.hashToken("abd"));
    });
  });
});
