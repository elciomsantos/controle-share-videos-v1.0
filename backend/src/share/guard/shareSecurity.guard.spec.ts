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
    password?: string | null;
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
      headers?: Record<string, string>;
      user?: { id: string; isAdmin: boolean } | null;
    },
  ) => {
    const request = {
      method: opts?.method ?? "GET",
      path: opts?.path ?? `/api/shares/${shareId}/files/x`,
      params: { shareId, ...(opts?.fileId ? { fileId: opts.fileId } : {}) },
      query: opts?.query ?? {},
      headers: opts?.headers ?? {},
      cookies: cookie ? { [`share_${shareId}_token`]: cookie } : {},
      user: opts?.user ?? undefined,
    } as unknown as Request;

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as never;
  };

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

    const guard = moduleRef.get(ShareSecurityGuard);
    Object.setPrototypeOf(guard, ShareSecurityGuard.prototype);
    type JwtProto = { canActivate: (...args: unknown[]) => Promise<boolean> };
    const jwtProto = Object.getPrototypeOf(
      ShareSecurityGuard.prototype,
    ) as JwtProto;
    jest.spyOn(jwtProto, "canActivate").mockResolvedValue(true);
    return guard;
  };

  const makeModuleWithAdminAccess = async (
    share: ReturnType<typeof buildShare>,
    allowAdminAccess: boolean,
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
        {
          provide: ConfigService,
          useValue: {
            getBoolean: (key: string) =>
              key === "share.allowAdminAccessAllShares" ? allowAdminAccess : false,
          },
        },
        { provide: SessionService, useValue: {} },
        { provide: I18nService, useValue: { t: (k: string) => k } },
        { provide: Reflector, useValue: { getAllAndOverride: () => true } },
      ],
    }).compile();

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
    // Rota de arquivo sem ?download=false => operação de DOWNLOAD (default do controller).
    await expect(
      guard.canActivate(makeContext(validToken, { fileId: "file-1" })),
    ).rejects.toThrow(
      new ForbiddenException({ message: "share.maxDownloadsExceeded", error: "share_max_downloads_exceeded" }),
    );
    // Rota /zip também é download.
    await expect(
      guard.canActivate(makeContext(validToken, { path: `/api/shares/${shareId}/zip` })),
    ).rejects.toThrow(
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
    await expect(
      guard.canActivate(makeContext(validToken, { fileId: "file-1" })),
    ).resolves.toBe(true);
  });

  it("carregar página/metadados do share é operação de VIEW (não paga download)", async () => {
    // Sem fileId e sem ?download=false: rota de metadados/página — obedece
    // apenas maxViews; downloads esgotados não impedem abrir o link.
    const guard = await makeModule(buildShare(0, 5, { maxViews: 3, maxDownloads: 2 }));
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

  it("reabrir o link (sem Range) com views esgotadas é bloqueado mesmo com sessão ativa", async () => {
    const guard = await makeModule(
      buildShare(2, 0, { maxViews: 2, maxDownloads: null }),
      null,
      { identityAlreadyCounted: true },
    );
    await expect(
      guard.canActivate(makeContext(validToken, { query: { download: "false" } })),
    ).rejects.toThrow(
      new ForbiddenException({ message: "share.maxViewsExceeded", error: "share_max_views_exceeded" }),
    );
  });

  it("Range de sessão ativa continua a stream mesmo com views esgotadas", async () => {
    const guard = await makeModule(
      buildShare(2, 0, { maxViews: 2, maxDownloads: null }),
      null,
      { identityAlreadyCounted: true },
    );
    await expect(
      guard.canActivate(
        makeContext(validToken, {
          query: { download: "false" },
          headers: { range: "bytes=0-" },
        }),
      ),
    ).resolves.toBe(true);
  });

  it("Range sem sessão ativa é bloqueado com views esgotadas", async () => {
    const guard = await makeModule(buildShare(2, 0, { maxViews: 2, maxDownloads: null }));
    await expect(
      guard.canActivate(
        makeContext(validToken, {
          query: { download: "false" },
          headers: { range: "bytes=100-" },
        }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it("permite acesso enquanto nenhum limite foi atingido", async () => {
    const guard = await makeModule(buildShare(0, 0, { maxViews: 1, maxDownloads: 1 }));
    await expect(guard.canActivate(makeContext(validToken))).resolves.toBe(true);
  });

  it("limites zerados/negativos desativam a restrição", async () => {
    const guard = await makeModule(buildShare(50, 50, { maxViews: 0, maxDownloads: 0 }));
    await expect(guard.canActivate(makeContext(validToken))).resolves.toBe(true);
  });

  it("criador acessa stream mesmo com maxViews esgotado", async () => {
    const guard = await makeModule(buildShare(5, 0, { maxViews: 2, maxDownloads: null }));
    await expect(
      guard.canActivate(makeContext(validToken, { query: { download: "false" }, user: { id: "owner-uuid", isAdmin: false } })),
    ).resolves.toBe(true);
  });

  it("criador acessa share protegido por senha SEM token de visitante (preview em /account/shares)", async () => {
    // Sem cookie de token do share e share com senha: o dono autenticado não
    // precisa passar pelo fluxo de visitante (senha/token) para pré-visualizar.
    const guard = await makeModule(
      buildShare(0, 0, { maxViews: null, maxDownloads: null, password: "$argon2hash" }),
    );
    await expect(
      guard.canActivate(makeContext(undefined, { fileId: "file-1", query: { download: "false" }, user: { id: "owner-uuid", isAdmin: false } })),
    ).resolves.toBe(true);
  });

  it("admin com permissão acessa share protegido por senha SEM token de visitante", async () => {
    const guard = await makeModuleWithAdminAccess(
      buildShare(9, 9, { maxViews: 2, maxDownloads: 2, password: "$argon2hash" }),
      true,
    );
    await expect(
      guard.canActivate(makeContext(undefined, { fileId: "file-1", user: { id: "admin-uuid", isAdmin: true } })),
    ).resolves.toBe(true);
  });

  it("visitante sem token continua bloqueado em share com senha", async () => {
    const guard = await makeModule(
      buildShare(0, 0, { maxViews: null, maxDownloads: null, password: "$argon2hash" }),
    );
    await expect(
      guard.canActivate(makeContext(undefined)),
    ).rejects.toThrow(
      new ForbiddenException({ message: "file.passwordProtected", error: "share_password_required" }),
    );
  });

  it("criador acessa download mesmo com maxDownloads esgotado", async () => {
    const guard = await makeModule(buildShare(0, 5, { maxViews: null, maxDownloads: 2 }));
    await expect(
      guard.canActivate(makeContext(validToken, { fileId: "file-1", user: { id: "owner-uuid", isAdmin: false } })),
    ).resolves.toBe(true);
  });

  it("admin com permissão acessa stream mesmo com maxViews esgotado", async () => {
    const guard = await makeModuleWithAdminAccess(buildShare(5, 0, { maxViews: 2, maxDownloads: null }), true);
    await expect(
      guard.canActivate(makeContext(validToken, { query: { download: "false" }, user: { id: "admin-uuid", isAdmin: true } })),
    ).resolves.toBe(true);
  });

  it("admin com permissão acessa download mesmo com maxDownloads esgotado", async () => {
    const guard = await makeModuleWithAdminAccess(buildShare(0, 5, { maxViews: null, maxDownloads: 2 }), true);
    await expect(
      guard.canActivate(makeContext(validToken, { fileId: "file-1", user: { id: "admin-uuid", isAdmin: true } })),
    ).resolves.toBe(true);
  });

  it("admin SEM permissão é bloqueado quando maxViews esgotado", async () => {
    const guard = await makeModuleWithAdminAccess(buildShare(5, 0, { maxViews: 2, maxDownloads: null }), false);
    await expect(
      guard.canActivate(makeContext(validToken, { query: { download: "false" }, user: { id: "admin-uuid", isAdmin: true } })),
    ).rejects.toThrow(
      new ForbiddenException({ message: "share.maxViewsExceeded", error: "share_max_views_exceeded" }),
    );
  });
});
