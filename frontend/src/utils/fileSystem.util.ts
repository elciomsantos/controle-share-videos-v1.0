export type FileSystemDirectoryHandle = {
  readonly kind: "directory";
  readonly name: string;
  values(): AsyncIterableIterator<FileSystemHandle>;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemFileHandle>;
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemDirectoryHandle>;
  requestPermission?: (descriptor?: {
    mode?: "read" | "readwrite";
  }) => Promise<"granted" | "denied" | "prompt">;
};

export type FileSystemFileHandle = {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
};

export type FileSystemWritableFileStream = {
  write(data: Blob | BufferSource | string): Promise<void>;
  close(): Promise<void>;
};

export type FileSystemHandle = FileSystemDirectoryHandle | FileSystemFileHandle;

type ShowDirectoryPickerOptions = {
  mode?: "read" | "readwrite";
};

type FileSystemWindow = Window & {
  showDirectoryPicker?: (
    options?: ShowDirectoryPickerOptions,
  ) => Promise<FileSystemDirectoryHandle>;
};

const fileSystemWindow = () => (typeof window !== "undefined" ? (window as FileSystemWindow) : undefined);

export const isFileSystemAccessSupported = () =>
  !!fileSystemWindow()?.showDirectoryPicker;

export const pickDirectory = async (): Promise<FileSystemDirectoryHandle | null> => {
  const win = fileSystemWindow();
  if (!win?.showDirectoryPicker) return null;
  return await win.showDirectoryPicker({ mode: "readwrite" });
};

const ensureWritePermission = async (
  dir: FileSystemDirectoryHandle,
): Promise<boolean> => {
  if (!dir.requestPermission) return true;
  const result = await dir.requestPermission({ mode: "readwrite" });
  return result === "granted";
};

export const writeBlobToDirectory = async (
  dir: FileSystemDirectoryHandle,
  fileName: string,
  blob: Blob,
): Promise<boolean> => {
  if (!(await ensureWritePermission(dir))) return false;
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close();
  }
  return true;
};

/**
 * Lista recursivamente os arquivos de um diretório da File System Access API,
 * retornando o path relativo de cada um (dentro da pasta raiz escolhida).
 */
export const listDirectoryFiles = async (
  dir: FileSystemDirectoryHandle,
): Promise<{ file: File; relativePath: string }[]> => {
  const results: { file: File; relativePath: string }[] = [];

  const walk = async (
    handle: FileSystemDirectoryHandle,
    basePath: string,
  ) => {
    for await (const entry of handle.values()) {
      const childPath = basePath ? `${basePath}/${entry.name}` : entry.name;
      if (entry.kind === "file") {
        const file = await (entry as FileSystemFileHandle).getFile();
        results.push({ file, relativePath: childPath });
      } else if (entry.kind === "directory") {
        await walk(entry as FileSystemDirectoryHandle, childPath);
      }
    }
  };

  await walk(dir, "");
  return results;
};

/**
 * Resolve (e cria, se necessário) uma subpasta dentro do diretório raiz e
 * escreve o blob nela. Se relativeDirPath for vazio, escreve na raiz.
 */
export const writeBlobToRelativeDirectory = async (
  root: FileSystemDirectoryHandle,
  relativeDirPath: string,
  fileName: string,
  blob: Blob,
): Promise<boolean> => {
  let target: FileSystemDirectoryHandle = root;
  if (relativeDirPath) {
    for (const segment of relativeDirPath.split("/")) {
      if (!segment) continue;
      target = await target.getDirectoryHandle(segment, { create: true });
    }
  }
  return await writeBlobToDirectory(target, fileName, blob);
};