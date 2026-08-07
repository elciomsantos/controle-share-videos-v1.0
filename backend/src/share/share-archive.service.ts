import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "../config/config.service";
import { PrismaService } from "../prisma/prisma.service";
import { SHARE_DIRECTORY } from "../constants";
import { createZipStream } from "../common/zip";
import { toBytes } from "./dto/share.dto";
import * as fs from "fs";

@Injectable()
export class ShareArchiveService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async createZip(shareId: string) {
    const path = `${SHARE_DIRECTORY}/${shareId}`;

    // GAP-04: zip-bomb protection — limits are now admin-configurable via
    // share.zipMaxFiles / share.zipMaxTotalSize / share.zipMaxRatio.
    const MAX_FILES = this.config.getNumber("share.zipMaxFiles") ?? 10000;
    const MAX_TOTAL_SIZE = this.config.getNumber("share.zipMaxTotalSize") ?? 10 * 1024 * 1024 * 1024;
    // Maximum allowed compression ratio (output / input). 103:1 is the classic
    // zip-bomb threshold (zlib's theoretical deflate worst-case is ~1037:1 for
    // highly compressible streams); 103 catches naive 42.zip-style bombs while
    // leaving plenty of headroom for genuinely redundant content.
    const MAX_RATIO = this.config.getNumber("share.zipMaxRatio") ?? 103;

    const files = await this.prisma.file.findMany({ where: { shareId } });

    if (files.length > MAX_FILES) {
      throw new BadRequestException(
        `Share exceeds maximum file count of ${MAX_FILES}`,
      );
    }

    const totalSize = files.reduce((sum, f) => sum + toBytes(f.size), 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      throw new BadRequestException(
        `Share exceeds maximum total size of ${MAX_TOTAL_SIZE} bytes`,
      );
    }

    const archive = await createZipStream({
      zlib: { level: this.config.getNumber("share.zipCompressionLevel") },
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
}
