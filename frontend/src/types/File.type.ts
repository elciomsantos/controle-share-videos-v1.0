export type FileUpload = File & {
  uploadingProgress: number;
  description?: string;
};

export type FileUploadResponse = { id: string; name: string; description?: string };

export type FileMetaData = {
  id: string;
  name: string;
  size: string;
  description?: string;
};

export type FileListItem = FileUpload | (FileMetaData & { deleted?: boolean });
