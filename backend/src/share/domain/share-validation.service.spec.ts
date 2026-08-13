import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import dayjs from "dayjs";
import { ShareValidationService } from "./share-validation.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ConfigService } from "../../config/config.service";
import { I18nService } from "nestjs-i18n";

describe("ShareValidationService", () => {
  let prisma: { share: { findUnique: jest.Mock } };
  let config: { getTimespan: jest.Mock };
  let i18n: { t: jest.Mock };
  let service: ShareValidationService;

  beforeEach(() => {
    prisma = { share: { findUnique: jest.fn() } };
    config = { getTimespan: jest.fn() };
    i18n = { t: jest.fn((key: string) => `t:${key}`) };
    service = new ShareValidationService(
      prisma as unknown as PrismaService,
      i18n as unknown as I18nService,
      config as unknown as ConfigService,
    );
  });

  describe("validateShareIdAvailable", () => {
    it("retorna isAvailable true quando id não existe", async () => {
      prisma.share.findUnique.mockResolvedValue(null);

      const result = await service.validateShareIdAvailable("s1");

      expect(result).toEqual({ isAvailable: true });
    });

    it("retorna isAvailable false quando id existe", async () => {
      prisma.share.findUnique.mockResolvedValue({ id: "s1" });

      const result = await service.validateShareIdAvailable("s1");

      expect(result).toEqual({ isAvailable: false });
    });
  });

  describe("validateShareExists", () => {
    it("retorna o share quando existe e está locked", async () => {
      const share = { id: "s1", uploadLocked: true, removedReason: null };
      prisma.share.findUnique.mockResolvedValue(share);

      const result = await service.validateShareExists("s1");

      expect(result).toBe(share);
    });

    it("lança NotFound com removedReason quando o share foi removido", async () => {
      prisma.share.findUnique.mockResolvedValue({
        id: "s1",
        removedReason: "removido",
      });

      await expect(service.validateShareExists("s1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("lança NotFound quando não existe", async () => {
      prisma.share.findUnique.mockResolvedValue(null);

      await expect(service.validateShareExists("s1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("lança NotFound quando não está locked e requireUploadLocked é true", async () => {
      prisma.share.findUnique.mockResolvedValue({
        id: "s1",
        uploadLocked: false,
      });

      await expect(service.validateShareExists("s1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("aceita share não-locked quando requireUploadLocked é false", async () => {
      const share = { id: "s1", uploadLocked: false, removedReason: null };
      prisma.share.findUnique.mockResolvedValue(share);

      const result = await service.validateShareExists("s1", false);

      expect(result).toBe(share);
    });
  });

  describe("validateExpiration", () => {
    it("não lança para admin", () => {
      expect(() =>
        service.validateExpiration(
          dayjs().add(10, "year").toDate(),
          true,
        ),
      ).not.toThrow();
    });

    it("não lança quando maxExpiration é zero", () => {
      config.getTimespan.mockReturnValue({ value: 0, unit: "days" });

      expect(() =>
        service.validateExpiration(dayjs().add(10, "year").toDate()),
      ).not.toThrow();
    });

    it("lança quando expiração excede o limite", () => {
      config.getTimespan.mockReturnValue({ value: 30, unit: "days" });

      expect(() =>
        service.validateExpiration(dayjs().add(60, "day").toDate()),
      ).toThrow(BadRequestException);
    });

    it("lança quando o share nunca expira (epoch zero)", () => {
      config.getTimespan.mockReturnValue({ value: 30, unit: "days" });

      expect(() => service.validateExpiration(new Date(0))).toThrow(
        BadRequestException,
      );
    });
  });

  describe("parseExpiration", () => {
    it("retorna null para 'never'", () => {
      expect(service.parseExpiration("never")).toBeNull();
    });

    it("converte datas relativas", () => {
      const result = service.parseExpiration("7-days");
      expect(result).toBeInstanceOf(Date);
    });

    it("converte datas absolutas", () => {
      const result = service.parseExpiration("2026-12-31");
      expect(result).toBeInstanceOf(Date);
      expect(result?.getTime()).toBe(dayjs("2026-12-31").toDate().getTime());
    });

    it("lança para formato inválido", () => {
      expect(() => service.parseExpiration("not-a-date")).toThrow(
        BadRequestException,
      );
    });
  });

  describe("validateCreatorAccess", () => {
    it("permite quando há creatorId", () => {
      expect(() =>
        service.validateCreatorAccess({ creatorId: "u1" }, false, "delete"),
      ).not.toThrow();
    });

    it("permite quando admin atualiza share sem dono", () => {
      expect(() =>
        service.validateCreatorAccess({ creatorId: null }, true, "update"),
      ).not.toThrow();
    });

    it("lança Forbidden para share sem dono e não-admin", () => {
      expect(() =>
        service.validateCreatorAccess({ creatorId: null }, false, "delete"),
      ).toThrow(ForbiddenException);
    });
  });
});