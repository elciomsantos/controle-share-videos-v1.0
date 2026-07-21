import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";

export interface DownloadLogEntry {
  shareId: string;
  fileId?: string;
  fileName: string;
  userId?: string;
  username?: string;
  ip: string;
  success: boolean;
  reason?: string;
}

@Injectable()
export class DownloadLogService {
  private readonly logger = new Logger(DownloadLogService.name);

  constructor(private prisma: PrismaService) {}

  async record(entry: DownloadLogEntry): Promise<void> {
    try {
      await this.prisma.downloadLog.create({
        data: {
          shareId: entry.shareId,
          fileId: entry.fileId ?? null,
          fileName: entry.fileName,
          userId: entry.userId ?? null,
          username: entry.username ?? null,
          ip: entry.ip,
          success: entry.success,
          reason: entry.reason ?? null,
        },
      });
    } catch (err: any) {
      this.logger.warn(
        `Failed to record download log: ${err?.message || "unknown error"}`,
      );
    }
  }

  async findAll(params: {
    shareId?: string;
    userId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const { shareId, userId, from, to, page = 1, limit = 50 } = params;

    const where: any = {};
    if (shareId) where.shareId = shareId;
    if (userId) where.userId = userId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      this.prisma.downloadLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.downloadLog.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
