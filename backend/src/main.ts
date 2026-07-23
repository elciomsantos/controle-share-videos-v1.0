import { ClassSerializerInterceptor, Logger, LogLevel } from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import cors from "cors";
import { NextFunction, Request, Response } from "express";
import * as fs from "fs";
import helmet from "helmet";
import { I18nValidationExceptionFilter, I18nValidationPipe } from "nestjs-i18n";
import { AppModule } from "./app.module";
import { ConfigService } from "./config/config.service";
import {
  DATA_DIRECTORY,
  LOG_LEVEL_AVAILABLE,
  LOG_LEVEL_DEFAULT,
  LOG_LEVEL_ENV,
} from "./constants";
import { ThrottlerExceptionFilter } from "./throttler/throttler-exception.filter";

function generateNestJsLogLevels(): LogLevel[] {
  if (LOG_LEVEL_ENV) {
    const levelIndex = LOG_LEVEL_AVAILABLE.indexOf(LOG_LEVEL_ENV as any);
    if (levelIndex === -1) {
      throw new Error(`log level ${LOG_LEVEL_ENV} unknown`);
    }

    return LOG_LEVEL_AVAILABLE.slice(levelIndex, LOG_LEVEL_AVAILABLE.length);
  } else {
    const levelIndex = LOG_LEVEL_AVAILABLE.indexOf(LOG_LEVEL_DEFAULT);
    return LOG_LEVEL_AVAILABLE.slice(levelIndex, LOG_LEVEL_AVAILABLE.length);
  }
}

async function bootstrap() {
  const logLevels = generateNestJsLogLevels();
  Logger.log(`Showing ${logLevels.join(", ")} messages`);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: logLevels,
  });

  app.useGlobalPipes(new I18nValidationPipe({ whitelist: true }));
  app.useGlobalFilters(
    new I18nValidationExceptionFilter(),
    new ThrottlerExceptionFilter(),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  const config = app.get<ConfigService>(ConfigService);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const chunkSize = config.get("share.chunkSize");
    bodyParser.raw({
      type: "application/octet-stream",
      limit: `${chunkSize}B`,
    })(req, res, next);
  });

  app.use(cookieParser());

  app.set("trust proxy", process.env.TRUST_PROXY === "true");

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: { policy: "same-origin" },
      referrerPolicy: { policy: "same-origin" },
      strictTransportSecurity: {
        maxAge: 31536000,
        includeSubDomains: true,
      },
    }),
  );

  // Permissions-Policy header (not supported by current helmet version)
  app.use((_req, res, next) => {
    res.setHeader(
      "Permissions-Policy",
      "geolocation=(), camera=(), microphone=()",
    );
    next();
  });

  const corsOriginsEnv = process.env.CORS_ORIGIN;
  const corsOrigin = corsOriginsEnv
    ? corsOriginsEnv.split(",").map((o) => o.trim())
    : false;
  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
    }),
  );

  await fs.promises.mkdir(`${DATA_DIRECTORY}/uploads/_temp`, {
    recursive: true,
  });

  app.setGlobalPrefix("api");

  const swaggerEnabled =
    process.env.NODE_ENV !== "production" &&
    process.env.SWAGGER_ENABLED === "true";
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Controle Share Videos API")
      .setVersion("1.0")
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("api/swagger", app, document);
  }

  await app.listen(
    parseInt(process.env.BACKEND_PORT || process.env.PORT || "8080"),
  );

  const logger = new Logger("UnhandledAsyncError");
  process.on("unhandledRejection", (e) => logger.error(e));
}
bootstrap();
