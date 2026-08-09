import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import Database from "better-sqlite3";
import { DATABASE_URL } from "../constants";
import { MetricsService } from "./metrics.service";

/**
 * Exports the sqlite_integrity_check_failed gauge by periodically running
 * `PRAGMA integrity_check` against the application database. This closes the
 * gap where alerts.yml and the Grafana dashboard referenced the metric but no
 * exporter existed (verify-db.sh only prints to stdout).
 *
 * Uses a dedicated read-only connection so it never interferes with the
 * Prisma connection pool. Runs every 30 minutes by default.
 */
@Injectable()
export class SqliteIntegrityChecker {
  private readonly logger = new Logger(SqliteIntegrityChecker.name);

  constructor(private readonly metrics: MetricsService) {}

  @Cron(CronExpression.EVERY_30_MINUTES, {
    name: "sqlite-integrity-check",
  })
  check(): void {
    let failed = true;

    try {
      const path = DATABASE_URL.replace(/^file:/, "");
      const db = new Database(path, { readonly: true });
      try {
        const row = db.prepare("PRAGMA integrity_check").get() as
          | { integrity_check: string }
          | undefined;
        failed = row?.integrity_check !== "ok";
      } finally {
        db.close();
      }
    } catch (err) {
      this.logger.error(
        `SQLite integrity check failed to run: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    this.metrics.setSqliteIntegrityFailed(failed);
    if (failed) {
      this.logger.warn(
        "SQLite integrity check reported corruption — restore from backup immediately.",
      );
    }
  }
}
