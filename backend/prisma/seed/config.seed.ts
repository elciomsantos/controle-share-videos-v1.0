import { Prisma, PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import * as crypto from "crypto";
import { encryptSecret } from "../../src/config/jwt-secret-crypto";

export const configVariables = {
  internal: {
    jwtSecret: {
      type: "string",
      // Encrypted at rest when JWT_SECRET_ENCRYPTION_KEY (base64, 32 bytes) is
      // set; falls back to plaintext (legacy) otherwise.
      value: encryptSecret(crypto.randomBytes(256).toString("base64")),
      locked: true,
      secret: true,
    },
    jwtSecretHistory: {
      type: "string",
      defaultValue: "[]",
      locked: true,
      secret: true,
    },
    jwtSecretSource: {
      type: "string",
      // "auto": env → Docker secret file → DB. Flips to "db" after a hybrid
      // rotation adopts a file secret and makes the DB authoritative.
      defaultValue: "auto",
      locked: true,
      secret: true,
    },
  },
  general: {
    appName: {
      type: "string",
      defaultValue: "Guarda Municipal de Londrina",
      secret: false,
    },
    appUrl: {
      type: "string",
      defaultValue: "http://localhost:3000",
      secret: false,
    },
    secureCookies: {
      type: "boolean",
      // Cookies only get the Secure attribute when served over HTTPS. Default
      // to true in production (behind Caddy/TLS), false in dev (plain HTTP).
      defaultValue: process.env.NODE_ENV === "production" ? "true" : "false",
    },
    showHomePage: {
      type: "boolean",
      defaultValue: "true",
      secret: false,
    },
    sessionDuration: {
      type: "timespan",
      defaultValue: "3 months",
      secret: false,
    },
    defaultLanguage: {
      type: "string",
      defaultValue: "pt-BR",
      secret: false,
    },
  },
  appearance: {
    themePrimaryColor: {
      type: "string",
      defaultValue: "victoria",
      secret: false,
    },
    themePrimaryColorOverride: {
      type: "string",
      defaultValue: "",
      secret: false,
    },
    themeRadius: {
      type: "string",
      defaultValue: "sm",
      secret: false,
    },
    themeColorScheme: {
      type: "string",
      defaultValue: "system",
      secret: false,
    },
    customCss: {
      type: "text",
      defaultValue: "",
      secret: false,
    },
  },
  share: {
    allowRegistration: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    allowUnauthenticatedShares: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    maxExpiration: {
      type: "timespan",
      defaultValue: "0 days",
      secret: false,
    },
    defaultExpiration: {
      type: "timespan",
      defaultValue: "7 days",
      secret: false,
    },
    shareIdLength: {
      type: "number",
      defaultValue: "8",
      secret: false,
    },
    maxSize: {
      type: "filesize",
      defaultValue: "1000000000",
      secret: false,
    },
    // GAP-01: per-file size limit (limitando ataques via polylots / uploads
    // individuais anormalmente grandes mesmo quando o total do share permite).
    maxFileSize: {
      type: "filesize",
      defaultValue: "0",
      secret: false,
    },
    zipCompressionLevel: {
      type: "number",
      // PERF-03: level 9 (zlib max) costs ~4-5x CPU vs level 6 for marginal
      // size gains. 6 is the gzip default and the practical sweet spot for
      // large video/media archives.
      defaultValue: "6",
    },
    // GAP-04: zip-bomb protection limits, configurable by admins.
    zipMaxFiles: {
      type: "number",
      defaultValue: "10000",
      secret: false,
    },
    zipMaxTotalSize: {
      type: "filesize",
      defaultValue: "10000000000",
      secret: false,
    },
    zipMaxRatio: {
      type: "number",
      defaultValue: "103",
      secret: false,
    },
    chunkSize: {
      type: "filesize",
      defaultValue: "10000000",
      secret: false,
    },
    autoOpenShareModal: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    allowAdminAccessAllShares: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    fileRetentionPeriod: {
      type: "timespan",
      defaultValue: "0 days",
      secret: false,
    },
    maxDownloadsDefault: {
      type: "number",
      defaultValue: "0",
      secret: false,
    },
    downloadLogRetentionDays: {
      type: "number",
      // Non-zero default so the audit log is pruned automatically (0 = keep
      // forever). Existing installs keep their current value; this only affects
      // fresh deployments.
      defaultValue: "90",
      secret: false,
    },
    generatedPasswordLength: {
      type: "number",
      defaultValue: "12",
      secret: false,
    },
    autoGeneratePassword: {
      type: "boolean",
      defaultValue: "true",
      secret: false,
    },
    includePasswordInShareLink: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
  },
  cache: {
    "redis-enabled": {
      type: "boolean",
      defaultValue: "false",
    },
    "redis-url": {
      type: "string",
      defaultValue: "redis://controle-share-videos-redis:6379",
      secret: true,
    },
    ttl: {
      type: "number",
      defaultValue: "60",
    },
    maxItems: {
      type: "number",
      defaultValue: "1000",
    },
  },
  email: {
    sendHtmlEmails: {
      type: "boolean",
      defaultValue: "false",
    },
    enableShareEmailRecipients: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    shareRecipientsSubject: {
      type: "string",
      defaultValue: "Files shared with you",
    },
    shareRecipientsMessage: {
      type: "text",
      defaultValue:
        "Hey!\n\n{creator} ({creatorEmail}) shared some files with you. You can view or download the files with this link: {shareUrl}\n\nThe share will expire {expires}.\n\nNote: {desc}\n\nShared securely with Controle Share Videos",
    },
    resetPasswordSubject: {
      type: "string",
      defaultValue: "Controle Share Videos password reset",
    },
    resetPasswordMessage: {
      type: "text",
      defaultValue:
        "Hey!\n\nYou requested a password reset. Click this link to reset your password: {url}\nThe link expires in an hour.\n\nControle Share Videos",
    },
    inviteSubject: {
      type: "string",
      defaultValue: "Controle Share Videos invite",
    },
    inviteMessage: {
      type: "text",
      defaultValue:
        'Hey!\n\nYou were invited to Controle Share Videos. Click this link to accept the invite: {url}\n\nYou can use the email "{email}" and the password "{password}" to sign in.\n\nControle Share Videos',
    },
    enableShareDownloadNotifications: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    shareDownloadNotificationSubject: {
      type: "string",
      defaultValue: "Your file was downloaded",
    },
    shareDownloadNotificationMessage: {
      type: "text",
      defaultValue:
        "Hey!\n\n{recipientEmail} downloaded {fileName} from your share: {shareUrl}\n\nControle Share Videos",
    },
    enableEmailVerification: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    verificationSubject: {
      type: "string",
      defaultValue: "Verify your Controle Share Videos account",
    },
    verificationMessage: {
      type: "text",
      defaultValue:
        "Hey!\n\nYou just signed up for Controle Share Videos. Click this link to verify your account: {url}\n\nThe link expires in 24 hours.\n\nControle Share Videos",
    },
  },
  smtp: {
    enabled: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    allowUnauthorizedCertificates: {
      type: "boolean",
      defaultValue: "false",

      secret: false,
    },
    host: {
      type: "string",
      defaultValue: "",
    },
    port: {
      type: "number",
      defaultValue: "0",
    },
    email: {
      type: "string",
      defaultValue: "",
    },
    username: {
      type: "string",
      defaultValue: "",
    },
    password: {
      type: "string",
      defaultValue: "",
      obscured: true,
    },
  },
  legal: {
    enabled: {
      type: "boolean",
      defaultValue: "false",
      secret: false,
    },
    imprintText: {
      type: "text",
      defaultValue: "",
      secret: false,
    },
    imprintUrl: {
      type: "string",
      defaultValue: "",
      secret: false,
    },
    privacyPolicyText: {
      type: "text",
      defaultValue: "",
      secret: false,
    },
    privacyPolicyUrl: {
      type: "string",
      defaultValue: "",
      secret: false,
    },
  },
} satisfies ConfigVariables;

export type YamlConfig = {
  [Category in keyof typeof configVariables]: {
    [Key in keyof (typeof configVariables)[Category]]: string;
  };
} & {
  initUser: {
    enabled: string;
    username: string;
    email: string;
    password: string;
    isAdmin: boolean;
  };
};

type ConfigVariables = {
  [category: string]: {
    [variable: string]: Omit<
      Prisma.ConfigCreateInput,
      "name" | "category" | "order"
    >;
  };
};

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL || "file:./data/controle-videos.db",
  }),
});

async function seedConfigVariables() {
  for (const [category, configVariablesOfCategory] of Object.entries(
    configVariables,
  )) {
    let order = 0;
    for (const [name, properties] of Object.entries(
      configVariablesOfCategory,
    )) {
      const existingConfigVariable = await prisma.config.findUnique({
        where: { name_category: { name, category } },
      });

      // Create a new config variable if it doesn't exist
      if (!existingConfigVariable) {
        await prisma.config.create({
          data: {
            order,
            name,
            ...properties,
            category,
          },
        });
      }
      order++;
    }
  }
}

async function migrateConfigVariables() {
  const existingConfigVariables = await prisma.config.findMany();
  const seedConfigVariables =
    configVariables as unknown as Record<
      string,
      Record<string, Omit<Prisma.ConfigCreateInput, "name" | "category" | "order">>
    >;

  for (const existingConfigVariable of existingConfigVariables) {
    const configVariable =
      seedConfigVariables[existingConfigVariable.category]?.[
      existingConfigVariable.name
      ];

    // Delete the config variable if it doesn't exist in the seed
    if (!configVariable) {
      console.log(
        `Deleting obsolete config: ${existingConfigVariable.category}.${existingConfigVariable.name}`,
      );
      await prisma.config.delete({
        where: {
          name_category: {
            name: existingConfigVariable.name,
            category: existingConfigVariable.category,
          },
        },
      });

      // Update the config variable if it exists in the seed
    } else {
      const variableOrder = Object.keys(
        seedConfigVariables[existingConfigVariable.category],
      ).indexOf(existingConfigVariable.name);
      await prisma.config.update({
        where: {
          name_category: {
            name: existingConfigVariable.name,
            category: existingConfigVariable.category,
          },
        },
        data: {
          ...configVariable,
          name: existingConfigVariable.name,
          category: existingConfigVariable.category,
          value: existingConfigVariable.value,
          order: variableOrder,
        },
      });
    }
  }
}

seedConfigVariables()
  .then(() => migrateConfigVariables())
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
