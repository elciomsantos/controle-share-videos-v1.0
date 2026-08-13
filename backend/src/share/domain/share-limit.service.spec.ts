import { BadRequestException } from "@nestjs/common";
import { ShareLimitService } from "./share-limit.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ConfigService } from "../../config/config.service";
import { I18nService } from "nestjs-i18n";

describe("ShareLimitService", () => {
  let prisma: { share: { findUnique: jest.Mock } };
  let config: { getNumber: jest.Mock; getTimespan: jest.Mock; getString: jest.Mock };
  let i18n: { t: jest.Mock };
  let service: ShareLimitService;

  beforeEach(() => {
    prisma = { share: { findUnique: jest.fn() } };
    config = {
      getNumber: jest.fn(),
      getTimespan: jest.fn(),
      getString: jest.fn(),
    };
    i18n = { t: jest.fn((key: string) => `t:${key}`) };
    service = new ShareLimitService(
      config as unknown as ConfigService,
      prisma as unknown as PrismaService,
      i18n as unknown as I18nService,
    );
  });

  describe("checkShareSizeLimit", () => {
    it("não faz nada quando o share não existe", async () => {
      prisma.share.findUnique.mockResolvedValue(null);

      await expect(service.checkShareSizeLimit("s1", 100)).resolves.toBeUndefined();
    });

    it("permite upload dentro do limite", async () => {
      prisma.share.findUnique.mockResolvedValue({
        id: "s1",
        files: [{ size: 100n }],
      });
      config.getNumber.mockImplementation((key: string) =>
        key === "share.maxSize" ? 1000 : 1000,
      );

      await expect(service.checkShareSizeLimit("s1", 500)).resolves.toBeUndefined();
    });

    it("lança BadRequest quando excede o limite efetivo", async () => {
      prisma.share.findUnique.mockResolvedValue({
        id: "s1",
        files: [{ size: 800n }],
      });
      config.getNumber.mockImplementation((key: string) =>
        key === "share.maxSize" ? 1000 : 500,
      );

      await expect(service.checkShareSizeLimit("s1", 300)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe("getMaxExpiration", () => {
    it("retorna o timespan configurado", () => {
      config.getTimespan.mockReturnValue({ value: 30, unit: "days" });

      expect(service.getMaxExpiration()).toEqual({ value: 30, unit: "days" });
    });
  });

  describe("getZipLimits", () => {
    it("retorna limites do zip", () => {
      config.getNumber.mockImplementation((key: string) =>
        key === "share.zipMaxFiles"
          ? 10000
          : key === "share.zipMaxTotalSize"
            ? 1024
            : 103,
      );
      config.getString.mockReturnValue("9");

      expect(service.getZipLimits()).toEqual({
        maxFiles: 10000,
        maxTotalSize: 1024,
        maxRatio: 103,
        compressionLevel: "9",
      });
    });
  });
});