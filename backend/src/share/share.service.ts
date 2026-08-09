import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { RequestContextLogger } from "../common/request-context/request-context";
import { Prisma, Share, User, ShareSecurity } from "../../prisma/generated/prisma/client";
import argon from "argon2";
import * as crypto from "crypto";
import dayjs from "dayjs";
import { I18nService } from "nestjs-i18n";
import { ConfigService } from "../config/config.service";
import { DownloadLogService } from "../download-log/download-log.service";
import { EmailService } from "../email/email.service";
import { FileService } from "../file/file.service";
import { PrismaService } from "../prisma/prisma.service";
import { ARGON2_OPTIONS } from "../constants";
import { CreateShareDTO } from "./dto/createShare.dto";
import { ShareSecurityDTO } from "./dto/shareSecurity.dto";
import { UpdateShareDTO } from "./dto/updateShare.dto";
import { ShareMapper } from "./share.mapper";
import { ShareArchiveService } from "./share-archive.service";
import { FileStorageService } from "./file-storage.service";
import { ShareValidationService } from "./domain/share-validation.service";
import { ShareTokenService } from "./domain/share-token.service";
import { ShareLimitService } from "./domain/share-limit.service";
import { MetricsService } from "../metrics/metrics.service";

@Injectable()
export class ShareService {
  private readonly logger = new RequestContextLogger(ShareService.name);

  constructor(
    private prisma: PrismaService,
    private fileService: FileService,
    private emailService: EmailService,
    private downloadLogService: DownloadLogService,
    private readonly i18n: I18nService,
    private shareMapper: ShareMapper,
    private archiveService: ShareArchiveService,
    private storageService: FileStorageService,
    private validationService: ShareValidationService,
    private tokenService: ShareTokenService,
    private limitService: ShareLimitService,
    private config: ConfigService,
    @Optional() private metrics?: MetricsService,
  ) {}

  async create(share: CreateShareDTO, user?: User) {
    if (share.size) {
      await this.storageService.ensureSpaceAvailable(share.size);
    }

    if (!(await this.validationService.validateShareIdAvailable(share.id)).isAvailable)
      throw new BadRequestException(this.i18n.t("share.idInUse"));

    if (!share.security || Object.keys(share.security).length == 0)
      share = { ...share, security: undefined as unknown as ShareSecurityDTO };

    let generatedPassword: string | undefined;

    if (share.security?.password) {
      share.security.password = await argon.hash(share.security.password, ARGON2_OPTIONS);
    } else if (
      this.config.getBoolean("share.autoGeneratePassword") &&
      !share.security?.password
    ) {
      const length = this.config.getNumber("share.generatedPasswordLength");
      generatedPassword = this.generateRandomPassword(length);
      share.security = {
        ...share.security,
        password: await argon.hash(generatedPassword, ARGON2_OPTIONS),
      } as ShareSecurityDTO;
    }

    const expirationDate = this.validationService.parseExpiration(share.expiration);
    this.validationService.validateExpiration(expirationDate, user?.isAdmin);

    this.storageService.createShareDirectory(share.id);

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
        security: share.security
          ? { create: { password: share.security.password, maxViews: share.security.maxViews, maxDownloads: share.security.maxDownloads } }
          : undefined,
        recipients: {
          create: share.recipients
            ? [...new Set(share.recipients)].map((email) => ({ email }))
            : [],
        },
        storageProvider: "LOCAL",
      },
      include: { files: true, recipients: true, creator: true, security: true },
    });

    this.metrics?.incSharesCreated();

    return { ...shareTuple, generatedPassword };
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

    if (share.files.length > 1)
      this.archiveService.createZip(id)
        .then(() =>
          this.prisma.share.update({ where: { id }, data: { isZipReady: true } }),
        )
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `Failed to create zip for share ${id}: ${message}`,
            err instanceof Error ? err.stack : undefined,
          );
          return this.prisma.share.update({
            where: { id },
            data: { isZipReady: false },
          });
        });

    const emailResults = await Promise.allSettled(
      share.recipients.map((recipient) =>
        this.emailService.sendMailToShareRecipients(
          recipient.email,
          recipient.id,
          share.id,
          share.creator ?? undefined,
          share.description ?? undefined,
          share.expiration ?? undefined,
        ),
      ),
    );

    for (const result of emailResults) {
      if (result.status === "rejected") {
        this.logger.error(
          `Failed to send completion email for share ${share.id}: ${
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason)
          }`,
          result.reason instanceof Error ? result.reason.stack : undefined,
        );
      }
    }

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

  async getShares(page: number, perPage: number) {
    const [shares, total] = await Promise.all([
      this.prisma.share.findMany({
        orderBy: { expiration: "desc" },
        include: { files: true, creator: true, security: true, recipients: true },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.share.count(),
    ]);

    return {
      items: shares.map((share) => this.shareMapper.transformShare(share)),
      total,
      page,
      perPage,
    };
  }

  async getSharesByUser(userId: string, page: number, perPage: number) {
    const where = {
      creator: { id: userId },
      uploadLocked: true,
      OR: [
        { expiration: { gt: new Date() } },
        { expiration: { equals: null } },
      ],
    };

    const [shares, total] = await Promise.all([
      this.prisma.share.findMany({
        where,
        orderBy: { expiration: "desc" },
        include: { recipients: true, files: true, security: true, creator: true },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.share.count({ where }),
    ]);

    return {
      items: shares.map((share) => this.shareMapper.transformShare(share)),
      total,
      page,
      perPage,
    };
  }

  async get(id: string) {
    const share = await this.prisma.share.findUnique({
      where: { id },
      include: {
        files: { orderBy: { name: "asc" } },
        creator: true,
        security: true,
      },
    });

    if (share?.removedReason)
      throw new NotFoundException(share.removedReason, "share_removed");

    if (!share || !share.uploadLocked)
      throw new NotFoundException(this.i18n.t("share.notFound"));

    return this.shareMapper.transformShare(share);
  }

  async getMetaData(id: string) {
    const share = await this.prisma.share.findUnique({ where: { id } });

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

    this.validationService.validateCreatorAccess(share, isDeleterAdmin, "delete");

    if (actor) {
      for (const file of share.files ?? []) {
        void this.downloadLogService.record({
          shareId,
          fileId: file.id,
          fileName: file.name,
          fileSize: file.size.toString(),
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
    const share = await this.prisma.share.findUnique({ where: { id: shareId } });

    if (!share) throw new NotFoundException(this.i18n.t("share.notFound"));

    this.validationService.validateCreatorAccess(share, false, "expire");

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
    this.validationService.validateCreatorAccess(currentShare, isUpdaterAdmin, "update");

    let expirationDate: Date | null | undefined;
    if (body.expiration !== undefined) {
      expirationDate = this.validationService.parseExpiration(body.expiration);
      this.validationService.validateExpiration(expirationDate, isUpdaterAdmin);
    }

    const data: Prisma.ShareUpdateInput = {
      name: body.name !== undefined ? body.name || null : undefined,
      description: body.description !== undefined ? body.description || null : undefined,
      expiration: expirationDate,
    };

    await this.prisma.share.update({ where: { id: shareId }, data });

    if (body.security) {
      await this.updateSecurity(shareId, body, currentShare.security ?? undefined);
    }

    const updatedShare = await this.prisma.share.findUnique({
      where: { id: shareId },
      include: { creator: true, files: true, recipients: true, security: true },
    });

    if (!updatedShare) throw new NotFoundException(this.i18n.t("share.notFound"));
    return this.shareMapper.transformShare(updatedShare);
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
    const nextMaxViews = body.security.maxViews !== undefined ? body.security.maxViews : currentSecurity?.maxViews;
    const nextMaxDownloads = body.security.maxDownloads !== undefined ? body.security.maxDownloads : currentSecurity?.maxDownloads;

    if (nextPassword == null && nextMaxViews == null && nextMaxDownloads == null) {
      if (currentSecurity) {
        await this.prisma.shareSecurity.delete({ where: { shareId } });
      }
      return;
    }

    await this.prisma.shareSecurity.upsert({
      where: { shareId },
      create: {
        shareId,
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

  async increaseViewCount(
    share: Share & { security?: { maxViews?: number | null } | null },
    context?: { ip?: string; userAgent?: string | null },
  ) {
    const ip = context?.ip ?? "unknown";
    const maxViews = share.security?.maxViews;

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
      include: { security: true },
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

      const isPasswordValid = await argon.verify(share.security.password, password);
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

    const token = await this.tokenService.generateShareToken({ ...share, security: share.security ?? undefined });
    return token;
  }

  async verifyShareToken(
    share: Share & { security?: ShareSecurity },
    token: string,
  ) {
    return this.tokenService.verifyShareToken(share, token);
  }

  async isShareIdAvailable(id: string) {
    return this.validationService.validateShareIdAvailable(id);
  }

  private generateRandomPassword(length: number): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    const bytes = crypto.randomBytes(length);
    return Array.from(bytes).map((b) => chars[b % chars.length]).join("");
  }
}
