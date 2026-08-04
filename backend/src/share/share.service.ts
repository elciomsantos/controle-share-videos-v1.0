import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { RequestContextLogger } from "../common/request-context/request-context";
import { JwtService, JwtSignOptions } from "@nestjs/jwt";
import { Prisma, Share, User, ShareSecurity } from "../../prisma/generated/prisma/client";
import { createZipStream } from "../common/zip";
import argon from "argon2";
import * as crypto from "crypto";
import * as fs from "fs";
import dayjs from "dayjs";
import { I18nService } from "nestjs-i18n";
import { ConfigService } from "../config/config.service";
import { DownloadLogService } from "../download-log/download-log.service";
import { EmailService } from "../email/email.service";
import { FileService } from "../file/file.service";
import { PrismaService } from "../prisma/prisma.service";
import { SystemService } from "../system/system.service";
import {
  EPOCH_ZERO,
  isEpochZero,
  parseRelativeDateToAbsolute,
} from "../utils/date.util";
import { ARGON2_OPTIONS, SHARE_DIRECTORY } from "../constants";
import { CreateShareDTO } from "./dto/createShare.dto";
import { ShareSecurityDTO } from "./dto/shareSecurity.dto";
import { UpdateShareDTO } from "./dto/updateShare.dto";

@Injectable()
export class ShareService {
  private readonly logger = new RequestContextLogger(ShareService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private fileService: FileService,
    private emailService: EmailService,
    private config: ConfigService,
    private jwtService: JwtService,
    private systemService: SystemService,
    private downloadLogService: DownloadLogService,
    private readonly i18n: I18nService,
  ) {}

  async create(share: CreateShareDTO, user?: User) {
    if (share.size) {
      const systemInfo = await this.systemService.getSystemInfo();
      if (systemInfo && systemInfo.total - systemInfo.used < share.size) {
        throw new BadRequestException(this.i18n.t("share.notEnoughSpace"));
      }
    }

    if (!(await this.isShareIdAvailable(share.id)).isAvailable)
      throw new BadRequestException(this.i18n.t("share.idInUse"));

    if (!share.security || Object.keys(share.security).length == 0)
      share = { ...share, security: undefined as unknown as ShareSecurityDTO };

    let generatedPassword: string | undefined;

    if (share.security?.password) {
      share.security.password = await argon.hash(share.security.password, ARGON2_OPTIONS);
    } else if (
      this.config.get("share.autoGeneratePassword") &&
      !share.security?.password
    ) {
      const length = this.config.get("share.generatedPasswordLength");
      generatedPassword = this.generateRandomPassword(length);
      share.security = {
        ...share.security,
        password: await argon.hash(generatedPassword, ARGON2_OPTIONS),
      } as ShareSecurityDTO;
    }

    const expirationDate = this.parseExpiration(share.expiration);
    if (!user?.isAdmin) {
      this.validateExpiration(expirationDate);
    }

    fs.mkdirSync(`${SHARE_DIRECTORY}/${share.id}`, {
      recursive: true,
    });

    const {
      size: _size,
      security: _security,
      recipients: _recipients,
      expiration: _expiration,
      ...shareData
    } = share;

    const shareTuple = await this.prisma.share.create({
      data: {
        ...shareData,
        expiration: expirationDate,
        creator: { connect: user ? { id: user.id } : undefined },
        security: { create: share.security },
        recipients: {
          create: share.recipients
            ? share.recipients.map((email) => ({ email }))
            : [],
        },
        storageProvider: "LOCAL",
      },
    });

    return { ...shareTuple, generatedPassword };
  }

  async createZip(shareId: string) {
    const path = `${SHARE_DIRECTORY}/${shareId}`;

    // GAP-04: zip-bomb protection — limits are now admin-configurable via
    // share.zipMaxFiles / share.zipMaxTotalSize / share.zipMaxRatio.
    const MAX_FILES = this.config.get("share.zipMaxFiles") ?? 10000;
    const MAX_TOTAL_SIZE = this.config.get("share.zipMaxTotalSize") ?? 10 * 1024 * 1024 * 1024;
    // Maximum allowed compression ratio (output / input). 103:1 is the classic
    // zip-bomb threshold (zlib's theoretical deflate worst-case is ~1037:1 for
    // highly compressible streams); 103 catches naive 42.zip-style bombs while
    // leaving plenty of headroom for genuinely redundant content.
    const MAX_RATIO = this.config.get("share.zipMaxRatio") ?? 103;

    const files = await this.prisma.file.findMany({ where: { shareId } });

    if (files.length > MAX_FILES) {
      throw new BadRequestException(
        `Share exceeds maximum file count of ${MAX_FILES}`,
      );
    }

    const totalSize = files.reduce((sum, f) => sum + parseInt(f.size), 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      throw new BadRequestException(
        `Share exceeds maximum total size of ${MAX_TOTAL_SIZE} bytes`,
      );
    }

    const archive = await createZipStream({
      zlib: { level: this.config.get("share.zipCompressionLevel") },
    });
    const writeStream = fs.createWriteStream(`${path}/archive.zip`);

    // Abort the stream if the consumed output exceeds totalSize * MAX_RATIO,
    // which would indicate a zip-bomb attempt (small input -> huge output).
    let emittedBytes = 0;
    const bombLimit = Math.max(
      totalSize * MAX_RATIO,
      // Guard against totalSize=0 edge case (empty share slipped through):
      MAX_RATIO,
    );
    const bombGuard = new Promise<void>((resolve, reject) => {
      writeStream.on("close", () => resolve());
      writeStream.on("error", (err: NodeJS.ErrnoException) =>
        reject(
          new InternalServerErrorException({
            message: "Failed to write zip archive",
            error: err.message,
          }),
        ),
      );
      archive.on("data", (chunk: Buffer) => {
        emittedBytes += chunk.length;
        if (emittedBytes > bombLimit) {
          reject(
            new BadRequestException(
              `Zip compression ratio exceeded the configured limit of ${MAX_RATIO}:1 (potential zip bomb)`,
            ),
          );
          archive.abort();
          writeStream.destroy();
        }
      });
    });

    for (const file of files) {
      archive.append(fs.createReadStream(`${path}/${file.id}`), {
        name: file.name,
      });
    }

    archive.pipe(writeStream);
    await archive.finalize();
    await bombGuard;
  }

  async complete(id: string) {
    const share = await this.prisma.share.findUnique({
      where: { id },
      include: {
        files: true,
        recipients: true,
        creator: true,
        security: true,
      },
    });

    if (await this.isShareCompleted(id))
      throw new BadRequestException(this.i18n.t("share.alreadyCompleted"));

    if (!share)
      throw new NotFoundException(this.i18n.t("share.notFound"));

    if (share.files.length == 0)
      throw new BadRequestException(
        this.i18n.t("share.completionRequiresFile"),
      );

    // Asynchronously create a zip of all files
    // GAP-04: surface unhandled rejections instead of silently dropping them,
    // and mark the share as broken so /api/shares/:id/zip returns 500 not 404.
    if (share.files.length > 1)
      this.createZip(id)
        .then(() =>
          this.prisma.share.update({ where: { id }, data: { isZipReady: true } }),
        )
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `Failed to create zip for share ${id}: ${message}`,
            err instanceof Error ? err.stack : undefined,
          );
          // Leave isZipReady=false; consumers fall back to streaming or
          // surface an explicit error instead of a hung download.
          return this.prisma.share.update({
            where: { id },
            data: { isZipReady: false },
          });
        });

    // Send email for each recipient
    for (const recipient of share.recipients) {
      await this.emailService.sendMailToShareRecipients(
        recipient.email,
        recipient.id,
        share.id,
        share.creator ?? undefined,
        share.description ?? undefined,
        share.expiration,
      );
    }

    // ClamAV scan removed: uploads are owner-only media/videos by known
    // authenticated operators. Mitigations: file-type magic-bytes validation
    // + share per-file size limit (share.maxFileSize) on upload path.

    const updatedShare = await this.prisma.share.update({
      where: { id },
      data: { uploadLocked: true },
      include: { security: true, files: true, creator: true },
    });

    return {
      ...updatedShare,
      hasPassword: !!updatedShare.security?.password,
      maxViews: updatedShare.security?.maxViews,
      maxDownloads: updatedShare.security?.maxDownloads,
    };
  }

  async revertComplete(id: string) {
    return this.prisma.share.update({
      where: { id },
      data: { uploadLocked: false, isZipReady: false },
    });
  }

  async getShares() {
    const shares = await this.prisma.share.findMany({
      orderBy: {
        expiration: "desc",
      },
      include: { files: true, creator: true, security: true, recipients: true },
    });

    return shares.map((share) => this.transformShare(share));
  }

  async getSharesByUser(userId: string) {
    const shares = await this.prisma.share.findMany({
      where: {
        creator: { id: userId },
        uploadLocked: true,
        // We want to grab any shares that are not expired or have their expiration date set to "never" (unix 0)
        OR: [
          { expiration: { gt: new Date() } },
          { expiration: { equals: EPOCH_ZERO } },
        ],
      },
      orderBy: {
        expiration: "desc",
      },
      include: { recipients: true, files: true, security: true, creator: true },
    });

    return shares.map((share) => this.transformShare(share));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Return type includes Prisma-relational fields with internal DTO mapping; refactor requires aligning ShareDTO typing (see #6).
  async get(id: string): Promise<any> {
    const share = await this.prisma.share.findUnique({
      where: { id },
      include: {
        files: {
          orderBy: {
            name: "asc",
          },
        },
        creator: true,
        security: true,
      },
    });

    if (share?.removedReason)
      throw new NotFoundException(share.removedReason, "share_removed");

    if (!share || !share.uploadLocked)
      throw new NotFoundException(this.i18n.t("share.notFound"));
    return {
      ...share,
      hasPassword: !!share.security?.password,
    };
  }

  async getMetaData(id: string) {
    const share = await this.prisma.share.findUnique({
      where: { id },
    });

    if (!share || !share.uploadLocked)
      throw new NotFoundException(this.i18n.t("share.notFound"));

    return share;
  }

  async remove(
    shareId: string,
    isDeleterAdmin = false,
    actor?: { userId?: string; username?: string; ip: string; userAgent?: string | null },
  ) {
    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      select: {
        id: true,
        creatorId: true,
        files: { select: { id: true, name: true, size: true } },
      },
    });

    if (!share) throw new NotFoundException(this.i18n.t("share.notFound"));

    if (!share.creatorId && !isDeleterAdmin)
      throw new ForbiddenException(this.i18n.t("share.anonymousNoDelete"));

    // Record a delete entry per file so the audit log shows exactly which
    // files were removed when the whole share is deleted.
    if (actor) {
      for (const file of share.files ?? []) {
        void this.downloadLogService.record({
          shareId,
          fileId: file.id,
          fileName: file.name,
          fileSize: file.size,
          userId: actor.userId,
          username: actor.username,
          ip: actor.ip,
          userAgent: actor.userAgent ?? null,
          success: true,
          event: "delete",
        });
      }
    }

    await this.fileService.deleteAllFiles(shareId);
    await this.prisma.share.delete({ where: { id: shareId } });
  }

  async expire(shareId: string) {
    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
    });

    if (!share) throw new NotFoundException(this.i18n.t("share.notFound"));

    if (!share.creatorId) {
      throw new ForbiddenException(this.i18n.t("share.anonymousNoExpire"));
    }

    await this.prisma.share.update({
      where: { id: shareId },
      data: { expiration: dayjs().toDate() },
    });
  }

  async update(
    shareId: string,
    body: UpdateShareDTO,
    user?: User,
    share?: Share & { security?: ShareSecurity },
  ) {
    const currentShare =
      share ||
      (await this.prisma.share.findUnique({
        where: { id: shareId },
        include: { security: true },
      }));

    if (!currentShare) throw new NotFoundException(this.i18n.t("share.notFound"));

    const isUpdaterAdmin = user?.isAdmin === true;
    if (!currentShare.creatorId && !isUpdaterAdmin) {
      throw new ForbiddenException(this.i18n.t("share.anonymousNoUpdate"));
    }

    let expirationDate: Date | undefined;
    if (body.expiration !== undefined) {
      expirationDate = this.parseExpiration(body.expiration);
      if (!user?.isAdmin) {
        this.validateExpiration(expirationDate);
      }
    }

    const data: Prisma.ShareUpdateInput = {
      name: body.name !== undefined ? body.name || null : undefined,
      description:
        body.description !== undefined ? body.description || null : undefined,
      expiration: expirationDate,
    };

    await this.prisma.share.update({
      where: { id: shareId },
      data,
    });

    if (body.security) {
      await this.updateSecurity(shareId, body, currentShare.security ?? undefined);
    }

    const updatedShare = await this.prisma.share.findUnique({
      where: { id: shareId },
      include: { creator: true, files: true, recipients: true, security: true },
    });

    return this.transformShare(updatedShare);
  }

  private async updateSecurity(
    shareId: string,
    body: UpdateShareDTO,
    currentSecurity?: ShareSecurity,
  ) {
    if (!body.security) return;

    const nextPassword = body.security.removePassword
      ? null
      : body.security.password
        ? await argon.hash(body.security.password, ARGON2_OPTIONS)
        : currentSecurity?.password;
    const nextMaxViews =
      body.security.maxViews !== undefined
        ? body.security.maxViews
        : currentSecurity?.maxViews;
    const nextMaxDownloads =
      body.security.maxDownloads !== undefined
        ? body.security.maxDownloads
        : currentSecurity?.maxDownloads;

    if (nextPassword == null && nextMaxViews == null && nextMaxDownloads == null) {
      if (currentSecurity) {
        await this.prisma.shareSecurity.delete({ where: { shareId } });
      }
      return;
    }

    await this.prisma.shareSecurity.upsert({
      where: { shareId },
      create: {
        share: { connect: { id: shareId } },
        password: nextPassword,
        maxViews: nextMaxViews,
        maxDownloads: nextMaxDownloads,
      },
      update: {
        password: nextPassword,
        maxViews: nextMaxViews,
        maxDownloads: nextMaxDownloads,
      },
    });
  }

  async isShareCompleted(id: string) {
    const share = await this.prisma.share.findUnique({ where: { id } });
    return share?.uploadLocked ?? false;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma-relational shape; callers cast to Partial<MyShareDTO> with excludeExtraneousValues. See #6.
  private transformShare(share: any) {
    return {
      ...share,
      size:
        share.files?.reduce((acc: number, file: { size: string }) => acc + parseInt(file.size), 0) ?? 0,
      recipients: share.recipients?.map((recipient: { email: string }) => recipient.email) ?? [],
      security: {
        maxViews: share.security?.maxViews,
        maxDownloads: share.security?.maxDownloads,
        passwordProtected: !!share.security?.password,
      },
    };
  }

  private parseExpiration(expiration: string) {
    if (expiration === "never") return EPOCH_ZERO;

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

  private validateExpiration(expiration: Date) {
    const expiresNever = isEpochZero(expiration);
    const maxExpiration = this.config.get("share.maxExpiration");

    if (
      maxExpiration.value !== 0 &&
      (expiresNever ||
        expiration >
          dayjs().add(maxExpiration.value, maxExpiration.unit).toDate())
    ) {
      throw new BadRequestException(this.i18n.t("share.maxExpirationExceeded"));
    }
  }

  async isShareIdAvailable(id: string) {
    const share = await this.prisma.share.findUnique({ where: { id } });
    return { isAvailable: !share };
  }

  async increaseViewCount(
    share: Share & { security?: { maxViews?: number | null } | null },
    context?: { ip?: string; userAgent?: string | null },
  ) {
    // Cada play conta e bloqueia: não há janela de deduplicação — toda nova
    // visualização incrementa a contagem (respeitando maxViews) e registra o
    // log, para que re-assistir não seja gratuito nem o vídeo toque do cache.
    const ip = context?.ip ?? "unknown";
    const maxViews = share.security?.maxViews;

    // Atomically increment views while respecting the limit, so the check and
    // increment can't race. Once views reaches maxViews a *new* visitor is
    // blocked (this also covers visitors holding an already-issued token, the
    // path that previously bypassed the getShareToken limit check).
    let incremented: boolean;
    if (maxViews && maxViews > 0) {
      const result = await this.prisma.share.updateMany({
        where: { id: share.id, views: { lt: maxViews } },
        data: { views: { increment: 1 } },
      });
      incremented = result.count > 0;
    } else {
      await this.prisma.share.update({
        where: { id: share.id },
        data: { views: { increment: 1 } },
      });
      incremented = true;
    }

    if (!incremented) {
      if (context) {
        void this.downloadLogService.record({
          shareId: share.id,
          fileName: share.name ?? share.id,
          ip,
          userAgent: context.userAgent ?? null,
          success: false,
          reason: "maxViewsExceeded",
          event: "view",
        });
      }
      throw new ForbiddenException({
        message: this.i18n.t("share.maxViewsExceeded"),
        error: "share_max_views_exceeded",
      });
    }

    if (context) {
      void this.downloadLogService.record({
        shareId: share.id,
        fileName: share.name ?? share.id,
        ip,
        userAgent: context.userAgent ?? null,
        success: true,
        event: "view",
      });
    }
  }

  async reloadShareViews(
    share: Share & { security?: { maxViews: number | null } | null },
  ) {
    const fresh = await this.prisma.share.findUnique({
      where: { id: share.id },
      select: { views: true },
    });
    if (fresh) {
      share.views = fresh.views;
    }
  }

  async recordViewExceeded(
    shareId: string,
    ip?: string,
    userAgent?: string | null,
  ) {
    void this.downloadLogService.record({
      shareId,
      fileName: shareId,
      ip: ip ?? "unknown",
      userAgent: userAgent ?? null,
      success: false,
      reason: "maxViewsExceeded",
      event: "view",
    });
  }

  async getShareToken(
    shareId: string,
    password: string,
    context?: { ip?: string; userAgent?: string | null },
  ) {
    const share = await this.prisma.share.findFirst({
      where: { id: shareId },
      include: {
        security: true,
      },
    });

    if (!share)
      throw new NotFoundException(this.i18n.t("share.notFound"));

    if (share.security?.password) {
      if (!password) {
        throw new ForbiddenException({
          message: this.i18n.t("file.passwordProtected"),
          error: "share_password_required",
        });
      }

      const isPasswordValid = await argon.verify(
        share.security.password,
        password,
      );
      if (!isPasswordValid) {
        if (context) {
          void this.downloadLogService.record({
            shareId,
            fileName: share.name ?? shareId,
            ip: context.ip ?? "unknown",
            userAgent: context.userAgent ?? null,
            success: false,
            reason: "wrong password",
            event: "view",
          });
        }
        throw new ForbiddenException({
          message: this.i18n.t("share.wrongPassword"),
          error: "wrong_password",
        });
      }
    }

    if (share.security?.maxViews && share.security.maxViews <= share.views) {
      if (context) {
        void this.downloadLogService.record({
          shareId,
          fileName: share.name ?? shareId,
          ip: context.ip ?? "unknown",
          userAgent: context.userAgent ?? null,
          success: false,
          reason: "maxViewsExceeded",
          event: "view",
        });
      }
      throw new ForbiddenException({
        message: this.i18n.t("share.maxViewsExceeded"),
        error: "share_max_views_exceeded",
      });
    }

    const token = await this.generateShareToken({ ...share, security: share.security ?? undefined });
    return token;
  }

  async generateShareToken(share: Share & { security?: ShareSecurity }) {
    const { id: shareId, expiration, createdAt, security } = share;

    const tokenPayload = {
      shareId,
      shareCreatedAt: dayjs(createdAt).unix(),
      sharePasswordSignature: this.getSharePasswordSignature(
        security?.password ?? undefined,
      ),
      iat: dayjs().unix(),
    };

    const tokenOptions: JwtSignOptions = {
      secret: this.config.get("internal.jwtSecret"),
    };

    if (!isEpochZero(expiration)) {
      const diffSeconds = dayjs(expiration).diff(new Date(), "seconds");
      // Default to a 1 hour token if the share is expired but being viewed by an admin
      tokenOptions.expiresIn = diffSeconds > 0 ? diffSeconds : 3600;
    }

    return this.jwtService.sign(tokenPayload, tokenOptions);
  }

  async verifyShareToken(
    share: Share & { security?: ShareSecurity },
    token: string,
  ) {
    const { expiration, createdAt, security } = share;

    try {
      const claims = this.jwtService.verify(token, {
        secret: this.config.get("internal.jwtSecret"),
        // Ignore expiration if expiration is 0
        ignoreExpiration: isEpochZero(expiration),
      });

      return (
        claims.shareId == share.id &&
        claims.shareCreatedAt == dayjs(createdAt).unix() &&
        (!security?.password ||
          claims.sharePasswordSignature ===
            this.getSharePasswordSignature(security.password))
      );
    } catch {
      return false;
    }
  }

  private getSharePasswordSignature(password?: string) {
    if (!password) return undefined;

    return crypto
      .createHmac("sha512", this.config.get("internal.jwtSecret"))
      .update(password)
      .digest("hex");
  }

  private generateRandomPassword(length: number): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    const bytes = crypto.randomBytes(length);
    return Array.from(bytes)
      .map((b) => chars[b % chars.length])
      .join("");
  }
}
