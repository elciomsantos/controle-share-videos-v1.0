import {
  ExecutionContext,
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Prisma, User, Share, ShareSecurity } from "../../../prisma/generated/prisma/client";
import { Request } from "express";
import { I18nService } from "nestjs-i18n";
import { PrismaService } from "../../prisma/prisma.service";
import { JwtGuard } from "../../auth/guard/jwt.guard";

type ShareWithSecurity = Share & { security: ShareSecurity | null };

interface ShareRequest extends Request {
  share?: ShareWithSecurity;
}

@Injectable()
export class ShareOwnerGuard extends JwtGuard {
  constructor(
    reflector: Reflector,
    private prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {
    super(reflector);
  }

  isBase64(toCheck: string) {
    const isBase64 = /^[a-zA-Z0-9-]*={0,2}$/.test(toCheck);
    return isBase64;
  }

  async canActivate(context: ExecutionContext) {
    const request: Request = context.switchToHttp().getRequest();
    const shareId: string = Object.prototype.hasOwnProperty.call(
      request.params,
      "shareId",
    )
      ? (request.params.shareId as string)
      : (request.params.id as string);

    if (!this.isBase64(shareId)) {
      throw new BadRequestException(this.i18n.t("file.invalidIdFormat"));
    }

    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      include: { security: true },
    }) as Prisma.ShareGetPayload<{ include: { security: true } }> | null;

    if (!share) throw new NotFoundException(this.i18n.t("share.notFound"));

    (request as ShareRequest).share = share;

    // Run the JWTGuard to set the user
    await super.canActivate(context);
    const user = request.user as User;

    // If the user is the creator of the share, allow access
    if (user && share.creatorId == user.id) return true;

    // If the user is an admin, allow access
    if (this.allowAdmin && user?.isAdmin) return true;

    // If not signed in, deny access
    if (!user) return false;

    return false;
  }

  protected get allowAdmin(): boolean {
    return true;
  }
}
