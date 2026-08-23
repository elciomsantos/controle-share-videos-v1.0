import { ForbiddenException } from "@nestjs/common";
import { StreamViewCounterService } from "./stream-view-counter.service";
import { PrismaService } from "../../prisma/prisma.service";
import { DownloadLogService } from "../../download-log/download-log.service";
import { I18nService } from "nestjs-i18n";

/**
 * SEC-V1/V2 — contagem server-side de views por SESSÃO DE REPRODUÇÃO:
 * requests de um mesmo playback (Range/chunks dentro da janela curta) contam
 * UMA view; reabrir após o intervalo da janela consome OUTRA view, respeitando
 * o limite atômico. Sem bypass para criador/admin.
 */
describe("StreamViewCounterService", () => {
  const makeCounter = () => {
    const prisma = {
      share: {
        findUnique: jest.fn().mockResolvedValue({
          id: "s1",
          name: "Meu share",
          security: { maxViews: null },
          creator: { username: "dono" },
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const downloadLogService = { record: jest.fn() };
    const i18n = { t: (k: string) => k };
    const service = new StreamViewCounterService(
      prisma as unknown as PrismaService,
      downloadLogService as unknown as DownloadLogService,
      i18n as unknown as I18nService,
    );
    return { service, prisma, downloadLogService };
  };

  const context = {
    identityKey: "a".repeat(32),
    ip: "1.2.3.4",
    userAgent: "UA",
    authMethod: "shareToken",
    referer: null,
  };

  it("conta a primeira stream e registra log de sucesso", async () => {
    const { service, prisma, downloadLogService } = makeCounter();

    await service.countStreamView("s1", context);

    expect(prisma.share.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { views: { increment: 1 } } }),
    );
    expect(downloadLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        event: "view",
        creatorUsername: "dono",
      }),
    );
  });

  it("requests de um mesmo playback (Range dentro da janela) contam UMA view", async () => {
    const { service, prisma } = makeCounter();

    await service.countStreamView("s1", context);
    await service.countStreamView("s1", context);
    await service.countStreamView("s1", context);

    expect(prisma.share.update).toHaveBeenCalledTimes(1);
  });

  it("reabrir após o intervalo da janela de sessão conta NOVA view", async () => {
    const { service, prisma } = makeCounter();
    const base = Date.now();
    const nowSpy = jest.spyOn(Date, "now");

    nowSpy.mockReturnValue(base);
    await service.countStreamView("s1", context);
    expect(prisma.share.update).toHaveBeenCalledTimes(1);

    // Requests ainda dentro da janela (mesmo playback): não contam.
    nowSpy.mockReturnValue(base + 60_000);
    await service.countStreamView("s1", context);
    expect(prisma.share.update).toHaveBeenCalledTimes(1);

    // Gap maior que a janela de sessão (2 min): nova exibição.
    nowSpy.mockReturnValue(base + 4 * 60_000);
    await service.countStreamView("s1", context);
    expect(prisma.share.update).toHaveBeenCalledTimes(2);

    nowSpy.mockRestore();
  });

  it("hasRecentView reflete a sessão ativa e expira com o gap", async () => {
    const { service } = makeCounter();
    const base = Date.now();
    const nowSpy = jest.spyOn(Date, "now");

    expect(service.hasRecentView("s1", context.identityKey)).toBe(false);

    nowSpy.mockReturnValue(base);
    await service.countStreamView("s1", context);
    expect(service.hasRecentView("s1", context.identityKey)).toBe(true);

    nowSpy.mockReturnValue(base + 4 * 60_000);
    expect(service.hasRecentView("s1", context.identityKey)).toBe(false);

    nowSpy.mockRestore();
  });

  it("identidades diferentes contam separadamente", async () => {
    const { service, prisma } = makeCounter();

    await service.countStreamView("s1", context);
    await service.countStreamView("s1", { ...context, identityKey: "b".repeat(32) });

    expect(prisma.share.update).toHaveBeenCalledTimes(2);
  });

  it("criador/admin autenticado também tem a exibição contada (sem bypass)", async () => {
    const { service, prisma } = makeCounter();
    // O controller deriva identityKey de u:<userId> para sessões; o serviço
    // apenas conta — não há caminho que ignore o incremento.
    await service.countStreamView("s1", {
      ...context,
      identityKey: "c".repeat(32),
      authMethod: "session",
    });

    expect(prisma.share.update).toHaveBeenCalledTimes(1);
  });

  it("usa updateMany condicional quando há maxViews", async () => {
    const { service, prisma, downloadLogService } = makeCounter();
    prisma.share.findUnique.mockResolvedValue({
      id: "s1",
      name: "S",
      security: { maxViews: 2 },
      creator: null,
    });
    prisma.share.updateMany.mockResolvedValue({ count: 1 });

    await service.countStreamView("s1", context);

    expect(prisma.share.updateMany).toHaveBeenCalledWith({
      where: { id: "s1", views: { lt: 2 } },
      data: { views: { increment: 1 } },
    });
    expect(prisma.share.update).not.toHaveBeenCalled();
    expect(downloadLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it("lança Forbidden e NÃO deduplica quando o limite foi atingido", async () => {
    const { service, prisma } = makeCounter();
    prisma.share.findUnique.mockResolvedValue({
      id: "s1",
      name: "S",
      security: { maxViews: 2 },
      creator: null,
    });
    prisma.share.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.countStreamView("s1", context)).rejects.toThrow(
      new ForbiddenException({
        message: "share.maxViewsExceeded",
        error: "share_max_views_exceeded",
      }),
    );

    // Não marca como vista: retry continua batendo no limite atômico.
    await expect(service.countStreamView("s1", context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.share.updateMany).toHaveBeenCalledTimes(2);
  });
});
