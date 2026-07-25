import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Request } from "express";
import dayjs from "dayjs";
import { I18nService } from "nestjs-i18n";
import { PrismaService } from "../../prisma/prisma.service";
import { ShareService } from "../../share/share.service";
import { ConfigService } from "../../config/config.service";
import { JwtGuard } from "../../auth/guard/jwt.guard";
import { User } from "../../../prisma/generated/prisma/client";
import { isEpochZero } from "../../utils/date.util";

@Injectable()
export class ShareSecurityGuard extends JwtGuard {
  constructor(
    private shareService: ShareService,
    private prisma: PrismaService,
    private configService: ConfigService,
    private readonly i18n: I18nService,
  ) {
    super(configService);
  }

  async canActivate(context: ExecutionContext) {
    const request: Request = context.switchToHttp().getRequest();

    const shareId = Object.prototype.hasOwnProperty.call(
      request.params,
      "shareId",
    )
      ? request.params.shareId
      : request.params.id;

    const shareToken = request.cookies[`share_${shareId}_token`];

    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      include: { security: true },
    });

    if (!share) throw new NotFoundException(this.i18n.t("share.notFound"));

    // Run the JWTGuard to set the user
    await super.canActivate(context);
    const user = request.user as User;

    // If the user is the creator of the share, allow access
    if (user && share.creatorId === user.id) return true;

    // If admin access is enabled and user is admin, allow access
    if (
      user?.isAdmin &&
      this.configService.get("share.allowAdminAccessAllShares")
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
      throw new ForbiddenException(
        this.i18n.t("file.passwordProtected"),
        "share_password_required",
      );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(await this.shareService.verifyShareToken(share as any, shareToken)))
      throw new ForbiddenException(
        this.i18n.t("share.tokenRequired"),
        "share_token_required",
      );

    return true;
  }
}
