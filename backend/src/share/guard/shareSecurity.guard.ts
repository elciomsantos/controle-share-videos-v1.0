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
import { ShareService } from "../../share/share.service";
import { ConfigService } from "../../config/config.service";
import { JwtGuard } from "../../auth/guard/jwt.guard";
import { Prisma, User } from "../../../prisma/generated/prisma/client";
import { isEpochZero } from "../../utils/date.util";

@Injectable()
export class ShareSecurityGuard extends JwtGuard {
  constructor(
    private shareService: ShareService,
    private prisma: PrismaService,
    private configService: ConfigService,
    private readonly i18n: I18nService,
    reflector: Reflector,
  ) {
    super(configService, reflector);
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
    const pwdFromQuery = request.query.pwd as string | undefined;

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

    // Auto-authenticate via ?pwd= query parameter
    if (pwdFromQuery && share.security?.password) {
      if (this.configService.get("share.includePasswordInShareLink")) {
        try {
          const token = await this.shareService.getShareToken(shareId, pwdFromQuery);
          const res = context.switchToHttp().getResponse();
          res.cookie(`share_${shareId}_token`, token, {
            path: "/",
            httpOnly: true,
            sameSite: "lax",
            secure: this.configService.get("general.secureCookies"),
            // Session cookie: expires when browser closes. Keep parity with
            // share.controller.ts for short-lived auto-auth via ?pwd= link.
          });
          return true;
        } catch {
          // Invalid password via query — fall through to normal flow
        }
      }
    }

    if (share.security?.password && !shareToken)
      throw new ForbiddenException({
        message: this.i18n.t("file.passwordProtected"),
        error: "share_password_required",
      });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(await this.shareService.verifyShareToken(share as any, shareToken)))
      throw new ForbiddenException({
        message: this.i18n.t("share.tokenRequired"),
        error: "share_token_required",
      });

    return true;
  }
}
