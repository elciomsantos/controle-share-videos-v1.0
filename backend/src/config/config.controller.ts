import {
  Body,
  Controller,
  FileTypeValidator,
  Get,
  GatewayTimeoutException,
  InternalServerErrorException,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { createKeyv, RedisClientOptions } from "@keyv/redis";
import { I18nService } from "nestjs-i18n";
import { Throttle } from "@nestjs/throttler";
import { Request } from "express";
import { AdminOnly, Public } from "../auth/decorator/guards.decorator";
import { GetUser } from "../auth/decorator/getUser.decorator";
import { EmailService } from "../email/email.service";
import { ConfigService } from "./config.service";
import { JwtSecretService } from "./jwt-secret.service";
import { AdminConfigDTO } from "./dto/adminConfig.dto";
import { ConfigDTO } from "./dto/config.dto";
import { TestEmailDTO } from "./dto/testEmail.dto";
import UpdateConfigDTO from "./dto/updateConfig.dto";
import { LogoService } from "./logo.service";

@Controller("configs")
export class ConfigController {
  constructor(
    private configService: ConfigService,
    private logoService: LogoService,
    private emailService: EmailService,
    private jwtSecretService: JwtSecretService,
    private readonly i18n: I18nService,
  ) {}

  @Get()
  @Public()
  async list() {
    return new ConfigDTO().fromList(await this.configService.list());
  }

  @Get("admin/:category")
  @AdminOnly()
  async getByCategory(@Param("category") category: string) {
    return new AdminConfigDTO().fromList(
      await this.configService.getByCategory(category),
    );
  }

  @Patch("admin")
  @AdminOnly()
  async updateMany(@Body() data: UpdateConfigDTO[]) {
    return new AdminConfigDTO().fromList(
      (await this.configService.updateMany(data)) as Partial<AdminConfigDTO>[],
    );
  }

  @Post("admin/testEmail")
  @AdminOnly()
  async testEmail(@Body() { email }: TestEmailDTO) {
    await this.emailService.sendTestMail(email);
  }

  @Post("admin/rotateJwtSecret")
  @AdminOnly()
  // Tighter than the global throttle: rotation is an infrequent, high-impact
  // operation and repeated calls would churn the secret history.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async rotateJwtSecret(
    @GetUser() user: { email?: string },
    @Req() req: Request,
  ) {
    return this.jwtSecretService.rotate(user?.email ?? "admin", req.ip);
  }

  @Post("admin/testRedis")
  @AdminOnly()
  async testRedis() {
    const redisUrl = this.configService.getString("cache.redis-url");
    const enabled = this.configService.getBoolean("cache.redis-enabled");

    if (!redisUrl) {
      throw new InternalServerErrorException(
        this.i18n.t("config.redisUrlNotSet"),
      );
    }

    const withTimeout = async <T>(
      promise: Promise<T>,
      timeoutMs: number,
    ): Promise<T> => {
      let timeout: NodeJS.Timeout | undefined;
      try {
        return await Promise.race([
          promise,
          new Promise<T>((_, reject) => {
            timeout = setTimeout(
              () =>
                reject(
                  new GatewayTimeoutException(
                    this.i18n.t("config.redisTimedOut"),
                  ),
                ),
              timeoutMs,
            );
          }),
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    };

    const keyv = createKeyv(
      {
        url: redisUrl,
        socket: {
          connectTimeout: 3000,
          reconnectStrategy: () =>
            new Error(this.i18n.t("config.redisConnectionFailed")),
        },
      } as RedisClientOptions,
      { namespace: "pingvin" },
    );
    const testKey = `connection-test:${Date.now()}`;

    try {
      await withTimeout(keyv.set(testKey, "ok", 5000), 5000);
      const value = await withTimeout(keyv.get(testKey), 5000);
      if (value !== "ok") {
        throw new Error(this.i18n.t("config.redisUnexpectedResponse"));
      }

      return { ok: true, enabled };
    } catch (e: unknown) {
      if (e instanceof GatewayTimeoutException) throw e;
      const message =
        e instanceof Error
          ? `${e.name ? `${e.name}: ` : ""}${e.message}`
          : this.i18n.t("config.redisError");
      throw new InternalServerErrorException(message);
    } finally {
      const store = (
        keyv as { store?: { client?: { quit?: () => Promise<void> } } }
      ).store;
      try {
        await store?.client?.quit?.();
      } catch {
        // ignore cleanup errors
      }
    }
  }

  @Post("admin/logo")
  @UseInterceptors(FileInterceptor("file"))
  @AdminOnly()
  async uploadLogo(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new FileTypeValidator({ fileType: "image/png" })],
      }),
    )
    file: Express.Multer.File,
  ) {
    return await this.logoService.create(file.buffer);
  }

  @Post("admin/logoDark")
  @UseInterceptors(FileInterceptor("file"))
  @AdminOnly()
  async uploadDarkLogo(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new FileTypeValidator({ fileType: "image/png" })],
      }),
    )
    file: Express.Multer.File,
  ) {
    return await this.logoService.createDark(file.buffer);
  }
}
