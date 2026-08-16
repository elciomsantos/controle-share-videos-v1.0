type Config = {
  key: string;
  defaultValue: string;
  value: string;
  type: string;
};

import { Timespan } from "./timespan.type";

/**
 * Typed config keys — aligned with `prisma/seed/config.seed.ts`. Each key maps
 * to the runtime value type `configService.get` returns, so frontend consumers
 * get compile-time checking instead of `any` (R06).
 */
export type ConfigTypeMap = {
  "general.appName": string;
  "general.appUrl": string;
  "general.secureCookies": boolean;
  "general.showHomePage": boolean;
  "general.sessionDuration": Timespan;
  "general.defaultLanguage": string;
  "appearance.themePrimaryColor": string;
  "appearance.themePrimaryColorOverride": string;
  "appearance.themeRadius": string;
  "appearance.themeColorScheme": string;
  "appearance.customCss": string;
  "share.allowRegistration": boolean;
  "share.maxExpiration": Timespan;
  "share.defaultExpiration": Timespan;
  "share.shareIdLength": number;
  "share.maxSize": number;
  "share.maxFileSize": number;
  "share.zipCompressionLevel": number;
  "share.zipMaxFiles": number;
  "share.zipMaxTotalSize": number;
  "share.zipMaxRatio": number;
  "share.chunkSize": number;
  "share.autoOpenShareModal": boolean;
  "share.allowAdminAccessAllShares": boolean;
  "share.fileRetentionPeriod": Timespan;
  "share.maxDownloadsDefault": number;
  "share.downloadLogRetentionDays": number;
  "share.generatedPasswordLength": number;
  "share.autoGeneratePassword": boolean;
  "share.includePasswordInShareLink": boolean;
  "cache.redis-enabled": boolean;
  "cache.redis-url": string;
  "cache.ttl": number;
  "cache.maxItems": number;
  "email.sendHtmlEmails": boolean;
  "email.enableShareEmailRecipients": boolean;
  "email.shareRecipientsSubject": string;
  "email.shareRecipientsMessage": string;
  "email.resetPasswordSubject": string;
  "email.resetPasswordMessage": string;
  "email.inviteSubject": string;
  "email.inviteMessage": string;
  "email.enableShareDownloadNotifications": boolean;
  "email.shareDownloadNotificationSubject": string;
  "email.shareDownloadNotificationMessage": string;
  "email.enableEmailVerification": boolean;
  "email.verificationSubject": string;
  "email.verificationMessage": string;
  "smtp.enabled": boolean;
  "smtp.allowUnauthorizedCertificates": boolean;
  "smtp.host": string;
  "smtp.port": number;
  "smtp.email": string;
  "smtp.username": string;
  "smtp.password": string;
  "legal.enabled": boolean;
  "legal.imprintText": string;
  "legal.imprintUrl": string;
  "legal.privacyPolicyText": string;
  "legal.privacyPolicyUrl": string;
};

export type ConfigKeys = keyof ConfigTypeMap;

/** Return type of `get(key)` — typed per known key, `unknown` for arbitrary keys. */
export type GetReturn<K extends string> = K extends ConfigKeys
  ? ConfigTypeMap[K]
  : unknown;

export type UpdateConfig = {
  key: string;
  value: string;
};

export type AdminConfig = Config & {
  name: string;
  updatedAt: Date;
  secret: boolean;
  description: string;
  obscured: boolean;
  allowEdit: boolean;
};

export type AdminConfigGroupedByCategory = {
  [key: string]: [
    Config & {
      updatedAt: Date;
      secret: boolean;
      description: string;
      obscured: boolean;
      category: string;
    },
  ];
};

export type ConfigHook = {
  configVariables: Config[];
  refresh: () => void;
};

export default Config;
