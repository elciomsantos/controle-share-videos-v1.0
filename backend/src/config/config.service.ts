import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Config } from "../../prisma/generated/prisma/client";
import argon from "argon2";
import { EventEmitter } from "events";
import * as fs from "fs";
import { PrismaService } from "../prisma/prisma.service";
import { stringToTimespan, Timespan } from "../utils/date.util";
import { parse as yamlParse } from "yaml";
import { I18nContext } from "nestjs-i18n";
import { YamlConfig } from "../../prisma/seed/config.seed";
import { ARGON2_OPTIONS, CONFIG_FILE } from "../constants";

/**
 * Runtime value type produced by `ConfigService.get` per config variable type.
 * `number`/`filesize` parse to number, `boolean` to boolean, `timespan` to
 * `Timespan`, everything else stays a string.
 */
export type ConfigValue = string | number | boolean | Timespan;

/**
 * Typed config keys — single source of truth aligned with
 * `prisma/seed/config.seed.ts`. Each key maps to the runtime value type
 * `ConfigService.get` returns, so consumers get compile-time checking instead
 * of `any` (R06 / QAL-03).
 */
export type ConfigTypeMap = {
  "internal.jwtSecret": string;
  "internal.jwtSecretHistory": string;
  "internal.jwtSecretSource": string;
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
  "share.allowUnauthenticatedShares": boolean;
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
type GetReturn<K extends string> = K extends ConfigKeys ? ConfigTypeMap[K] : unknown;

/**
 * ConfigService extends EventEmitter to allow listening for config updates,
 * now only `update` event will be emitted.
 */
@Injectable()
export class ConfigService extends EventEmitter {
  yamlConfig?: YamlConfig;
  logger = new Logger(ConfigService.name);

  constructor(
    @Inject("CONFIG_VARIABLES") private configVariables: Config[],
    private prisma: PrismaService,
  ) {
    super();
  }

  // Initialize gets called by the ConfigModule
  async initialize() {
    await this.loadYamlConfig();

    if (this.yamlConfig) {
      await this.migrateInitUser();
    }
  }

  private async loadYamlConfig() {
    let configFile: string = "";
    try {
      configFile = fs.readFileSync(CONFIG_FILE, "utf8");
    } catch {
      this.logger.log(
        "Config.yaml is not set. Falling back to UI configuration.",
      );
    }
    try {
      this.yamlConfig = yamlParse(configFile);

      if (this.yamlConfig) {
        const yamlConfig = this.yamlConfig as unknown as Record<
          string,
          Record<string, string>
        >;
        for (const configVariable of this.configVariables) {
          const category = yamlConfig[configVariable.category];
          if (!category) continue;
          configVariable.value = category[configVariable.name];
          this.emit("update", configVariable.name, configVariable.value);
        }
      }
    } catch (e) {
      this.logger.error(
        "Failed to parse config.yaml. Falling back to UI configuration: ",
        e,
      );
    }
  }

  private async migrateInitUser(): Promise<void> {
    if (!this.yamlConfig) return;
    if (!this.yamlConfig.initUser.enabled) return;

    const userCount = await this.prisma.user.count({
      where: { isAdmin: true },
    });
    if (userCount === 1) {
      this.logger.log(
        "Skip initial user creation. Admin user is already existent.",
      );
      return;
    }
    await this.prisma.user.create({
      data: {
        email: this.yamlConfig.initUser.email,
        username: this.yamlConfig.initUser.username,
        password: this.yamlConfig.initUser.password
          ? await argon.hash(this.yamlConfig.initUser.password, ARGON2_OPTIONS)
          : null,
        isAdmin: this.yamlConfig.initUser.isAdmin,
        role: this.yamlConfig.initUser.isAdmin ? "admin" : "operador",
      },
    });
  }

  // Returns the parsed runtime value for a config key. Known keys (ConfigKeys)
  // resolve to their declared type via ConfigTypeMap; arbitrary keys fall back
  // to `unknown`. Callers that need a specific type should prefer the typed
  // getters below (R06).
  get<K extends string>(key: K): GetReturn<K> {
    const configVariable = this.configVariables.filter(
      (variable) => `${variable.category}.${variable.name}` == key,
    )[0];

    if (!configVariable) throw new Error(`Config variable ${key} not found`);

    const value = configVariable.value ?? configVariable.defaultValue;

    if (configVariable.type == "number" || configVariable.type == "filesize")
      return parseInt(value, 10) as unknown as GetReturn<K>;
    if (configVariable.type == "boolean")
      return (value == "true") as unknown as GetReturn<K>;
    if (configVariable.type == "string" || configVariable.type == "text")
      return value as unknown as GetReturn<K>;
    if (configVariable.type == "timespan")
      return stringToTimespan(value) as unknown as GetReturn<K>;
    return undefined as unknown as GetReturn<K>;
  }

  getNumber<K extends ConfigKeys>(key: K): number {
    return this.get(key) as number;
  }

  getBoolean<K extends ConfigKeys>(key: K): boolean {
    return this.get(key) as boolean;
  }

  getString<K extends ConfigKeys>(key: K): string {
    return this.get(key) as string;
  }

  getTimespan<K extends ConfigKeys>(key: K): Timespan {
    return this.get(key) as Timespan;
  }

  async getByCategory(category: string) {
    const configVariables = this.configVariables
      .filter((c) => !c.locked && category == c.category)
      .sort((a, b) => a.order - b.order);

    return configVariables.map((variable) => {
      return {
        ...variable,
        key: `${variable.category}.${variable.name}`,
        value: variable.value ?? variable.defaultValue,
        allowEdit: this.isEditAllowed(),
      };
    });
  }

  async list() {
    const configVariables = this.configVariables.filter((c) => !c.secret);

    return configVariables.map((variable) => {
      return {
        ...variable,
        key: `${variable.category}.${variable.name}`,
        value: variable.value ?? variable.defaultValue,
      };
    });
  }

  async updateMany(data: { key: string; value: string | number | boolean }[]) {
    if (!this.isEditAllowed())
      throw new BadRequestException(
        this.t(
          "config.editNotAllowed",
          "You are only allowed to update config variables via the config.yaml file",
        ),
      );

    const response: Config[] = [];

    for (const variable of data) {
      response.push(await this.update(variable.key, variable.value));
    }

    return response;
  }

  async update(key: string, value: string | number | boolean | null) {
    if (!this.isEditAllowed())
      throw new BadRequestException(
        this.t(
          "config.editNotAllowed",
          "You are only allowed to update config variables via the config.yaml file",
        ),
      );

    const configVariable = await this.prisma.config.findUnique({
      where: {
        name_category: {
          category: key.split(".")[0],
          name: key.split(".")[1],
        },
      },
    });

    if (!configVariable || configVariable.locked)
      throw new NotFoundException(
        this.t("config.variableNotFound", "Config variable not found"),
      );

    if (value === "") {
      value = null;
    } else if (
      typeof value != configVariable.type &&
      typeof value == "string" &&
      configVariable.type != "text" &&
      configVariable.type != "timespan"
    ) {
      throw new BadRequestException(
        this.t("config.invalidType", "Config variable must be of type {type}", {
          type: configVariable.type,
        }),
      );
    }

    this.validateConfigVariable(key, value);

    const updatedVariable = await this.prisma.config.update({
      where: {
        name_category: {
          category: key.split(".")[0],
          name: key.split(".")[1],
        },
      },
      data: { value: value === null ? null : value.toString() },
    });

    this.configVariables = await this.prisma.config.findMany();

    this.emit("update", key, value);

    return updatedVariable;
  }

  validateConfigVariable(key: string, value: string | number | boolean | null) {
    const validations = [
      {
        key: "share.shareIdLength",
        condition: (value: number) => value >= 2 && value <= 50,
        message: this.t(
          "config.shareIdLengthValidation",
          "Share ID length must be between 2 and 50",
        ),
      },
      {
        key: "share.zipCompressionLevel",
        condition: (value: number) => value >= 0 && value <= 9,
        message: this.t(
          "config.zipCompressionLevelValidation",
          "Zip compression level must be between 0 and 9",
        ),
      },
      {
        key: "share.zipMaxFiles",
        condition: (value: number) => value >= 1 && value <= 100000,
        message: this.t(
          "config.zipMaxFilesValidation",
          "Zip max files must be between 1 and 100000",
        ),
      },
      {
        key: "share.zipMaxTotalSize",
        condition: (value: number) => value >= 1,
        message: this.t(
          "config.zipMaxTotalSizeValidation",
          "Zip max total size must be a positive number of bytes",
        ),
      },
      {
        key: "share.zipMaxRatio",
        condition: (value: number) => value >= 1,
        message: this.t(
          "config.zipMaxRatioValidation",
          "Zip max ratio must be at least 1",
        ),
      },
      {
        // 0 = disabled (fall back to share.maxSize), so allow it.
        key: "share.maxFileSize",
        condition: (value: number) => value >= 0,
        message: this.t(
          "config.maxFileSizeValidation",
          "Max file size must be a positive number of bytes (0 = disabled)",
        ),
      },
      {
        key: "timespan",
        condition: (value: string) => {
          try {
            stringToTimespan(value);
            return true;
          } catch {
            return false;
          }
        },
        message: this.t(
          "config.timespanValidation",
          "Invalid timespan format (e.g., '7d', '24h', '30m')",
        ),
      },
    ];

    const validation = validations.find((validation) => validation.key == key);
    if (validation && typeof value === "number") {
      const cond = validation.condition as (v: number) => boolean;
      if (!cond(value)) {
        throw new BadRequestException(validation.message);
      }
    } else if (validation && typeof value === "string" && key === "timespan") {
      const cond = validation.condition as (v: string) => boolean;
      if (!cond(value)) {
        throw new BadRequestException(validation.message);
      }
    }
  }

  isEditAllowed(): boolean {
    return this.yamlConfig === undefined || this.yamlConfig === null;
  }

  /**
   * Reloads the in-memory configVariables from the database. Used after
   * internal secrets (e.g. JWT rotation) are persisted so get*() reflects
   * the new values without a restart.
   */
  async reload(): Promise<void> {
    this.configVariables = await this.prisma.config.findMany();
  }

  private t(
    key: string,
    fallback: string,
    args?: Record<string, string | number | boolean>,
  ) {
    const translated = I18nContext.current()?.t(key, { args });
    if (translated && translated !== key) return translated;

    return Object.entries(args ?? {}).reduce(
      (message, [argKey, value]) =>
        message.replaceAll(`{${argKey}}`, String(value)),
      fallback,
    );
  }
}
