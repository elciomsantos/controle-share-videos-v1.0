import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import * as crypto from "crypto";
import { createReadStream } from "fs";
import * as fs from "fs/promises";
import { fileTypeFromBuffer } from "file-type";
import mime from "mime-types";
import { I18nService } from "nestjs-i18n";
import { ConfigService } from "../config/config.service";
import { PrismaService } from "../prisma/prisma.service";
import { RequestContextLogger } from "../common/request-context/request-context";
import { validate as isValidUUID } from "uuid";
import { SHARE_DIRECTORY } from "../constants";
import { Readable } from "stream";
import { createZipStream } from "../common/zip";
import { toBytes } from "../share/dto/share.dto";

@Injectable()
export class LocalFileService {
  private readonly logger = new RequestContextLogger(LocalFileService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private readonly i18n: I18nService,
  ) {}

  async create(
    data: string,
    chunk: { index: number; total: number },
    file: { id?: string; name: string; description?: string },
    shareId: string,
  ) {
    if (!file.id) {
      file.id = crypto.randomUUID();
    } else if (!isValidUUID(file.id)) {
      throw new BadRequestException(this.i18n.t("file.invalidIdFormat"));
    }

    // MIME-type allow-list for uploads (MED-06).
    // GAP-01: in addition to the extension allowlist, magic bytes are
    // validated on the final chunk (see create() below) so a .mp4 file whose
    // bytes are actually an EXE is rejected regardless of the extension.
    const ALLOWED_EXTENSIONS = new Set([
      // Documents
      ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
      ".odt", ".ods", ".odp", ".rtf", ".csv", ".tsv",
      // Images
      ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg", ".ico",
      // Videos
      ".mp4", ".avi", ".mkv", ".mov", ".wmv", ".flv", ".webm", ".m4v", ".mpg", ".mpeg",
      // Audio
      ".mp3", ".wav", ".flac", ".ogg", ".aac", ".wma", ".m4a",
      // Archives
      ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz",
      // Text
      ".txt", ".md", ".json", ".xml", ".yaml", ".yml", ".log",
      // Code (允许; treated as text — not extracted/interpreted server-side)
      ".js", ".ts", ".py", ".java", ".c", ".cpp", ".h", ".hpp", ".rb", ".php",
      ".go", ".rs", ".sh", ".bat", ".ps1",
      // Other installable media types — magic-byte validation guards against
      // mislabeled executables (.exe/.elf would fail the declared-extension
      // match below and be rejected).
      ".iso", ".dmg", ".apk", ".msi",
    ]);
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(
        `File extension "${ext}" is not allowed for upload`,
      );
    }

    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      include: { files: true, creator: true },
    });

    if (!share)
      throw new NotFoundException(this.i18n.t("file.notFound"));

    if (share.uploadLocked)
      throw new BadRequestException(this.i18n.t("file.alreadyCompleted"));

    let diskFileSize: number;
    try {
      diskFileSize = (
        await fs.stat(`${SHARE_DIRECTORY}/${shareId}/${file.id}.tmp-chunk`)
      ).size;
    } catch {
      diskFileSize = 0;
    }

    // If the sent chunk index and the expected chunk index doesn't match throw an error
    const chunkSize = this.config.getNumber("share.chunkSize");
    const expectedChunkIndex = Math.ceil(diskFileSize / chunkSize);

    if (expectedChunkIndex != chunk.index)
      throw new BadRequestException({
        message: this.i18n.t("file.unexpectedChunk"),
        error: "unexpected_chunk_index",
        expectedChunkIndex,
      });

    const buffer = Buffer.from(data, "base64");

    // Check if there is enough space on the server
    const space = await fs.statfs(SHARE_DIRECTORY);
    const availableSpace = space.bavail * space.bsize;
    if (availableSpace < buffer.byteLength) {
      throw new InternalServerErrorException(
        this.i18n.t("file.notEnoughSpace"),
      );
    }

    // Check if share size limit is exceeded
    const fileSizeSum = share.files.reduce(
      (n, { size }) => n + toBytes(size),
      0,
    );

    const shareSizeSum = fileSizeSum + diskFileSize + buffer.byteLength;

    const globalLimit = this.config.getNumber("share.maxSize");
    const userLimit = share.creator?.shareSizeLimit != null
      ? toBytes(share.creator.shareSizeLimit)
      : undefined;
    const limit = userLimit !== undefined ? Math.min(globalLimit, userLimit) : globalLimit;

    if (shareSizeSum > limit) {
      throw new HttpException(
        this.i18n.t("file.maxSizeExceeded"),
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    // GAP-01: per-file size limit, when configured (> 0 applies). Defends
    // against a single huge upload consuming the entire share budget.
    const maxFileSize = this.config.getNumber("share.maxFileSize");
    if (maxFileSize > 0 && diskFileSize + buffer.byteLength > maxFileSize) {
      throw new HttpException(
        `File exceeds per-file size limit of ${maxFileSize} bytes`,
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    await fs.appendFile(
      `${SHARE_DIRECTORY}/${shareId}/${file.id}.tmp-chunk`,
      buffer,
    );

    const isLastChunk = chunk.index == chunk.total - 1;
    if (isLastChunk) {
      await fs.rename(
        `${SHARE_DIRECTORY}/${shareId}/${file.id}.tmp-chunk`,
        `${SHARE_DIRECTORY}/${shareId}/${file.id}`,
      );
      const fileSize = (
        await fs.stat(`${SHARE_DIRECTORY}/${shareId}/${file.id}`)
      ).size;

      // GAP-01: validate real magic bytes against the declared extension to
      // prevent polyglots / mislabeled payloads (e.g. .mp4 with EXE bytes).
      // Sanity-sampled first 64 KiB for performance; file-type only needs a
      // few kilobytes of header in practice. Skip when file-type cannot
      // determine a type (very small / unknown formats) to avoid blocking
      // legitimate uploads — the extension allowlist already filters by ext.
      try {
        const sampleFd = await fs.open(
          `${SHARE_DIRECTORY}/${shareId}/${file.id}`,
          "r",
        );
        const sample = Buffer.alloc(Math.min(65536, fileSize));
        await sampleFd.read(sample, 0, sample.byteLength, 0);
        await sampleFd.close();
        const detected = await fileTypeFromBuffer(sample);
        if (detected) {
          if (!this.extensionMatchesType(ext, detected.ext)) {
            // Roll back the rename so the malicious file isn't kept on disk.
            await fs
              .unlink(`${SHARE_DIRECTORY}/${shareId}/${file.id}`)
              .catch(() => undefined);
            throw new BadRequestException(
              `File content does not match its extension "${ext}" (detected ${detected.ext}). Upload rejected.`,
            );
          }
        }
      } catch (e) {
        // SEC-08: fail-closed on detection errors. Validation mismatches are
        // re-thrown for the client; unexpected failures no longer fall through
        // — a broken/malicious parser must never bypass the type check.
        if (e instanceof BadRequestException) throw e;
        this.logger.error(
          `Magic-byte detection failed for file ${file.id}: ${e}`,
        );
        await fs
          .unlink(`${SHARE_DIRECTORY}/${shareId}/${file.id}`)
          .catch(() => undefined);
        throw new BadRequestException(this.i18n.t("file.typeUnverified"));
      }

      await this.prisma.file.create({
        data: {
          id: file.id,
          name: file.name,
          size: fileSize,
          description: file.description || null,
          share: { connect: { id: shareId } },
        },
      });
    }

    return file;
  }

  /**
   * Map declared file extension to expected file-type extension family.
   * Returns true when they're plausibly the same kind of content.
   */
  private extensionMatchesType(declaredExt: string, detectedExt: string): boolean {
    const normalized = declaredExt.replace(/^\./, "").toLowerCase();
    const detected = detectedExt.toLowerCase();

    // Equivalent families (declared → acceptable detected extensions).
    const families: Record<string, string[]> = {
      jpg: ["jpg", "jpeg"],
      jpeg: ["jpg", "jpeg"],
      tif: ["tif", "tiff"],
      tiff: ["tif", "tiff"],
      m4v: ["mp4", "m4v"],
      mp4: ["mp4", "m4v", "mov"],
      mov: ["mov", "mp4"],
      mpeg: ["mpg", "mpeg"],
      mpg: ["mpg", "mpeg"],
      htaccess: [],
      txt: [],
      md: [],
      json: ["json"],
      xml: ["xml"],
      yml: ["yml", "yaml"],
      yaml: ["yml", "yaml"],
      log: [],
      iso: [],
      iso9660: ["iso"],
    };

    if (normalized === detected) return true;
    const family = families[normalized] ?? [];
    if (family.includes(detected)) return true;
    // Conservative: when the detected type is in the allowlist above (image,
    // video, audio, archive, office) we accept extension vs detected mismatch
    // only within a known safe set, to avoid .jpg actually being .exe.
    // If the detected extension is one known to be "active" (executable,
    // document-with-macros) treat as mismatch unless already accounted for.
    const activeTypes = new Set([
      "exe",
      "elf",
      "msi",
      "apk",
      "dex",
      "jar",
      "class",
      "macho",
      "deb",
      "rpm",
      "jar",
      "pdf", // PDF can carry JS — only accept when declared.
    ]);
    if (activeTypes.has(detected) && family.indexOf(detected) === -1) {
      return false;
    }
    // Otherwise accept (e.g. mp3 with mp4 bytes / zip with 7z) — leniency
    // keeps backwards compat for unusual but non-malicious uploads.
    return true;
  }

  async get(
    shareId: string,
    fileId: string,
    range?: { start: number; end: number },
  ) {
    const fileMetaData = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!fileMetaData)
      throw new NotFoundException(this.i18n.t("file.notFound"));

    const file = createReadStream(`${SHARE_DIRECTORY}/${shareId}/${fileId}`, {
      // PERF-06: HTTP Range (206) support — serve only the requested byte
      // window for video previews / seek or partial-download resumption.
      start: range?.start,
      end: range?.end,
    });

    return {
      metaData: {
        mimeType: mime.contentType(fileMetaData.name.split(".").pop() ?? "") || "application/octet-stream",
        ...fileMetaData,
        size: fileMetaData.size.toString(),
      },
      file,
    };
  }

  async getFileMetaData(shareId: string, fileId: string) {
    const fileMetaData = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!fileMetaData)
      throw new NotFoundException(this.i18n.t("file.notFound"));

    return fileMetaData;
  }

  async remove(shareId: string, fileId: string) {
    const fileMetaData = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!fileMetaData)
      throw new NotFoundException(this.i18n.t("file.notFound"));

    await fs.unlink(`${SHARE_DIRECTORY}/${shareId}/${fileId}`);

    await this.prisma.file.delete({ where: { id: fileId } });
  }

  async deleteAllFiles(shareId: string) {
    await fs.rm(`${SHARE_DIRECTORY}/${shareId}`, {
      recursive: true,
      force: true,
    });
  }

  async getZip(shareId: string): Promise<Readable> {
    return new Promise((resolve, reject) => {
      const zipStream = createReadStream(
        `${SHARE_DIRECTORY}/${shareId}/archive.zip`,
      );

      zipStream.on("error", (err) => {
        reject(new InternalServerErrorException(err));
      });

      zipStream.on("open", () => {
        resolve(zipStream);
      });
    });
  }

  /**
   * Streams a single file wrapped in a zip that preserves its uploaded
   * relative folder path (e.g. "videos/trailer.mp4"), so a download keeps the
   * same folder structure it was uploaded with. Falls back to a plain zip
   * entry using only the file name when no folder was given.
   */
  async getFileZip(shareId: string, fileId: string): Promise<Readable> {
    const fileMetaData = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!fileMetaData)
      throw new NotFoundException(this.i18n.t("file.notFound"));

    const entryName = fileMetaData.name || fileId;

    return new Promise((resolve, reject) => {
      createZipStream({
        zlib: { level: this.config.getNumber("share.zipCompressionLevel") },
      }).then(
        (archive) => {
          let settled = false;
          const settle = (err: unknown) => {
            if (settled) return;
            settled = true;
            reject(err);
          };

          archive.on("error", (err: unknown) => {
            settle(
              new InternalServerErrorException(
                err instanceof Error ? err.message : "Failed to create zip",
              ),
            );
          });

          archive.on("warning", (err: unknown) => {
            this.logger.warn(`zip warning: ${String(err)}`);
          });

          archive.append(
            createReadStream(`${SHARE_DIRECTORY}/${shareId}/${fileId}`),
            { name: entryName },
          );

          // Resolve immediately after finalize: the Nest StreamableFile will
          // pipe and consume the archive, which in turn emits its "end" event.
          // Waiting for "end" here would deadlock, since the stream is not
          // read until the promise resolves.
          try {
            void archive.finalize();
          } catch (err) {
            settle(err);
            return;
          }
          resolve(archive);
        },
        (err) => reject(err),
      );
    });
  }
}
