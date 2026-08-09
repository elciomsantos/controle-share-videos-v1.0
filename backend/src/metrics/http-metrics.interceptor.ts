import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, tap, catchError, throwError } from "rxjs";
import { Request, Response } from "express";
import { MetricsService } from "./metrics.service";

/**
 * Global interceptor that feeds per-route HTTP metrics into MetricsService.
 * Registered via APP_INTERCEPTOR in MetricsModule so every request is measured
 * (both successful responses and thrown exceptions, with the right status).
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const route = this.normalizeRoute(req);

    // Do not measure the metrics endpoint itself (self-scrape noise).
    if (route === "/metrics") {
      return next.handle();
    }

    const start = process.hrtime.bigint();
    const record = (status: number) => {
      const durationSeconds =
        Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.recordHttpRequest(
        req.method,
        route,
        status,
        durationSeconds,
      );
    };

    return next.handle().pipe(
      tap(() => record(res.statusCode ?? 200)),
      catchError((err: unknown) => {
        const status =
          typeof err === "object" && err !== null
            ? (err as { status?: number }).status
            : undefined;
        record(status ?? 500);
        return throwError(() => err);
      }),
    );
  }

  /**
   * Returns the route pattern (e.g. `/share/:id`) instead of the concrete
   * path, keeping label cardinality bounded. Falls back to the raw path when
   * no route matched (404s).
   */
  private normalizeRoute(req: Request): string {
    const pattern = req.route?.path;
    if (pattern) return pattern;
    return req.path || "/";
  }
}
