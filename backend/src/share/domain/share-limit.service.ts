import { BadRequestException, Injectable } from "@nestjs/common";
import { I18nService } from "nestjs-i18n";
import { ConfigService } from "../../config/config.service";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ShareLimitService {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  async checkShareSizeLimit(shareId: string, additionalSize: number): Promise<void> {
    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      include: { files: true, security: true },
    });

    if (!share) return;

    const totalSize = share.files.reduce((sum, f) => sum + Number(f.size), 0);
    const maxShareSize = this.config.getNumber("share.maxSize");
    const maxFileSize = this.config.getNumber("share.maxFileSize");

    const effectiveLimit = Math.min(maxShareSize, maxFileSize);

    if (totalSize + additionalSize > effectiveLimit) {
      throw new BadRequestException(this.i18n.t("share.notEnoughSpace"));
    }
  }

  getMaxExpiration(): { value: number; unit: string } {
    return this.config.getTimespan("share.maxExpiration");
  }

  getZipLimits() {
    return {
      maxFiles: this.config.getNumber("share.zipMaxFiles"),
      maxTotalSize: this.config.getNumber("share.zipMaxTotalSize"),
      maxRatio: this.config.getNumber("share.zipMaxRatio"),
      compressionLevel: this.config.getString("share.zipCompressionLevel"),
    };
  }
}
