import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import { I18nService } from "nestjs-i18n";
import { Response } from "express";

@Catch(ThrottlerException)
export class ThrottlerExceptionFilter implements ExceptionFilter<ThrottlerException> {
  constructor(private readonly i18n?: I18nService) {}

  async catch(exception: ThrottlerException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    const retryAfter = 60;
    let message = "Too Many Requests";

    if (this.i18n) {
      try {
        const translated = await this.i18n.t("auth.tooManyRequests", {
          args: { seconds: retryAfter },
          lang: "pt-BR",
        });
        if (translated) message = translated;
      } catch {
        // fall back to hardcoded
      }
    }

    response.setHeader("Retry-After", String(retryAfter));
    response.status(429).json({
      statusCode: 429,
      message,
      error: "Throttler",
    });
  }
}
