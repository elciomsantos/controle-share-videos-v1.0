import { Injectable } from "@nestjs/common";
import {
  createReadStream,
  createWriteStream,
  type ReadStream,
  type WriteStream,
} from "fs";
import * as fsSync from "fs";
import { promises as fsp } from "fs";
import { SHARE_DIRECTORY } from "../constants";
import type {
  IUploadRepository,
  StoredFileStat,
  UploadRepositoryDirectoryEntry,
} from "./upload-repository.interface";

/**
 * R02 — Implementação filesystem de IUploadRepository.
 *
 * Encapsula tudo o que antes vivia solto em LocalFileService / ShareArchiveService /
 * JobsService / FileStorageService acoplado a SHARE_DIRECTORY e fs. A partir daqui,
 * nenhuma regra de negócio deve tocar o filesystem diretamente.
 */
@Injectable()
export class FilesystemUploadRepository implements IUploadRepository {
  private readonly root = SHARE_DIRECTORY;

  private resolve(relativePath: string): string {
    return `${this.root}/${relativePath}`;
  }

  async statFile(relativePath: string): Promise<StoredFileStat> {
    const stat = await fsp.stat(this.resolve(relativePath));
    return { size: stat.size, mtime: stat.mtime };
  }

  async availableSpaceBytes(): Promise<number> {
    const space = await fsp.statfs(this.root);
    return space.bavail * space.bsize;
  }

  async appendBuffer(relativePath: string, buffer: Buffer): Promise<void> {
    await fsp.appendFile(this.resolve(relativePath), buffer);
  }

  async moveFile(from: string, to: string): Promise<void> {
    await fsp.rename(this.resolve(from), this.resolve(to));
  }

  async readSample(relativePath: string, maxBytes: number): Promise<Buffer> {
    const fd = await fsp.open(this.resolve(relativePath), "r");
    const sample = Buffer.alloc(maxBytes);
    try {
      const { bytesRead } = await fd.read(sample, 0, sample.byteLength, 0);
      return sample.subarray(0, bytesRead);
    } finally {
      await fd.close();
    }
  }

  createReadStream(
    relativePath: string,
    opts?: { start?: number; end?: number },
  ): ReadStream {
    return createReadStream(this.resolve(relativePath), {
      start: opts?.start,
      end: opts?.end,
    });
  }

  createWriteStream(relativePath: string): WriteStream {
    return createWriteStream(this.resolve(relativePath));
  }

  async unlinkIfExists(relativePath: string): Promise<void> {
    await fsp.unlink(this.resolve(relativePath)).catch(() => undefined);
  }

  async removeShareDirectory(shareId: string): Promise<void> {
    await fsp.rm(this.resolve(shareId), { recursive: true, force: true });
  }

  createShareDirectory(shareId: string): void {
    fsSync.mkdirSync(this.resolve(shareId), { recursive: true });
  }

  async listShareDirectories(): Promise<UploadRepositoryDirectoryEntry[]> {
    const dirents = await fsp.readdir(this.root, { withFileTypes: true });
    return dirents.map((d) => ({
      name: d.name,
      isDirectory: d.isDirectory(),
    }));
  }

  async listDirectory(dir: string): Promise<string[]> {
    return fsp.readdir(this.resolve(dir));
  }
}
