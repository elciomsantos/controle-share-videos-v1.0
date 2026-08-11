import { Readable, Writable } from "stream";

/**
 * Token de injeção NestJS para IUploadRepository.
 *
 * Interfaces TypeScript são apagadas em runtime, então o Nest não consegue
 * injetar por tipo — usamos este token para registrar/consumir o provider.
 */
export const IUploadRepository = Symbol("IUploadRepository");

/**
 * R02 — Abstração da camada de armazenamento de arquivos.
 *
 * Isola todas as operações de baixo nível de filesystem/objeto atrás desta
 * interface, permitindo trocar o backend de storage (filesystem → S3/MinIO)
 * apenas criando uma nova implementação e trocando o provider no NestJS DI —
 * nenhuma regra de negócio (validação, Prisma, zip, jobs) precisa mudar.
 *
 * Todas as operações recebem caminhos *relativos ao diretório raiz de
 * armazenamento* (ex.: `{shareId}/{fileId}`), nunca caminhos absolutos do
 * host — a implementação concreta resolve o prefixo (SHARE_DIRECTORY).
 */

export interface StoredFileStat {
  size: number;
  mtime: Date;
}

export interface UploadRepositoryDirectoryEntry {
  name: string;
  isDirectory: boolean;
}

export interface IUploadRepository {
  /** Tamanho em bytes de um arquivo. Lança se não existir. */
  statFile(relativePath: string): Promise<StoredFileStat>;

  /** Espaço livre em bytes no volume que contém o diretório do share. */
  availableSpaceBytes(): Promise<number>;

  /** Anexa (modo append) um buffer a um arquivo. Cria se não existir. */
  appendBuffer(relativePath: string, buffer: Buffer): Promise<void>;

  /** Move/renomeia um arquivo. */
  moveFile(from: string, to: string): Promise<void>;

  /** Lê uma amostra de bytes do início do arquivo (máx. `maxBytes`). */
  readSample(relativePath: string, maxBytes: number): Promise<Buffer>;

  /** Stream de leitura de um arquivo (com suporte a HTTP Range). */
  createReadStream(
    relativePath: string,
    opts?: { start?: number; end?: number },
  ): Readable;

  /** Stream de escrita (usado na geração de zip). */
  createWriteStream(relativePath: string): Writable;

  /** Remove um arquivo, ignorando erro se não existir. */
  unlinkIfExists(relativePath: string): Promise<void>;

  /** Remove recursivamente o diretório de um share completo. */
  removeShareDirectory(shareId: string): Promise<void>;

  /** Cria o diretório de um share (recursivo). */
  createShareDirectory(shareId: string): void;

  /** Lista os diretórios de share existentes. */
  listShareDirectories(): Promise<UploadRepositoryDirectoryEntry[]>;

  /** Lista os arquivos de um diretório. */
  listDirectory(dir: string): Promise<string[]>;
}
