import { ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { I18nService } from "nestjs-i18n";
import { ShareSecurityGuard } from "./shareSecurity.guard";
import { ShareTokenService } from "../domain/share-token.service";
import { StreamViewCounterService } from "../domain/stream-view-counter.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ConfigService } from "../../config/config.service";
import { SessionService } from "../../auth/service/session.service";

/**
 * Issue #40 — limites de views/downloads valem para toda via de acesso
 * público (incluindo streaming inline), não apenas para emissão de token.
 * Refinamento: cada limite rege apenas a sua operação (views → assistir,
 * downloads → baixar) e o certificado é isento de ambos.
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

  const makeContext = (
    cookie?: string,
    opts?: {
      query?: Record<string, string>;
      method?: string;
      fileId?: string;
      path?: string;
    },
  ) =>
    ({
      switchToHttp: () => ({
        getRequest: () =>
          ({
            method: opts?.method ?? "GET",
            path: opts?.path ?? `/api/shares/${shareId}/files/x`,
            params: { shareId, ...(opts?.fileId ? { fileId: opts.fileId } : {}) },
            query: opts?.query ?? {},
            cookies: cookie ? { [`share_${shareId}_token`]: cookie } : {},
          }) as unknown as Request,
      }),
    }) as never;

  const makeModule = async (
    share: ReturnType<typeof buildShare>,
    file?: { name: string } | null,
    opts?: { identityAlreadyCounted?: boolean },
  ) => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ShareSecurityGuard,
        { provide: ShareTokenService, useValue: { verifyShareToken: async () => true } },
        {
          provide: PrismaService,
          useValue: {
            share: { findUnique: async () => share },
            file: { findUnique: async () => file ?? null },
          },
        },
        {
          provide: StreamViewCounterService,
          useValue: {
            identityFromRequest: () => "x".repeat(32),
            hasRecentView: () => opts?.identityAlreadyCounted ?? false,
          },
        },
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

  it("bloqueia stream (?download=false) quando maxViews esgotado", async () => {
    const guard = await makeModule(buildShare(1, 0, { maxViews: 1, maxDownloads: null }));
    await expect(
      guard.canActivate(makeContext(validToken, { query: { download: "false" } })),
    ).rejects.toThrow(
      new ForbiddenException({ message: "share.maxViewsExceeded", error: "share_max_views_exceeded" }),
    );
  });

  it("bloqueia download quando maxDownloads esgotado", async () => {
    const guard = await makeModule(buildShare(0, 1, { maxViews: null, maxDownloads: 1 }));
    await expect(guard.canActivate(makeContext(validToken))).rejects.toThrow(
      new ForbiddenException({ message: "share.maxDownloadsExceeded", error: "share_max_downloads_exceeded" }),
    );
  });

  it("coisas separadas: maxDownloads esgotado NÃO bloqueia visualização", async () => {
    const guard = await makeModule(buildShare(0, 5, { maxViews: 3, maxDownloads: 2 }));
    await expect(
      guard.canActivate(makeContext(validToken, { query: { download: "false" } })),
    ).resolves.toBe(true);
  });

  it("coisas separadas: maxViews esgotado NÃO bloqueia download", async () => {
    const guard = await makeModule(buildShare(9, 0, { maxViews: 2, maxDownloads: 3 }));
    await expect(guard.canActivate(makeContext(validToken))).resolves.toBe(true);
  });

  it("certificado fica acessível mesmo com views E downloads esgotados", async () => {
    const guard = await makeModule(
      buildShare(9, 9, { maxViews: 2, maxDownloads: 2 }),
      { name: "video.certificado.pdf" },
    );
    // rota dedicada /certificate
    await expect(
      guard.canActivate(makeContext(validToken, { path: `/api/shares/${shareId}/files/xyz/certificate` })),
    ).resolves.toBe(true);
    // arquivo genérico .certificado.pdf (download=true e preview)
    await expect(
      guard.canActivate(makeContext(validToken, { fileId: "file-cert-1" })),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        makeContext(validToken, { fileId: "file-cert-1", query: { download: "false" } }),
      ),
    ).resolves.toBe(true);
  });

  it("arquivo normal NÃO recebe a isenção de certificado", async () => {
    const guard = await makeModule(
      buildShare(0, 9, { maxViews: null, maxDownloads: 2 }),
      { name: "video.mp4" },
    );
    await expect(guard.canActivate(makeContext(validToken, { fileId: "file-1" }))).rejects.toThrow(
      new ForbiddenException({ message: "share.maxDownloadsExceeded", error: "share_max_downloads_exceeded" }),
    );
  });

  it("identidade já contada (dedupe) continua a stream mesmo com views esgotadas", async () => {
    const guard = await makeModule(
      buildShare(2, 0, { maxViews: 2, maxDownloads: null }),
      null,
      { identityAlreadyCounted: true },
    );
    await expect(
      guard.canActivate(makeContext(validToken, { query: { download: "false" } })),
    ).resolves.toBe(true);
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
