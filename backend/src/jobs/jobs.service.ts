import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { promises as fsp, type Dirent } from "fs";
import dayjs from "dayjs";
import { FileService } from "../file/file.service";
import { PrismaService } from "../prisma/prisma.service";
import { ConfigService } from "../config/config.service";
import { SHARE_DIRECTORY } from "../constants";

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private prisma: PrismaService,
    private fileService: FileService,
    private configServer: ConfigService,
  ) {}

  @Cron("* * * * *")
  async deleteExpiredShares() {
    const fileRetentionPeriod = this.configServer.getTimespan(
      "share.fileRetentionPeriod",
    );

    if (fileRetentionPeriod.value === -1) {
      return;
    }

    const thresholdDate = dayjs()
      .subtract(fileRetentionPeriod.value, fileRetentionPeriod.unit)
      .toDate();

    let deleted = 0;
    let lastId: string | undefined;

    while (true) {
      const batch = await this.prisma.share.findMany({
        where: {
          // We want to remove only shares that have an actual expiration date
          // (not null, which represents "never expires" — see BDB-05) and
          // whose retention period has elapsed.
          AND: [
            { expiration: { lt: thresholdDate } },
            { expiration: { not: null } },
          ],
          id: lastId ? { gt: lastId } : undefined,
        },
        orderBy: { id: "asc" },
        take: 50,
        select: { id: true },
      });

      if (batch.length === 0) break;

      for (const { id } of batch) {
        try {
          await this.fileService.deleteAllFiles(id);
          await this.prisma.share.deleteMany({ where: { id } });
          deleted++;
        } catch (err) {
          this.logger.error(
            `Falha ao limpar share expirado ${id}: ${err instanceof Error ? err.stack : String(err)}`,
          );
        }
      }

      lastId = batch[batch.length - 1].id;
    }

    if (deleted > 0) {
      this.logger.log(`Deleted ${deleted} expired shares`);
    }
  }

  @Cron("0 */6 * * *")
  async deleteUnfinishedShares() {
    const cutoff = dayjs().subtract(1, "day").toDate();
    let deleted = 0;
    let lastId: string | undefined;

    while (true) {
      const batch = await this.prisma.share.findMany({
        where: {
          uploadLocked: false,
          OR: [
            { updatedAt: { lt: cutoff } },
            { updatedAt: { equals: null }, createdAt: { lt: cutoff } },
          ],
          id: lastId ? { gt: lastId } : undefined,
        },
        orderBy: { id: "asc" },
        take: 50,
        select: { id: true },
      });

      if (batch.length === 0) break;

      for (const { id } of batch) {
        try {
          await this.fileService.deleteAllFiles(id);
          await this.prisma.share.deleteMany({ where: { id } });
          deleted++;
        } catch (err) {
          this.logger.error(
            `Falha ao limpar share inacabado ${id}: ${err instanceof Error ? err.stack : String(err)}`,
          );
        }
      }

      lastId = batch[batch.length - 1].id;
    }

    if (deleted > 0) {
      this.logger.log(`Deleted ${deleted} unfinished shares`);
    }
  }

  @Cron("0 0 * * *")
  async deleteTemporaryFiles() {
    let filesDeleted = 0;

    let shareDirectories: Dirent[];
    try {
      shareDirectories = (await fsp.readdir(SHARE_DIRECTORY, {
        withFileTypes: true,
      })).filter((dirent) => dirent.isDirectory());
    } catch (err) {
      this.logger.error(
        `Falha ao ler diretório de shares ${SHARE_DIRECTORY}: ${err instanceof Error ? err.stack : String(err)}`,
      );
      return;
    }

    for (const shareDirectory of shareDirectories) {
      try {
        const entries = await fsp.readdir(`${SHARE_DIRECTORY}/${shareDirectory.name}`);
        const temporaryFiles = entries.filter((file) =>
          file.endsWith(".tmp-chunk"),
        );

        for (const file of temporaryFiles) {
          const filePath = `${SHARE_DIRECTORY}/${shareDirectory.name}/${file}`;
          try {
            const stats = await fsp.stat(filePath);
            const isOlderThanOneDay = dayjs(stats.mtime)
              .add(1, "day")
              .isBefore(dayjs());

            if (isOlderThanOneDay) {
              await fsp.rm(filePath);
              filesDeleted++;
            }
          } catch (err) {
            this.logger.error(
              `Falha ao processar arquivo temporário ${filePath}: ${err instanceof Error ? err.stack : String(err)}`,
            );
          }
        }
      } catch (err) {
        this.logger.error(
          `Falha ao ler diretório de share ${shareDirectory.name}: ${err instanceof Error ? err.stack : String(err)}`,
        );
      }
    }

    if (filesDeleted > 0) {
      this.logger.log(`Deleted ${filesDeleted} temporary files`);
    }
  }

  @Cron("1 * * * *")
  async deleteExpiredTokens() {
    const { count: refreshTokenCount } =
      await this.prisma.refreshToken.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });

    const { count: loginTokenCount } = await this.prisma.loginToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    const { count: resetPasswordTokenCount } =
      await this.prisma.resetPasswordToken.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });

    const deletedTokensCount =
      refreshTokenCount + loginTokenCount + resetPasswordTokenCount;

    if (deletedTokensCount > 0) {
      this.logger.log(`Deleted ${deletedTokensCount} expired refresh tokens`);
    }
  }

  @Cron("0 2 * * *")
  async deleteExpiredDownloadLogs() {
    const retentionDays = this.configServer.getNumber(
      "share.downloadLogRetentionDays",
    );

    if (retentionDays <= 0) {
      return;
    }

    const thresholdDate = dayjs().subtract(retentionDays, "day").toDate();

    const { count } = await this.prisma.downloadLog.deleteMany({
      where: { createdAt: { lt: thresholdDate } },
    });

    if (count > 0) {
      this.logger.log(
        `Deleted ${count} download log entries older than ${retentionDays} days`,
      );
    }
  }

  @Cron("0 * * * *")
  async deleteUnactivatedUsers() {
    const cutoff = dayjs().subtract(24, "hours").toDate();
    let deleted = 0;
    let lastId: string | undefined;

    while (true) {
      const batch = await this.prisma.user.findMany({
        where: {
          isActivated: false,
          createdAt: { lt: cutoff },
          id: lastId ? { gt: lastId } : undefined,
        },
        orderBy: { id: "asc" },
        take: 50,
        select: { id: true, shares: { select: { id: true } } },
      });

      if (batch.length === 0) break;

      for (const user of batch) {
        try {
          await Promise.all(
            user.shares.map((share) => this.fileService.deleteAllFiles(share.id)),
          );
          await this.prisma.user.deleteMany({ where: { id: user.id } });
          deleted++;
        } catch (err) {
          this.logger.error(
            `Falha ao limpar usuário inativo ${user.id}: ${err instanceof Error ? err.stack : String(err)}`,
          );
        }
      }

      lastId = batch[batch.length - 1].id;
    }

    if (deleted > 0) {
      this.logger.log(`Deleted ${deleted} unactivated users`);
    }
  }
}
