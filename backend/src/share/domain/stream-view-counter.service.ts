import { ForbiddenException, Injectable } from "@nestjs/common";
import { I18nService } from "nestjs-i18n";
import * as crypto from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { DownloadLogService } from "../../download-log/download-log.service";

/**
 * Janela de dedupe por identidade: a mesma pessoa/token assistindo de novo
 * dentro da janela não consome outra view; reabrindo o link no dia seguinte,
 * sim. Sem Redis, o storage em memória segue o mesmo padrão do throttler
 * local — o backend roda como processo único.
 */
const DEDUPE_TTL_MS = 12 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60_000;

interface StreamViewContext {
  ip?: string;
  userAgent?: string | null;
  authMethod?: string | null;
  referer?: string | null;
}

/**
 * SEC-V1/V2: contagem de visualizações é server-side e acontece na primeira
 * entrega de stream (`?download=false`) por identidade — hash do token do
 * share, ou usuário/IP em acessos autenticados. Nenhuma chamada do cliente é
 * necessária para contar (burlar exigiria forjar identidades novas a cada
 * janela), e criador/admin TAMBÉM têm suas exibições contadas.
 *
 * O incremento usa a mesma semântica atômica condicional que existia em
 * `ShareService.increaseViewCount` (`updateMany` com `views < maxViews`):
 * concorrência nunca ultrapassa o limite configurado.
 */
@Injectable()
export class StreamViewCounterService {
  private readonly seen = new Map<string, number>();
  private lastSweep = Date.now();

  constructor(
    private prisma: PrismaService,
    private downloadLogService: DownloadLogService,
    private i18n: I18nService,
  ) {}

  async countStreamView(
    shareId: string,
    context: StreamViewContext & { identityKey: string },
  ): Promise<void> {
    const key = `share:${shareId}:view:${context.identityKey}`;
    if (this.hasRecentViewByKey(key)) return;

    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      select: {
        id: true,
        name: true,
        security: { select: { maxViews: true } },
        creator: { select: { username: true } },
      },
    });
    // Defensivo: o guard já devolveu 404 para share inexistente/expirado.
    if (!share) return;

    const audit = {
      shareId: share.id,
      fileName: share.name ?? share.id,
      shareName: share.name ?? null,
      creatorUsername: share.creator?.username ?? null,
      authMethod: context.authMethod ?? null,
      referer: context.referer ?? null,
      ip: context.ip ?? "unknown",
      userAgent: context.userAgent ?? null,
      event: "view" as const,
    };

    const maxViews = share.security?.maxViews;
    let incremented: boolean;
    if (maxViews != null && maxViews > 0) {
      const result = await this.prisma.share.updateMany({
        where: { id: share.id, views: { lt: maxViews } },
        data: { views: { increment: 1 } },
      });
      incremented = result.count > 0;
    } else {
      await this.prisma.share.update({
        where: { id: share.id },
        data: { views: { increment: 1 } },
      });
      incremented = true;
    }

    if (!incremented) {
      void this.downloadLogService.record({
        ...audit,
        success: false,
        reason: "maxViewsExceeded",
      });
      throw new ForbiddenException({
        message: this.i18n.t("share.maxViewsExceeded"),
        error: "share_max_views_exceeded",
      });
    }

    this.mark(key);

    void this.downloadLogService.record({ ...audit, success: true });
  }

  /**
   * Deriva a identidade do viewer (hash SHA-256 truncado) na mesma ordem de
   * prioridade usada pelo FileController: token do share > usuário de sessão
   * > IP. Guard e controller chegam à MESMA chave.
   */
  identityFromRequest(req: {
    cookies?: Record<string, string | undefined>;
    params?: { shareId?: string };
    user?: { id?: string } | null;
    ip?: string;
    socket?: { remoteAddress?: string };
  }): string {
    const shareId = req.params?.shareId ?? "";
    const shareToken = req.cookies?.[`share_${shareId}_token`];
    const userId = req.user?.id;
    const identity = shareToken
      ? shareToken
      : userId
        ? `u:${userId}`
        : `ip:${req.ip ?? req.socket?.remoteAddress ?? "unknown"}`;
    return crypto
      .createHash("sha256")
      .update(identity)
      .digest("hex")
      .slice(0, 32);
  }

  hasRecentView(shareId: string, identityKey: string): boolean {
    return this.hasRecentViewByKey(`share:${shareId}:view:${identityKey}`);
  }
  private hasRecentViewByKey(key: string): boolean {
    this.sweep();
    const expiresAt = this.seen.get(key);
    if (expiresAt === undefined) return false;
    if (expiresAt <= Date.now()) {
      this.seen.delete(key);
      return false;
    }
    return true;
  }

  private mark(key: string): void {
    this.seen.set(key, Date.now() + DEDUPE_TTL_MS);
    this.sweep();
  }

  private sweep(): void {
    const now = Date.now();
    if (now - this.lastSweep < SWEEP_INTERVAL_MS && this.seen.size < 10_000) {
      return;
    }
    this.lastSweep = now;
    for (const [key, expiresAt] of this.seen) {
      if (expiresAt <= now) this.seen.delete(key);
    }
  }
}
