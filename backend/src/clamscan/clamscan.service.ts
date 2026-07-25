import { Injectable, Logger } from "@nestjs/common";
import NodeClam from "clamscan";
import * as fs from "fs";
import { FileService } from "../file/file.service";
import { PrismaService } from "../prisma/prisma.service";
import { CLAMAV_HOST, CLAMAV_PORT, SHARE_DIRECTORY } from "../constants";

const clamscanConfig = {
  clamdscan: {
    host: CLAMAV_HOST,
    port: CLAMAV_PORT,
    localFallback: false,
  },
  preference: "clamdscan",
};
@Injectable()
export class ClamScanService {
  private readonly logger = new Logger(ClamScanService.name);

  constructor(
    private fileService: FileService,
    private prisma: PrismaService,
  ) {}

  private ClamScan: Promise<NodeClam | null> = new NodeClam()
    .init(clamscanConfig)
    .then((res: NodeClam | null) => {
      this.logger.log("ClamAV is active");
      return res;
    })
    .catch((): null => {
      this.logger.log("ClamAV is not active");
      return null;
    });

  async check(shareId: string) {
    const clamScan = await this.ClamScan;

    if (!clamScan) {
      return [];
    }

    const infectedFiles = [];

    let files: string[] = [];
    try {
      files = fs
        .readdirSync(`${SHARE_DIRECTORY}/${shareId}`)
        .filter((file) => file != "archive.zip");
    } catch (e) {
      void e;
      return [];
    }

    for (const fileId of files) {
      const { isInfected } = await clamScan.isInfected(
        `${SHARE_DIRECTORY}/${shareId}/${fileId}`,
      );

      const fileName = (
        await this.prisma.file.findUnique({ where: { id: fileId } })
      )?.name ?? "unknown";

      if (isInfected) {
        infectedFiles.push({ id: fileId, name: fileName });
      }
    }

    return infectedFiles;
  }

  async checkAndRemove(shareId: string) {
    let infectedFiles: { id: string; name: string }[];
    try {
      infectedFiles = await this.check(shareId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "unknown error";
      this.logger.error(
        `ClamAV scan failed for share ${shareId}: ${message}. Share kept online.`,
      );
      return;
    }

    if (infectedFiles.length > 0) {
      try {
        await this.fileService.deleteAllFiles(shareId);
        await this.prisma.file.deleteMany({ where: { shareId } });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "unknown error";
        this.logger.error(
          `Failed to delete malicious share ${shareId}: ${message}`,
        );
        return;
      }

      const fileNames = infectedFiles.map((file) => file.name).join(", ");

      await this.prisma.share.update({
        where: { id: shareId },
        data: {
          removedReason: `Your share got removed because the file(s) ${fileNames} are malicious.`,
        },
      });

      this.logger.warn(
        `Share ${shareId} deleted because it contained ${infectedFiles.length} malicious file(s)`,
      );
    }
  }
}
