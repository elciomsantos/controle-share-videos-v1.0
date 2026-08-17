import { Module } from "@nestjs/common";

import { ScheduleModule } from "@nestjs/schedule";
import { AuthModule } from "./auth/auth.module";

import { existsSync } from "fs";
import { join } from "path";
import { I18nModule } from "nestjs-i18n";

import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { RequestThrottlerGuard } from "./throttler/request-throttler.guard";
import { AppCacheModule } from "./cache/cache.module";
import { AppController } from "./app.controller";
import { ConfigModule } from "./config/config.module";
import { DownloadLogModule } from "./download-log/download-log.module";
import { EmailModule } from "./email/email.module";
import { FileModule } from "./file/file.module";
import { JobsModule } from "./jobs/jobs.module";
import { MetricsModule } from "./metrics/metrics.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ShareModule } from "./share/share.module";
import { SystemModule } from "./system/system.module";
import { UserModule } from "./user/user.module";
import { JwtGuard } from "./auth/guard/jwt.guard";
import { RolesGuard } from "./auth/guard/roles.guard";
import { PasswordMustChangeGuard } from "./auth/guard/passwordMustChange.guard";

import { SystemLanguageResolver } from "./i18n/systemLanguage.resolver";

const i18nPath = existsSync(join(__dirname, "../i18n"))
  ? join(__dirname, "../i18n")
  : join(__dirname, "i18n");

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    ShareModule,
    FileModule,
    EmailModule,
    PrismaModule,
    JobsModule,
    UserModule,
    SystemModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    ScheduleModule.forRoot(),
    AppCacheModule,
    DownloadLogModule,
    MetricsModule,
    I18nModule.forRoot({
      fallbackLanguage: "pt-BR",
      loaderOptions: {
        path: i18nPath,
        watch: true,
      },
      resolvers: [SystemLanguageResolver],
    }),
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RequestThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PasswordMustChangeGuard,
    },
    SystemLanguageResolver,
  ],
})
export class AppModule {}
