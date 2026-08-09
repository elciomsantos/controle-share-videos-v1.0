import { Injectable, OnModuleInit } from "@nestjs/common";
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client";

/**
 * Central Prometheus instrumentation for the application.
 *
 * Exposes:
 *  - Node.js runtime defaults (event loop lag, GC, heap) via collectDefaultMetrics;
 *  - HTTP traffic counters/histograms per route+method+status (fed by the
 *    HttpMetricsInterceptor);
 *  - business counters (shares created, download events, JWT rotations);
 *  - the sqlite_integrity_check_failed gauge, exported by the scheduled
 *    SqliteIntegrityChecker (previously referenced by alerts/dashboards with
 *    no backing exporter).
 */
@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry = new Registry();

  private readonly httpRequestsTotal = new Counter({
    name: "http_requests_total",
    help: "Total number of HTTP requests handled by the backend",
    labelNames: ["method", "route", "status"] as const,
    registers: [this.registry],
  });

  private readonly httpRequestDurationSeconds = new Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request latency in seconds",
    labelNames: ["method", "route"] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  private readonly sharesCreatedTotal = new Counter({
    name: "shares_created_total",
    help: "Total number of shares created",
    registers: [this.registry],
  });

  private readonly appEventsTotal = new Counter({
    name: "app_events_total",
    help: "Application events recorded through the download log (download, view, upload, delete)",
    labelNames: ["event", "success"] as const,
    registers: [this.registry],
  });

  private readonly jwtRotationsTotal = new Counter({
    name: "jwt_rotations_total",
    help: "Total number of JWT secret rotations performed",
    registers: [this.registry],
  });

  private readonly sqliteIntegrityFailed = new Gauge({
    name: "sqlite_integrity_check_failed",
    help: "1 when the latest PRAGMA integrity_check failed, 0 when OK (exported by the backend)",
    registers: [this.registry],
  });

  onModuleInit() {
    collectDefaultMetrics({ register: this.registry });
    this.sqliteIntegrityFailed.set(0);
  }

  /** Renders all registered metrics in the Prometheus text exposition format. */
  async metrics(): Promise<string> {
    return this.registry.metrics();
  }

  recordHttpRequest(
    method: string,
    route: string,
    status: number,
    durationSeconds: number,
  ): void {
    this.httpRequestsTotal.inc({ method, route, status: String(status) });
    this.httpRequestDurationSeconds.observe({ method, route }, durationSeconds);
  }

  incSharesCreated(): void {
    this.sharesCreatedTotal.inc();
  }

  incAppEvent(event: string, success: boolean): void {
    this.appEventsTotal.inc({ event, success: String(success) });
  }

  incJwtRotation(): void {
    this.jwtRotationsTotal.inc();
  }

  setSqliteIntegrityFailed(failed: boolean): void {
    this.sqliteIntegrityFailed.set(failed ? 1 : 0);
  }
}
