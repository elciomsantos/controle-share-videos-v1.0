/* eslint-disable @typescript-eslint/no-explicit-any -- LoggerService in
   @nestjs/common defines its methods with `any` parameters; matching that
   contract here keeps us compatible with the framework's loggers. */
import { LoggerService, Optional } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";
import { Logger } from "@nestjs/common";

/**
 * Per-request contextual data propagated through the async call graph via
 * Node's AsyncLocalStorage (GAP-02). Anything stored here is reachable from
 * deeply nested service code without having to thread it through every
 * function signature.
 */
export interface RequestContext {
  /** Correlation id surfaced as X-Request-Id by the main.ts middleware. */
  requestId: string;
  /** Best-effort client IP (already proxy-aware via app.set('trust proxy')). */
  ip?: string;
  /** Authenticated user id, when available (filled by guards). */
  userId?: string;
}

/**
 * Global AsyncLocalStorage instance for the request context. A single
 * instance is fine here because each concurrent request runs in its own
 * async context — values never leak between requests.
 */
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Logger that automatically prefixes every message with `[reqId=…]` (and
 * `[user=…]` when available) when running inside a request scope. Outside a
 * request scope it behaves exactly like the default NestJS Logger.
 *
 * This keeps the audit-required correlation id in every log line without
 * forcing a wholesale migration to pino/winston right before go-live.
 */
export class RequestContextLogger implements LoggerService {
  private readonly logger = new Logger();

  constructor(private readonly context?: string) {}

  /** Access the underlying NestJS Logger for advanced use cases. */
  protected get raw(): Logger {
    return this.logger;
  }

  private prefix(): string {
    const ctx = requestContextStorage.getStore();
    if (!ctx) return "";
    if (ctx.userId) return `[reqId=${ctx.requestId} user=${ctx.userId}] `;
    return `[reqId=${ctx.requestId}] `;
  }

  /**
   * If the caller did not pass an explicit NestJS context, append our own
   * service context so log lines still include the `SourceClass` suffix.
   * NestJS treats the trailing string argument as the context label.
   */
  @Optional()
  private withContext(params: any[]): any[] {
    if (!this.context) return params;
    const last = params[params.length - 1];
    if (last !== undefined && typeof last === "string") {
      return params;
    }
    return params.concat(this.context);
  }

  log(message: any, ...optionalParams: any[]): any {
    this.logger.log(this.prefix() + message, ...this.withContext(optionalParams));
    return true;
  }

  error(message: any, ...optionalParams: any[]): any {
    this.logger.error(this.prefix() + message, ...this.withContext(optionalParams));
    return true;
  }

  warn(message: any, ...optionalParams: any[]): any {
    this.logger.warn(this.prefix() + message, ...this.withContext(optionalParams));
    return true;
  }

  debug(message: any, ...optionalParams: any[]): any {
    this.logger.debug(this.prefix() + message, ...this.withContext(optionalParams));
    return true;
  }

  verbose(message: any, ...optionalParams: any[]): any {
    this.logger.verbose(this.prefix() + message, ...this.withContext(optionalParams));
    return true;
  }

  fatal(message: any, ...optionalParams: any[]): any {
    (this.logger as unknown as { fatal: (m: any, ...rest: any[]) => void }).fatal(
      this.prefix() + message,
      ...this.withContext(optionalParams),
    );
    return true;
  }
}

/**
 * Run `fn` inside a request context and return its result. Use this from
 * middlewares/guards to establish the scope; downstream `RequestContextLogger`
 * instances will pick up the values automatically.
 */
export function runInRequestContext<T>(
  ctx: RequestContext,
  fn: () => T,
): T {
  return requestContextStorage.run(ctx, fn);
}

/**
 * Read the current request context, if any. Returns undefined when called
 * outside a request scope (bootstrap code, scheduled jobs, event listeners).
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

/**
 * Merge `patch` into the active request context. Safe no-op when called
 * outside a request scope. Guards can call this after authentication to
 * stamp the resolved userId onto the in-flight context so downstream logs
 * include it.
 *
 * Mutating the stored object directly is intentional: AsyncLocalStorage
 * cannot be re-entered, and re-running the chain just to attach a value
 * would break idempotency contracts with downstream middlewares.
 */
export function enhanceRequestContext(patch: Partial<RequestContext>): void {
  const ctx = requestContextStorage.getStore();
  if (!ctx) return;
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) {
      (ctx as unknown as Record<string, unknown>)[k] = v;
    }
  }
}
