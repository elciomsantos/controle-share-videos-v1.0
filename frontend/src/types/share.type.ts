import User from "./user.type";

export type Share = {
  id: string;
  name?: string;
  files: any;
  creator?: User;
  description?: string;
  expiration: Date;
  size: number;
  hasPassword: boolean;
};

export type CompletedShare = Share;

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
  };
};

export type ShareMetaData = {
  id: string;
  isZipReady: boolean;
};

export type MyShare = Omit<Share, "hasPassword"> & {
  views: number;
  createdAt: Date;
  security?: MyShareSecurity;
};

export type ShareSecurity = {
  maxViews?: number;
  password?: string;
};

export type MyShareSecurity = {
  passwordProtected: boolean;
  maxViews?: number;
};
