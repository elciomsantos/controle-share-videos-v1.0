import {
  BadRequestException,
  Injectable,
  Optional,
} from "@nestjs/common";
import { RequestContextLogger } from "../common/request-context/request-context";
import { getRequestContext } from "../common/request-context/request-context";
import { Prisma } from "../../prisma/generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MetricsService } from "../metrics/metrics.service";

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

  constructor(
    private prisma: PrismaService,
    @Optional() private metrics?: MetricsService,
  ) {}

  async record(entry: DownloadLogEntry): Promise<void> {
    const maxRetries = 2;
    const baseDelayMs = 100;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
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
            requestId:
              entry.requestId ?? getRequestContext()?.requestId ?? null,
          },
        });
        this.metrics?.incAppEvent(entry.event ?? "download", entry.success);
        return;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "unknown error";
        const isLastAttempt = attempt === maxRetries;

        if (isLastAttempt) {
          this.logger.error(
            `Failed to record download log after ${maxRetries + 1} attempts: ${message}`,
            {
              shareId: entry.shareId,
              fileName: entry.fileName,
              event: entry.event,
              success: entry.success,
              reason: entry.reason,
              stack: err instanceof Error ? err.stack : undefined,
            },
          );
          // BKD-04: don't throw — audit log failure must not break the main flow
        } else {
          this.logger.warn(
            `Download log record attempt ${attempt + 1} failed, retrying: ${message}`,
            {
              shareId: entry.shareId,
              attempt: attempt + 1,
              maxRetries: maxRetries + 1,
            },
          );
          await this.sleep(baseDelayMs * Math.pow(2, attempt));
        }
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
