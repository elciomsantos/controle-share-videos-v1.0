import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import dayjs from "dayjs";
import { I18nService } from "nestjs-i18n";
import { PrismaService } from "../../prisma/prisma.service";
import { ShareTokenService } from "./../domain/share-token.service";
import { StreamViewCounterService } from "../domain/stream-view-counter.service";
import { ConfigService } from "../../config/config.service";
import { SessionService } from "../../auth/service/session.service";
import { JwtGuard } from "../../auth/guard/jwt.guard";
import { Prisma, User } from "../../../prisma/generated/prisma/client";
import { isEpochZero } from "../../utils/date.util";

@Injectable()
export class ShareSecurityGuard extends JwtGuard {
  constructor(
    private shareTokenService: ShareTokenService,
    private prisma: PrismaService,
    private configService: ConfigService,
    sessionService: SessionService,
    private readonly i18n: I18nService,
    private streamViewCounter: StreamViewCounterService,
    reflector: Reflector,
  ) {
    super(reflector, sessionService, configService);
  }

  async canActivate(context: ExecutionContext) {
    const request: Request = context.switchToHttp().getRequest();

    const shareId: string = Object.prototype.hasOwnProperty.call(
      request.params,
      "shareId",
    )
      ? (request.params.shareId as string)
      : (request.params.id as string);

    const shareToken = request.cookies[`share_${shareId}_token`];

    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      include: { security: true },
    }) as Prisma.ShareGetPayload<{ include: { security: true } }> | null;

    if (!share) throw new NotFoundException(this.i18n.t("share.notFound"));

    // Run the JWTGuard to set the user
    await super.canActivate(context);
    const user = request.user as User;

    // If the user is the creator of the share, allow access
    if (user && share.creatorId === user.id) return true;

    // If admin access is enabled and user is admin, allow access
    if (
      user?.isAdmin &&
      this.configService.getBoolean("share.allowAdminAccessAllShares")
    ) {
      return true;
    }

    if (
      dayjs().isAfter(share.expiration) &&
      !isEpochZero(share.expiration)
    ) {
      throw new NotFoundException(this.i18n.t("share.notFound"));
    }

    if (share.security?.password && !shareToken)
      throw new ForbiddenException({
        message: this.i18n.t("file.passwordProtected"),
        error: "share_password_required",
      });

    if (
      !(await this.shareTokenService.verifyShareToken(
        { id: share.id },
        shareToken,
      ))
    )
      throw new ForbiddenException({
        message: this.i18n.t("share.tokenRequired"),
        error: "share_token_required",
      });

    // SEC (issue #40, refinado): os limites continuam valendo para TODA via de
    // acesso público (revogação efetiva a cada request), mas agora são
    // SEPARADOS POR OPERAÇÃO — visualizar (streaming/play, ?download=false e
    // POST /view) obedece apenas maxViews; baixar (download=true e zip)
    // obedece apenas maxDownloads. Assistir não esgota download e vice-versa.
    // O incremento real de downloads permanece atômico no DownloadLimitGuard.
    const maxViews = share.security?.maxViews;
    const maxDownloads = share.security?.maxDownloads;

    const viewExceeded = maxViews != null && maxViews > 0 && share.views >= maxViews;
    const downloadExceeded =
      maxDownloads != null && maxDownloads > 0 && share.downloads >= maxDownloads;

    // Operação de visualização: streaming inline/Range (?download=false) e o
    // registro de play (POST /view). Demais rotas públicas (download=true,
    // /zip) são operações de download.
    const isViewOperation =
      request.method === "POST" || request.query?.download === "false";

    if (!(isViewOperation ? viewExceeded : downloadExceeded)) return true;

    // Isenção de certificado: abrir/baixar o PDF de certificado NUNCA consome
    // nem é bloqueado pelos limites — a autenticidade do vídeo fica sempre
    // verificável, mesmo com views/downloads esgotados.
    if (await this.isCertificateRequest(request)) return true;

    if (isViewOperation) {
      // SEC-V1/V2: identidade cuja view JÁ foi contada (dentro da janela de
      // dedupe) continua a sessão de streaming — quem entrou na última vaga
      // assiste o vídeo inteiro; novas identidades são bloqueadas aqui e a
      // contagem nova acontece no StreamViewCounterService (controller).
      const identityKey = this.streamViewCounter.identityFromRequest(request);
      if (this.streamViewCounter.hasRecentView(share.id, identityKey)) {
        return true;
      }
      throw new ForbiddenException({
        message: this.i18n.t("share.maxViewsExceeded"),
        error: "share_max_views_exceeded",
      });
    }

    throw new ForbiddenException({
      message: this.i18n.t("share.maxDownloadsExceeded"),
      error: "share_max_downloads_exceeded",
    });
  }

  /**
   * Detecta requisições de certificado: rota dedicada (:fileId/certificate) ou
   * arquivo genérico cujo nome termina com .certificado.pdf. A consulta ao
   * arquivo só acontece quando um limite já foi excedido (caminho quente das
   * streams dentro do limite não paga query extra).
   */
  private async isCertificateRequest(request: Request): Promise<boolean> {
    const urlPath = (request.path ?? "").toLowerCase();
    if (urlPath.endsWith("/certificate")) return true;

    const fileId = request.params?.fileId as string | undefined;
    if (!fileId) return false;

    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      select: { name: true },
    });
    return !!file?.name.toLowerCase().endsWith(".certificado.pdf");
  }
}
