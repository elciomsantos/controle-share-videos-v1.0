import { ForbiddenException, Injectable } from "@nestjs/common";
import { I18nService } from "nestjs-i18n";
import * as crypto from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { DownloadLogService } from "../../download-log/download-log.service";

/**
 * Janela de SESSÃO DE REPRODUÇÃO por identidade: os requests de stream de um
 * MESMO playback (Range/chunks chegando em intervalos curtos) contam UMA
 * única view; reabrir o link depois de um intervalo maior que a janela inicia
 * uma nova sessão e consome outra view — o limite configurado pelo dono é
 * consumido a cada nova exibição, como esperado ("como estava antes" do
 * contador client-side), sem quebrar o streaming contínuo.
 * Sem Redis, o storage em memória segue o mesmo padrão do throttler local —
 * o backend roda como processo único.
 */
const SESSION_GAP_MS = 2 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60_000;

interface StreamViewContext {
  ip?: string;
  userAgent?: string | null;
  authMethod?: string | null;
  referer?: string | null;
}

interface ActiveSession {
  lastSeen: number;
}

/**
 * SEC-V1/V2: contagem de visualizações é server-side e acontece na entrega
 * de stream (`?download=false`) por identidade — hash do token do share, ou
 * usuário/IP em acessos autenticados. Nenhuma chamada do cliente é
 * necessária para contar (burlar exigiria forjar identidades novas a cada
 * sessão), e criador/admin TAMBÉM têm suas exibições contadas.
 *
 * O incremento usa semântica atômica condicional (`updateMany` com
 * `views < maxViews`): concorrência nunca ultrapassa o limite configurado.
 */
@Injectable()
export class StreamViewCounterService {
  private readonly sessions = new Map<string, ActiveSession>();
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
    const key = this.keyOf(shareId, context.identityKey);

    // Sessão ativa (requests de stream chegando dentro da janela): é o mesmo
    // playback — não conta outra view, apenas renova a sessão.
    if (this.hasActiveSession(key)) {
      this.touch(key);
      return;
    }

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

    this.touch(key);

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
    return this.hasActiveSession(this.keyOf(shareId, identityKey));
  }

  private keyOf(shareId: string, identityKey: string): string {
    return `share:${shareId}:view:${identityKey}`;
  }

  private hasActiveSession(key: string): boolean {
    this.sweep();
    const session = this.sessions.get(key);
    if (!session) return false;
    if (Date.now() - session.lastSeen > SESSION_GAP_MS) {
      this.sessions.delete(key);
      return false;
    }
    return true;
  }

  private touch(key: string): void {
    this.sessions.set(key, { lastSeen: Date.now() });
    this.sweep();
  }

  private sweep(): void {
    const now = Date.now();
    if (now - this.lastSweep < SWEEP_INTERVAL_MS && this.sessions.size < 10_000) {
      return;
    }
    this.lastSweep = now;
    for (const [key, session] of this.sessions) {
      if (now - session.lastSeen > SESSION_GAP_MS) this.sessions.delete(key);
    }
  }
}
