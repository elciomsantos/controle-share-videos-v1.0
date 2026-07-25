import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { User } from "../../../prisma/generated/prisma/client";
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
    const shareId = request.params.shareId;

    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      include: { security: true },
    });

    if (!share) {
      throw new NotFoundException(this.i18n.t("share.notFound"));
    }

    if (
      share.security?.maxDownloads != null &&
      share.security.maxDownloads > 0 &&
      share.downloads >= share.security.maxDownloads
    ) {
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

      throw new ForbiddenException(
        this.i18n.t("share.maxDownloadsExceeded"),
        "share_max_downloads_exceeded",
      );
    }

    return true;
  }

  async incrementDownloadCount(shareId: string): Promise<void> {
    await this.prisma.share.update({
      where: { id: shareId },
      data: { downloads: { increment: 1 } },
    });
  }
}
