import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import { Response } from "express";

@Catch(ThrottlerException)
export class ThrottlerExceptionFilter implements ExceptionFilter<ThrottlerException> {
  catch(exception: ThrottlerException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    response.setHeader("Retry-After", "60");
    response.status(429).json({
      statusCode: 429,
      message: "Too Many Requests",
      error: "Throttler",
    });
  }
}
