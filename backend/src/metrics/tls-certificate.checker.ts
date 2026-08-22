import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import * as tls from "tls";
import { ConfigService } from "../config/config.service";
import { MetricsService } from "./metrics.service";

/**
 * Exports the public TLS certificate expiry as the
 * `caddy_tls_certificate_expiry_timestamp{domain}` gauge (issue #15, 2.8.1),
 * closing the gap where alerts.yml referenced the metric with no exporter.
 *
 * Strategy: probe the LIVE HTTPS endpoint with a real handshake instead of
 * reading Caddy internals (the prod Caddyfile runs `admin off`). This
 * validates exactly what users experience — if the public certificate is
 * wrong/expired, the metric reflects it regardless of which component
 * terminates TLS.
 *
 * Domains probed: TLS_PROBE_DOMAINS (comma-separated) → hostname of
 * general.appUrl → DOMAIN env. Environments without HTTPS simply report
 * probe failure and export no expiry series (expiry alerts stay quiet).
 *
 * Runs every 6 hours; certificates live ~90 days, so 6h granularity is
 * plenty for a 30-day alert threshold.
 */
@Injectable()
export class TlsCertificateChecker {
  private readonly logger = new Logger(TlsCertificateChecker.name);
  private static readonly PROBE_TIMEOUT_MS = 10_000;

  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {}

  /** Resolves the probe targets once per run so config changes are picked up. */
  resolveDomains(): string[] {
    const envDomains = process.env.TLS_PROBE_DOMAINS?.trim();
    if (envDomains) {
      return envDomains
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);
    }
    try {
      const appUrl = this.config.getString("general.appUrl");
      const hostname = new URL(appUrl).hostname;
      if (hostname && !/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(hostname)) {
        return [hostname];
      }
    } catch {
      // appUrl not set or invalid — fall through to DOMAIN env.
    }
    const domain = process.env.DOMAIN?.trim();
    return domain ? [domain] : [];
  }

  @Cron("23 */6 * * *", { name: "tls-certificate-check" })
  check(): void {
    const domains = this.resolveDomains();
    if (domains.length === 0) {
      this.logger.warn(
        "No TLS probe domain configured (TLS_PROBE_DOMAINS / general.appUrl / DOMAIN); skipping certificate check",
      );
      return;
    }
    for (const domain of domains) {
      // Sequential on purpose: one shared Prometheus scrape, negligible cost.
      void this.checkDomain(domain);
    }
  }

  async checkDomain(domain: string): Promise<void> {
    try {
      const expirySeconds = await this.probeExpiry(domain);
      this.metrics.setTlsCertificateExpiry(domain, expirySeconds);
      const daysLeft = Math.floor((expirySeconds - Date.now() / 1000) / 86400);
      this.logger.log(
        `TLS cert for ${domain} expires at ${new Date(expirySeconds * 1000).toISOString()} (${daysLeft} days left)`,
      );
      if (daysLeft < 30) {
        this.logger.warn(
          `TLS certificate for ${domain} expires in ${daysLeft} days — verify Let's Encrypt renewal`,
        );
      }
    } catch (err: unknown) {
      this.metrics.setTlsProbeFailed(domain);
      this.logger.error(
        `TLS certificate probe failed for ${domain}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Performs a TLS handshake and returns the peer certificate's notAfter as
   * unix seconds. Rejects unauthorized certs (a MITM/broken chain must NOT
   * be reported as a healthy expiry).
   */
  private probeExpiry(domain: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const socket = tls.connect({
        host: domain,
        port: Number(process.env.TLS_PROBE_PORT ?? 443),
        servername: domain,
        rejectUnauthorized: true,
        timeout: TlsCertificateChecker.PROBE_TIMEOUT_MS,
      });

      socket.once("timeout", () => {
        socket.destroy();
        reject(new Error(`handshake timeout after ${TlsCertificateChecker.PROBE_TIMEOUT_MS}ms`));
      });
      socket.once("error", (err) => {
        socket.destroy();
        reject(err);
      });
      socket.once("secureConnect", () => {
        try {
          const cert = socket.getPeerCertificate();
          const notAfter = cert?.valid_to
            ? new Date(cert.valid_to).getTime()
            : NaN;
          if (Number.isNaN(notAfter)) {
            reject(new Error("peer certificate has no valid_to"));
            return;
          }
          resolve(Math.floor(notAfter / 1000));
        } finally {
          socket.end();
        }
      });
    });
  }
}
