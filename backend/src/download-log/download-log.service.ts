import {
  BadRequestException,
  Injectable,
} from "@nestjs/common";
import { RequestContextLogger } from "../common/request-context/request-context";
import { getRequestContext } from "../common/request-context/request-context";
import { Prisma } from "../../prisma/generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type DownloadLogEvent =
  | "download"
  | "view"
  | "upload"
  | "delete";

export interface DownloadLogEntry {
  shareId: string;
  fileId?: string;
  fileName: string;
  fileSize?: string | null;
  userId?: string;
  username?: string;
  ip: string;
  userAgent?: string | null;
  success: boolean;
  reason?: string;
  event?: DownloadLogEvent;
  /** Optional override correlation id; falls back to in-flight request id. */
  requestId?: string;
}

@Injectable()
export class DownloadLogService {
  private readonly logger = new RequestContextLogger(DownloadLogService.name);

  constructor(private prisma: PrismaService) {}

  async record(entry: DownloadLogEntry): Promise<void> {
    try {
      await this.prisma.downloadLog.create({
        data: {
          shareId: entry.shareId,
          fileId: entry.fileId ?? null,
          fileName: entry.fileName,
          fileSize: entry.fileSize ?? null,
          userId: entry.userId ?? null,
          username: entry.username ?? null,
          ip: entry.ip,
          userAgent: entry.userAgent ?? null,
          success: entry.success,
          reason: entry.reason ?? null,
          event: entry.event ?? "download",
          // GAP-02: prefer an explicit requestId when provided, otherwise
          // pull the correlation id from the active request context.
          requestId:
            entry.requestId ?? getRequestContext()?.requestId ?? null,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "unknown error";
      this.logger.warn(
        `Failed to record download log: ${message}`,
      );
    }
  }

  async findAll(params: {
    shareId?: string;
    userId?: string;
    from?: string;
    to?: string;
    event?: DownloadLogEvent;
    success?: boolean;
    page?: number;
    limit?: number;
  }) {
    const {
      shareId,
      userId,
      from,
      to,
      event,
      success,
      page = 1,
      limit = 50,
    } = params;

    const where: Prisma.DownloadLogWhereInput = {};
    if (shareId) where.shareId = shareId;
    if (userId) where.userId = userId;
    if (event) where.event = event;
    if (success !== undefined) where.success = success;
    if (from || to) {
      where.createdAt = {};
      if (from) {
        const fromDate = new Date(from);
        if (isNaN(fromDate.getTime())) {
          throw new BadRequestException(`Invalid "from" date: ${from}`);
        }
        where.createdAt.gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        if (isNaN(toDate.getTime())) {
          throw new BadRequestException(`Invalid "to" date: ${to}`);
        }
        where.createdAt.lte = toDate;
      }
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
