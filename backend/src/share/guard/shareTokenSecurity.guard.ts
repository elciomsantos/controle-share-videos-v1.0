import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Request } from "express";
import dayjs from "dayjs";
import { I18nService } from "nestjs-i18n";
import { PrismaService } from "../../prisma/prisma.service";
import { isEpochZero } from "../../utils/date.util";

@Injectable()
export class ShareTokenSecurity implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request: Request = context.switchToHttp().getRequest();
    const shareId = Object.prototype.hasOwnProperty.call(
      request.params,
      "shareId",
    )
      ? request.params.shareId
      : request.params.id;

    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      include: { security: true },
    });

    if (
      !share ||
      (dayjs().isAfter(share.expiration) &&
        !isEpochZero(share.expiration))
    )
      throw new NotFoundException(this.i18n.t("share.notFound"));

    return true;
  }
}
