import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { I18nService } from "nestjs-i18n";
import { ConfigService } from "../../config/config.service";
import { isEpochZero, parseRelativeDateToAbsolute, Timespan } from "../../utils/date.util";
import dayjs from "dayjs";

@Injectable()
export class ShareValidationService {
  constructor(
    private prisma: PrismaService,
    private i18n: I18nService,
    public readonly config: ConfigService,
  ) {}

  async validateShareIdAvailable(id: string): Promise<{ isAvailable: boolean }> {
    const share = await this.prisma.share.findUnique({ where: { id } });
    return { isAvailable: !share };
  }

  async validateShareExists(id: string, requireUploadLocked = true) {
    const share = await this.prisma.share.findUnique({
      where: { id },
      include: { security: true },
    });

    if (share?.removedReason) {
      throw new NotFoundException(share.removedReason, "share_removed");
    }

    if (!share || (requireUploadLocked && !share.uploadLocked)) {
      throw new NotFoundException(this.i18n.t("share.notFound"));
    }

    return share;
  }

  validateExpiration(expiration: Date | null, isAdmin = false) {
    if (!isAdmin) {
      const maxExpiration: Timespan = this.config.getTimespan("share.maxExpiration");
      const expiresNever = isEpochZero(expiration);

      if (maxExpiration.value !== 0) {
        const exceeded =
          expiresNever ||
          (expiration !== null &&
            expiration > dayjs().add(maxExpiration.value, maxExpiration.unit).toDate());
        if (exceeded) {
          throw new BadRequestException(this.i18n.t("share.maxExpirationExceeded"));
        }
      }
    }
  }

  parseExpiration(expiration: string): Date | null {
    if (expiration === "never") return null;

    if (
      /^\d+-(minute|hour|day|week|month|year|minutes|hours|days|weeks|months|years)$/.test(
        expiration,
      )
    ) {
      return parseRelativeDateToAbsolute(expiration);
    }

    const absoluteExpiration = dayjs(expiration);
    if (absoluteExpiration.isValid()) return absoluteExpiration.toDate();

    throw new BadRequestException(this.i18n.t("share.invalidExpiration"));
  }

  validateCreatorAccess(share: { creatorId: string | null }, isUpdaterAdmin = false, action: "update" | "delete" | "expire") {
    if (!share.creatorId && !isUpdaterAdmin) {
      const key = action === "update" ? "share.anonymousNoUpdate" : action === "delete" ? "share.anonymousNoDelete" : "share.anonymousNoExpire";
      throw new ForbiddenException(this.i18n.t(key));
    }
  }
}
