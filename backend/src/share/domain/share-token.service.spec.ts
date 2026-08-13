import { JwtService } from "@nestjs/jwt";
import { ShareTokenService } from "./share-token.service";
import { JwtSecretService } from "../../config/jwt-secret.service";
import { Share, ShareSecurity } from "../../../prisma/generated/prisma/client";

describe("ShareTokenService", () => {
  let jwtService: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let jwtSecret: {
    getCurrentSecret: jest.Mock;
    getKid: jest.Mock;
    resolveSecretForToken: jest.Mock;
  };
  let service: ShareTokenService;

  const makeShare = (overrides: Record<string, unknown> = {}): Share & {
    security?: ShareSecurity;
  } =>
    ({
      id: "s1",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      expiration: new Date("2026-12-01T00:00:00Z"),
      security: null,
      ...overrides,
    }) as unknown as Share & { security?: ShareSecurity };

  beforeEach(() => {
    jwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    };
    jwtSecret = {
      getCurrentSecret: jest.fn(() => "current-secret"),
      getKid: jest.fn(() => "kid-1"),
      resolveSecretForToken: jest.fn(),
    };
    service = new ShareTokenService(
      jwtService as unknown as JwtService,
      jwtSecret as unknown as JwtSecretService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("generateShareToken", () => {
    it("assina token com expiração em segundos e kid", async () => {
      jwtService.signAsync.mockResolvedValue("token");

      const result = await service.generateShareToken(makeShare());

      expect(result).toBe("token");
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          shareId: "s1",
          shareCreatedAt: 1767225600,
        }),
        expect.objectContaining({
          secret: "current-secret",
          keyid: "kid-1",
          expiresIn: expect.any(Number),
        }),
      );
    });

    it("usa expiração de 1 ano para epoch zero", async () => {
      jwtService.signAsync.mockResolvedValue("token");

      await service.generateShareToken(
        makeShare({ expiration: new Date(0) }),
      );

      const options = jwtService.signAsync.mock.calls[0][1];
      expect(options.expiresIn).toBe("1y");
    });

    it("inclui signature do password quando security tem password", async () => {
      jwtService.signAsync.mockResolvedValue("token");

      await service.generateShareToken(
        makeShare({ security: { shareId: "s1", password: "pw-hash" } as ShareSecurity }),
      );

      const payload = jwtService.signAsync.mock.calls[0][0];
      expect(payload.sharePasswordSignature).toBeDefined();
      expect(payload.sharePasswordSignature).toHaveLength(128);
    });
  });

  describe("verifyShareToken", () => {
    it("retorna true para token válido", async () => {
      jwtSecret.resolveSecretForToken.mockReturnValue("current-secret");
      jwtService.verifyAsync.mockResolvedValue({
        shareId: "s1",
        shareCreatedAt: 1767225600,
      });

      const result = await service.verifyShareToken(makeShare(), "token");

      expect(result).toBe(true);
    });

    it("retorna false quando os claims não batem com o share", async () => {
      jwtService.verifyAsync.mockResolvedValue({
        shareId: "outro",
        shareCreatedAt: 0,
      });

      const result = await service.verifyShareToken(makeShare(), "token");

      expect(result).toBe(false);
    });

    it("retorna false quando o token é inválido", async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error("bad token"));

      const result = await service.verifyShareToken(makeShare(), "token");

      expect(result).toBe(false);
    });

    it("valida signature do password quando security tem password", async () => {
      jwtService.verifyAsync.mockResolvedValue({
        shareId: "s1",
        shareCreatedAt: 1767225600,
        sharePasswordSignature: "x".repeat(128),
      });

      const result = await service.verifyShareToken(
        makeShare({ security: { shareId: "s1", password: "pw-hash" } as ShareSecurity }),
        "token",
      );

      expect(result).toBe(false);
    });
  });
});