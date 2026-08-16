export type DownloadLogEvent = "download" | "view" | "upload" | "delete";

export interface DownloadLog {
  id: string;
  createdAt: string;
  shareId: string;
  fileId?: string | null;
  fileName: string;
  fileSize?: string | null;
  fileHash?: string | null;
  shareName?: string | null;
  creatorUsername?: string | null;
  recipientId?: string | null;
  recipientEmail?: string | null;
  mimeType?: string | null;
  referer?: string | null;
  durationMs?: number | null;
  transferBytes?: string | null;
  authMethod?: string | null;
  httpStatus?: number | null;
  userId?: string | null;
  username?: string | null;
  ip: string;
  userAgent?: string | null;
  success: boolean;
  reason?: string | null;
  event: string;
}

export interface DownloadLogPage {
  data: DownloadLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DownloadLogQuery {
  shareId?: string;
  userId?: string;
  from?: string;
  to?: string;
  event?: DownloadLogEvent;
  success?: boolean;
  page?: number;
  limit?: number;
}
