import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import dayjs from "dayjs";
import { User } from "../../../prisma/generated/prisma/client";
import { I18nService } from "nestjs-i18n";
import { DownloadLogService } from "../../download-log/download-log.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ShareSecurityGuard } from "../../share/guard/shareSecurity.guard";
import { ShareService } from "../../share/share.service";
import { ConfigService } from "../../config/config.service";
import {
  getRequestIp,
  getRequestUserAgent,
} from "../../utils/request.util";
import { isEpochZero } from "../../utils/date.util";

@Injectable()
export class FileSecurityGuard extends ShareSecurityGuard {
  constructor(
    private _shareService: ShareService,
    private _prisma: PrismaService,
    private _config: ConfigService,
    private readonly _i18n: I18nService,
    private _downloadLogService: DownloadLogService,
    reflector: Reflector,
  ) {
    super(_shareService, _prisma, _config, _i18n, reflector);
  }

  isBase64(toCheck: string) {
    const isBase64 = /^[a-zA-Z0-9-]*={0,2}$/.test(toCheck);
    return isBase64;
  }

  async canActivate(context: ExecutionContext) {
    const request: Request = context.switchToHttp().getRequest();

    const shareId = Object.prototype.hasOwnProperty.call(
      request.params,
      "shareId",
    )
      ? request.params.shareId
      : request.params.id;

    if (!this.isBase64(shareId)) {
      throw new BadRequestException(this._i18n.t("file.invalidIdFormat"));
    }

    const shareToken = request.cookies[`share_${shareId}_token`];

    const share = await this._prisma.share.findUnique({
      where: { id: shareId },
      include: { security: true },
    });

    // If there is no share token the user requests a file directly
    if (!shareToken) {
      // If admin access is enabled and user is admin, allow access
      if (this._config.get("share.allowAdminAccessAllShares")) {
        await super.canActivate(context);
        const user = request.user as User | undefined;
        if (user?.isAdmin) {
          return true;
        }
      }

      if (
        !share ||
        (dayjs().isAfter(share.expiration) &&
          !isEpochZero(share.expiration))
      ) {
        throw new NotFoundException(this._i18n.t("file.notFound"));
      }

      if (share.security?.password)
        throw new ForbiddenException(this._i18n.t("file.passwordProtected"));

      if (share.security?.maxViews && share.security.maxViews < share.views) {
        void this._downloadLogService.record({
          shareId,
          fileName: share.name ?? shareId,
          ip: getRequestIp(request),
          userAgent: getRequestUserAgent(request),
          success: false,
          reason: "maxViewsExceeded",
          event: "view",
        });
        throw new ForbiddenException(
          this._i18n.t("share.maxViewsExceeded"),
          "share_max_views_exceeded",
        );
      }

      await this._shareService.increaseViewCount(share, {
        ip: getRequestIp(request),
        userAgent: getRequestUserAgent(request),
      });
      return true;
    } else {
      return super.canActivate(context);
    }
  }
}
