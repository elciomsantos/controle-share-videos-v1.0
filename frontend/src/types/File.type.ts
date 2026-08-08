export type FileRecord = {
  id: string;
  name: string;
  size: string | bigint;
  description?: string | null;
  shareId?: string;
  createdAt?: Date | string;
  mimeType?: string | false;
};

export type FileMetaData = {
  id: string;
  name: string;
  size: string;
  description?: string;
  createdAt?: Date | string;
  shareId?: string;
  mimeType?: string | false;
};

export type FileUpload = FileRecord & {
  uploadingProgress: number;
  description?: string;
  /** Original DOM File/Blob for chunked upload */
  file?: globalThis.File;
};

export type FileUploadResponse = { id: string; name: string; description?: string };

export type FileListItem = FileUpload | (FileRecord & { deleted?: boolean }) | (FileMetaData & { deleted?: boolean });
