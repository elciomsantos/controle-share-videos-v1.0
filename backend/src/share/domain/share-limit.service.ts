import { Injectable } from "@nestjs/common";
import { ConfigService } from "../../config/config.service";
import { PrismaService } from "../../prisma/prisma.service";
import { EPOCH_ZERO, isEpochZero } from "../../utils/date.util";
import dayjs from "dayjs";

@Injectable()
export class ShareLimitService {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
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
      throw new Error("share.notEnoughSpace");
    }
  }

  getMaxExpiration(): { value: number; unit: string } {
    return this.config.getTimespan("share.maxExpiration");
  }

  isNeverExpires(expiration: Date): boolean {
    return isEpochZero(expiration);
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
