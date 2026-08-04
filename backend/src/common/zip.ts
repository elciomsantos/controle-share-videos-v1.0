import { InternalServerErrorException } from "@nestjs/common";
// archiver@8 is ESM-only and exposes a `ZipArchive` class (there is no longer
// a callable `archiver("zip", ...)` factory nor a default export).
// @types/archiver still describes the legacy `export =` shape, so we import
// dynamically at runtime and keep the instance type via the DefinitelyTyped
// Archiver interface.
import type Archiver from "archiver";

type ArchiverInstance = Archiver.Archiver;

interface ArchiverModule {
  ZipArchive: new (options?: {
    zlib?: { level?: number };
    statConcurrency?: number;
    forceZip64?: boolean;
  }) => ArchiverInstance;
}

let archiverModule: Promise<ArchiverModule> | undefined;

async function loadArchiver(): Promise<ArchiverModule> {
  if (!archiverModule) {
    archiverModule = import("archiver") as unknown as Promise<ArchiverModule>;
  }
  return archiverModule;
}

export async function createZipStream(options: {
  zlib?: { level?: number };
}): Promise<ArchiverInstance> {
  try {
    const { ZipArchive } = await loadArchiver();
    return new ZipArchive(options);
  } catch (err: unknown) {
    throw new InternalServerErrorException(
      err instanceof Error ? err.message : "Failed to initialize zip",
    );
  }
}