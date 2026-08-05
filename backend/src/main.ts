import { ClassSerializerInterceptor, Logger, LogLevel } from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import cors from "cors";
import { NextFunction, Request, Response } from "express";
import * as crypto from "crypto";
import * as fs from "fs";
import helmet from "helmet";
import { I18nValidationExceptionFilter, I18nValidationPipe, I18nService } from "nestjs-i18n";
import { AppModule } from "./app.module";
import { runInRequestContext } from "./common/request-context/request-context";
import { ConfigService } from "./config/config.service";
import {
  DATA_DIRECTORY,
  LOG_LEVEL_AVAILABLE,
  LOG_LEVEL_DEFAULT,
  LOG_LEVEL_ENV,
} from "./constants";
import { ThrottlerExceptionFilter } from "./throttler/throttler-exception.filter";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

function generateNestJsLogLevels(): LogLevel[] {
  if (LOG_LEVEL_ENV) {
    const levelIndex = LOG_LEVEL_AVAILABLE.indexOf(LOG_LEVEL_ENV as LogLevel);
    if (levelIndex === -1) {
      throw new Error(`log level ${LOG_LEVEL_ENV} unknown`);
    }

    return LOG_LEVEL_AVAILABLE.slice(levelIndex, LOG_LEVEL_AVAILABLE.length);
  } else {
    const levelIndex = LOG_LEVEL_AVAILABLE.indexOf(LOG_LEVEL_DEFAULT);
    return LOG_LEVEL_AVAILABLE.slice(levelIndex, LOG_LEVEL_AVAILABLE.length);
  }
}

export async function configureApp(
  app: NestExpressApplication,
  config: ConfigService,
) {
  app.useGlobalPipes(
    new I18nValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      disableErrorMessages: process.env.NODE_ENV === "production",
    }),
  );
  app.useGlobalFilters(
    new I18nValidationExceptionFilter(),
    new ThrottlerExceptionFilter(app.get(I18nService)),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  app.use((req: Request, res: Response, next: NextFunction) => {
    const chunkSize = config.get("share.chunkSize");
    bodyParser.raw({
      type: "application/octet-stream",
      limit: `${chunkSize}B`,
    })(req, res, next);
  });

  app.use(cookieParser());

  app.set("trust proxy", process.env.TRUST_PROXY === "true");

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

  // Correlation ID middleware (MED-04): attach a request id to every request
  // and surface it via the X-Request-Id response header for traceability.
  // GAP-02: also bind a request context to AsyncLocalStorage so any
  // downstream call can include the correlation id (and eventually user id)
  // in its log output via RequestContextLogger without threading it manually.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const incomingId =
      (req.headers["x-request-id"] as string | undefined) ??
      crypto.randomUUID();
    req.headers["x-request-id"] = incomingId;
    res.setHeader("X-Request-Id", incomingId);

    const ip = req.ip ?? req.socket?.remoteAddress ?? undefined;
    runInRequestContext({ requestId: incomingId, ip }, () => next());
  });

  // CSRF protection via double-submit cookie (CRIT-01).
  // GET /api/auth/csrf-token sets an httpOnly+sameSite cookie with a random
  // token; mutating requests must echo it back via the X-CSRF-Token header.
  const isSecure = config.get("general.secureCookies");
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Endpoint that issues the CSRF token cookie
    if (req.method === "GET" && req.path === "/api/auth/csrf-token") {
      const token = crypto.randomBytes(32).toString("base64url");
      res.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "strict",
        secure: isSecure,
        path: "/",
        maxAge: 1000 * 60 * 60 * 24 * 30 * 3, // 3 months
      });
      res.json({ token });
      return;
    }

    // Enforce on mutating methods, except auth refresh/signOut which rely on
    // sameSite=strict cookies and are safe by virtue of SameSite.
    if (MUTATING_METHODS.has(req.method)) {
      const cookieToken = req.cookies?.[CSRF_COOKIE_NAME] as
        | string
        | undefined;
      const headerToken = req.headers[CSRF_HEADER_NAME] as
        | string
        | undefined;
      if (
        !cookieToken ||
        !headerToken ||
        cookieToken.length < 32 ||
        cookieToken !== headerToken
      ) {
        res.status(403).json({ statusCode: 403, message: "csrf_invalid" });
        return;
      }
    }

    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          fontSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginResourcePolicy: { policy: "same-origin" },
      referrerPolicy: { policy: "same-origin" },
      strictTransportSecurity: {
        maxAge: 63072000,
        includeSubDomains: true,
        preload: true,
      },
    }),
  );

  // Permissions-Policy header (not supported by current helmet version)
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader(
      "Permissions-Policy",
      "geolocation=(), camera=(), microphone=()",
    );
    next();
  });

  await fs.promises.mkdir(`${DATA_DIRECTORY}/uploads/_temp`, {
    recursive: true,
  });

  app.setGlobalPrefix("api");
}

export async function createApp() {
  const logLevels = generateNestJsLogLevels();
  Logger.log(`Showing ${logLevels.join(", ")} messages`);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: logLevels,
  });

  await configureApp(app, app.get<ConfigService>(ConfigService));

  return app;
}

async function bootstrap() {
  const app = await createApp();

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

if (require.main === module) {
  bootstrap();
}
