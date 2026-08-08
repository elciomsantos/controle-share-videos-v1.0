import User from "./user.type";
import { FileRecord } from "./File.type";

export type Share = {
  id: string;
  name?: string;
  files: FileRecord[];
  creator?: User;
  description?: string;
  expiration: Date;
  size: number;
  hasPassword: boolean;
};

export type CompletedShare = Share & {
  maxViews?: number;
  maxDownloads?: number;
};

export type CreateShare = {
  id: string;
  name?: string;
  description?: string;
  recipients: string[];
  expiration: string;
  security: ShareSecurity;
  size?: number;
};

export type UpdateShare = {
  name?: string | null;
  description?: string | null;
  expiration?: string;
  security?: {
    password?: string;
    removePassword?: boolean;
    maxViews?: number | null;
    maxDownloads?: number | null;
  };
};

export type ShareMetaData = {
  id: string;
  isZipReady: boolean;
};

export type MyShare = Omit<Share, "hasPassword"> & {
  views: number;
  downloads?: number;
  createdAt: Date;
  security?: MyShareSecurity;
};

export type ShareSecurity = {
  maxViews?: number;
  maxDownloads?: number;
  password?: string;
};

export type MyShareSecurity = {
  passwordProtected: boolean;
  maxViews?: number;
  maxDownloads?: number;
};
