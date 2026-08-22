import { ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { I18nService } from "nestjs-i18n";
import { ShareSecurityGuard } from "./shareSecurity.guard";
import { ShareTokenService } from "../domain/share-token.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ConfigService } from "../../config/config.service";
import { SessionService } from "../../auth/service/session.service";

/**
 * Issue #40 — limites de views/downloads valem para toda via de acesso
 * público (incluindo streaming inline), não apenas para emissão de token.
 */
describe("ShareSecurityGuard — limites pós-token (issue #40)", () => {
  const shareId = "F8y5staDyc404zaWCXGL";
  const validToken = "token-opaco-valido";

  type SecurityShape = {
    maxViews: number | null;
    maxDownloads: number | null;
  };

  const buildShare = (
    views: number,
    downloads: number,
    security: SecurityShape,
  ) => ({
    id: shareId,
    creatorId: "owner-uuid",
    expiration: new Date("2099-01-01"),
    views,
    downloads,
    security,
  });

  const makeContext = (cookie?: string) => ({
    switchToHttp: () => ({
      getRequest: () =>
        ({
          params: { shareId },
          cookies: cookie ? { [`share_${shareId}_token`]: cookie } : {},
        }) as unknown as Request,
    }),
  }) as never;

  const makeModule = async (share: ReturnType<typeof buildShare>) => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ShareSecurityGuard,
        { provide: ShareTokenService, useValue: { verifyShareToken: async () => true } },
        { provide: PrismaService, useValue: { share: { findUnique: async () => share } } },
        { provide: ConfigService, useValue: { getBoolean: () => false } },
        { provide: SessionService, useValue: {} },
        { provide: I18nService, useValue: { t: (k: string) => k } },
        { provide: Reflector, useValue: { getAllAndOverride: () => true } },
      ],
    }).compile();

    // JwtGuard base é contornado: request.user = criador ausente (viewer público)
    const guard = moduleRef.get(ShareSecurityGuard);
    Object.setPrototypeOf(guard, ShareSecurityGuard.prototype);
    type JwtProto = { canActivate: (...args: unknown[]) => Promise<boolean> };
    const jwtProto = Object.getPrototypeOf(
      ShareSecurityGuard.prototype,
    ) as JwtProto;
    jest.spyOn(jwtProto, "canActivate").mockResolvedValue(true);
    return guard;
  };

  it("bloqueia stream quando maxViews esgotado, mesmo com token válido", async () => {
    const guard = await makeModule(buildShare(1, 0, { maxViews: 1, maxDownloads: null }));
    await expect(guard.canActivate(makeContext(validToken))).rejects.toThrow(
      new ForbiddenException({ message: "share.maxViewsExceeded", error: "share_max_views_exceeded" }),
    );
  });

  it("bloqueia acesso quando maxDownloads esgotado, mesmo com token válido", async () => {
    const guard = await makeModule(buildShare(0, 1, { maxViews: null, maxDownloads: 1 }));
    await expect(guard.canActivate(makeContext(validToken))).rejects.toThrow(
      new ForbiddenException({ message: "share.maxDownloadsExceeded", error: "share_max_downloads_exceeded" }),
    );
  });

  it("permite acesso enquanto nenhum limite foi atingido", async () => {
    const guard = await makeModule(buildShare(0, 0, { maxViews: 1, maxDownloads: 1 }));
    await expect(guard.canActivate(makeContext(validToken))).resolves.toBe(true);
  });

  it("limites zerados/negativos desativam a restrição", async () => {
    const guard = await makeModule(buildShare(50, 50, { maxViews: 0, maxDownloads: 0 }));
    await expect(guard.canActivate(makeContext(validToken))).resolves.toBe(true);
  });
});
