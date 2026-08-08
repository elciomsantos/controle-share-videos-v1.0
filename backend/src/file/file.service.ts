import { Inject, Injectable } from "@nestjs/common";
import { RequestContextLogger } from "../common/request-context/request-context";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";
import { LocalFileService } from "./local.service";
import { ConfigService } from "../config/config.service";
import { Readable } from "stream";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";

const UPDATED_AT_THROTTLE_MS = 5 * 60 * 1000;
const DOWNLOAD_NOTIFICATION_COOLDOWN_MS = 15 * 60 * 1000;

@Injectable()
export class FileService {
  constructor(
    private prisma: PrismaService,
    private localFileService: LocalFileService,
    private configService: ConfigService,
    private emailService: EmailService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}
  private readonly logger = new RequestContextLogger(FileService.name);

  async create(
    data: string,
    chunk: { index: number; total: number },
    file: {
      id?: string;
      name: string;
      description?: string;
    },
    shareId: string,
  ) {
    await this.touchShare(shareId);
    return this.localFileService.create(data, chunk, file, shareId);
  }

  private async touchShare(shareId: string) {
    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      select: { updatedAt: true },
    });
    if (!share) return;
    if (
      share.updatedAt &&
      Date.now() - share.updatedAt.getTime() < UPDATED_AT_THROTTLE_MS
    )
      return;
    await this.prisma.share.update({
      where: { id: shareId },
      data: { updatedAt: new Date() },
    });
  }

  async get(
    shareId: string,
    fileId: string,
    range?: { start: number; end: number },
  ): Promise<File> {
    return this.localFileService.get(shareId, fileId, range);
  }

  async getFileMetaData(shareId: string, fileId: string) {
    return this.localFileService.getFileMetaData(shareId, fileId);
  }

  async remove(shareId: string, fileId: string) {
    return this.localFileService.remove(shareId, fileId);
  }

  async deleteAllFiles(shareId: string) {
    return this.localFileService.deleteAllFiles(shareId);
  }

  async getZip(shareId: string): Promise<Readable> {
    return await this.localFileService.getZip(shareId);
  }

  async getFileZip(shareId: string, fileId: string): Promise<Readable> {
    return this.localFileService.getFileZip(shareId, fileId);
  }

  async notifyRecipientDownload(
    shareId: string,
    fileName: string,
    recipientId?: string,
  ) {
    try {
      if (
        !recipientId ||
        !this.configService.getBoolean("smtp.enabled") ||
        !this.configService.getBoolean("email.enableShareEmailRecipients") ||
        !this.configService.getBoolean("email.enableShareDownloadNotifications")
      )
        return;

      const notificationKey = `share-download-notification:${shareId}:${recipientId}`;
      if (await this.cache.get<true>(notificationKey)) return;

      const share = await this.prisma.share.findUnique({
        where: { id: shareId },
        select: {
          id: true,
          creator: { select: { email: true } },
          recipients: {
            where: { id: recipientId },
            select: { email: true },
          },
        },
      });

      const recipient = share?.recipients[0];
      if (!share?.creator?.email || !recipient) return;

      await this.cache.set(
        notificationKey,
        true,
        DOWNLOAD_NOTIFICATION_COOLDOWN_MS,
      );

      await this.emailService.sendShareDownloadNotification(
        share.creator.email,
        share.id,
        fileName,
        recipient.email,
      );
    } catch (e) {
      this.logger.error(
        `Failed to notify recipient download for share ${shareId}`,
        e instanceof Error ? e.stack : String(e),
      );
    }
  }

  private async streamToUint8Array(stream: Readable): Promise<Uint8Array> {
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
      stream.on("error", reject);
    });
  }
}

export interface File {
  metaData: {
    id: string;
    size: string;
    createdAt: Date;
    mimeType: string | false;
    name: string;
    shareId: string;
  };
  file: Readable;
}
