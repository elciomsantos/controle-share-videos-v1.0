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
/**
 * SEC-ZIPSLIP (VULN-03): sanitiza o nome da entrada de um zip. Nomes vindos
 * de uploads podem conter `..`, caminho absoluto ou barras invertidas — se
 * forem gravados literalmente no central directory, ferramentas de extração
 * vulneráveis escrevem arquivos fora do diretório de destino (Zip Slip).
 * Componentes perigosos são descartados (não rejeitados), preservando a
 * estrutura legítima de pastas e nomes já persistidos no banco.
 */
export function sanitizeZipEntryName(name: string, fallback = "arquivo"): string {
  const parts = name
    .replaceAll("\\", "/")
    .split("/")
    .filter((part) => part.length > 0 && part !== "." && part !== "..");
  return parts.length > 0 ? parts.join("/") : fallback;
}
