import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Request } from "express";
import { I18nService } from "nestjs-i18n";
import { DownloadLogService } from "../../download-log/download-log.service";
import { PrismaService } from "../../prisma/prisma.service";

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
      const user = (request as any).user;
      void this.downloadLogService.record({
        shareId,
        fileName: "",
        userId: user?.id,
        username: user?.username,
        ip: request.ip || request.socket.remoteAddress || "unknown",
        success: false,
        reason: "maxDownloadsExceeded",
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
