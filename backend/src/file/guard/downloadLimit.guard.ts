import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { I18nService } from "nestjs-i18n";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class DownloadLimitGuard {
  constructor(
    private prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const shareId = request.params.shareId;

    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      include: { security: true },
    });

    if (!share) return true;

    if (
      share.security?.maxDownloads != null &&
      share.security.maxDownloads > 0 &&
      share.downloads >= share.security.maxDownloads
    ) {
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
