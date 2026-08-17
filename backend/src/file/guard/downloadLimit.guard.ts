import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, User } from "../../../prisma/generated/prisma/client";
import { Request } from "express";
import { I18nService } from "nestjs-i18n";
import { DownloadLogService } from "../../download-log/download-log.service";
import { PrismaService } from "../../prisma/prisma.service";
import { getRequestIp, getRequestUserAgent } from "../../utils/request.util";

interface AuthenticatedRequest extends Request {
  user?: User;
}

@Injectable()
export class DownloadLimitGuard {
  constructor(
    private prisma: PrismaService,
    private readonly i18n: I18nService,
    private downloadLogService: DownloadLogService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: Request = context.switchToHttp().getRequest();
    const shareId = request.params.shareId as string;

    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      include: { security: true },
    }) as Prisma.ShareGetPayload<{ include: { security: true } }> | null;

    if (!share) {
      throw new NotFoundException(this.i18n.t("share.notFound"));
    }

    const maxDownloads = share.security?.maxDownloads;

    // SEC-1.2/25.1: reserva atômica do download. O UPDATE condicionado ao
    // limite + contagem de linhas afetadas elimina a corrida (TOCTOU) entre
    // verificação e incremento.
    if (maxDownloads != null && maxDownloads > 0) {
      const { count } = await this.prisma.share.updateMany({
        where: { id: shareId, downloads: { lt: maxDownloads } },
        data: { downloads: { increment: 1 } },
      });

      if (count === 0) {
        const user = (request as AuthenticatedRequest).user;
        void this.downloadLogService.record({
          shareId,
          fileName: "",
          userId: user?.id,
          username: user?.username,
          ip: getRequestIp(request),
          userAgent: getRequestUserAgent(request),
          success: false,
          reason: "maxDownloadsExceeded",
          event: "download",
        });

        throw new ForbiddenException({
          message: this.i18n.t("share.maxDownloadsExceeded"),
          error: "share_max_downloads_exceeded",
        });
      }
    }

    return true;
  }
}
