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

  private readonly auditChainBroken = new Gauge({
    name: "audit_log_hash_chain_broken",
    help: "1 when the daily audit log hash chain verification failed (tampering or read error), 0 when OK (exported by the backend)",
    registers: [this.registry],
  });

  // TLS cert expiry (issue #15, 2.8.1): exported by TlsCertificateChecker,
  // which probes the live HTTPS endpoint. The series only exists while the
  // last probe succeeded — alerts stay quiet instead of firing on 0.
  private readonly tlsCertificateExpiryTimestamp = new Gauge({
    name: "caddy_tls_certificate_expiry_timestamp",
    help: "Unix timestamp (seconds) when the public TLS certificate expires, per domain. Exported by the backend via live TLS handshake probe.",
    labelNames: ["domain"] as const,
    registers: [this.registry],
  });

  private readonly tlsProbeSuccess = new Gauge({
    name: "tls_certificate_probe_success",
    help: "1 when the last TLS handshake probe succeeded for the domain, 0 when it failed",
    labelNames: ["domain"] as const,
    registers: [this.registry],
  });

  // Access review (#11/#24): exported daily by AccessReviewService so the
  // AccessReviewOverdue alert has real data behind it.
  private readonly accessReviewOverdueUsers = new Gauge({
    name: "access_review_overdue_users",
    help: "Number of users whose access review is overdue (>90 days) or has never been done",
    registers: [this.registry],
  });

  onModuleInit() {
    collectDefaultMetrics({ register: this.registry });
    this.sqliteIntegrityFailed.set(0);
    this.auditChainBroken.set(0);
    this.accessReviewOverdueUsers.set(0);
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

  setAuditChainBroken(broken: boolean): void {
    this.auditChainBroken.set(broken ? 1 : 0);
  }

  setTlsCertificateExpiry(domain: string, expirySeconds: number): void {
    this.tlsCertificateExpiryTimestamp.set({ domain }, expirySeconds);
    this.tlsProbeSuccess.set({ domain }, 1);
  }

  /** Probe failed: drop the expiry series so expiry alerts stay quiet. */
  setTlsProbeFailed(domain: string): void {
    this.tlsProbeSuccess.set({ domain }, 0);
    this.tlsCertificateExpiryTimestamp.remove({ domain });
  }

  setUserAccessReviewOverdue(count: number): void {
    this.accessReviewOverdueUsers.set(count);
  }
}
