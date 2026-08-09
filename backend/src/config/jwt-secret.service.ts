import {
  BadRequestException,
  Injectable,
  Logger,
} from "@nestjs/common";
import * as crypto from "crypto";
import * as fs from "fs";
import { I18nContext } from "nestjs-i18n";
import { ConfigService } from "./config.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  decryptSecret,
  encryptSecret,
  hasEncryptionKey,
  isEncrypted,
} from "./jwt-secret-crypto";

/**
 * Resolves the JWT signing secret from external secret managers (env / Docker
 * secret file) with fallback to the DB-backed `internal.jwtSecret`, and keeps
 * a rotation history (`internal.jwtSecretHistory`) so previously-signed tokens
 * keep validating until they expire.
 *
 * History retention is aligned to the longest-lived token (share tokens can
 * live up to 1 year): entries are kept for ~13 months (age-based eviction)
 * with a hard cap on count as a safety net.
 */
@Injectable()
export class JwtSecretService {
  private readonly logger = new Logger(JwtSecretService.name);
  private static readonly MAX_HISTORY = 13;
  private static readonly MAX_AGE_MS = 1000 * 60 * 60 * 24 * 395; // ~13 months
  private static readonly SECRET_FILE =
    process.env.JWT_SECRET_FILE || "/run/secrets/jwt_secret";

  private cache: {
    current: string;
    verification: string[];
    byKid: Map<string, string>;
  } | null = null;
  private fileSecret: string | null | undefined;
  private rotation: Promise<void> = Promise.resolve();
  private warnedMissingEncryptionKey = false;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  /**
   * Secret used to SIGN new tokens. Precedence: JWT_SECRET env var, then the
   * Docker secret file, then the DB config variable — unless a hybrid rotation
   * already switched the source to `internal.jwtSecretSource = "db"`.
   * Resolved once and cached; invalidated only on rotation.
   */
  getCurrentSecret(): string {
    return this.getCache().current;
  }

  /**
   * All secrets accepted for verification: the current one plus the retired
   * history. Order matters — current first (fast path), then newest→oldest.
   */
  getVerificationSecrets(): string[] {
    return this.getCache().verification;
  }

  /** Stable `kid` (key id) derived from a secret, embedded in new JWTs. */
  getKid(secret: string): string {
    return crypto.createHash("sha256").update(secret).digest("hex").slice(0, 16);
  }

  /** Resolves a secret by its `kid` in O(1) among all verification secrets. */
  getSecretByKid(kid?: string): string | undefined {
    if (!kid) return undefined;
    return this.getCache().byKid.get(kid);
  }

  /**
   * Resolves the secret that signed a raw token by reading its header `kid`.
   * Returns undefined when the token has no kid or the kid is unknown.
   */
  resolveSecretForToken(token: string): string | undefined {
    try {
      const [headerB64] = token.split(".");
      if (!headerB64) return undefined;
      const header = JSON.parse(
        Buffer.from(headerB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
      ) as { kid?: string };
      return this.getSecretByKid(header.kid);
    } catch {
      return undefined;
    }
  }

  /**
   * Rotates the signing secret without dropping active sessions: the current
   * secret moves into the history (still valid for verification) and a new
   * random secret is persisted as `internal.jwtSecret`.
   *
   * When the current secret comes from a Docker secret file (production), the
   * rotation is hybrid: the file secret is adopted into the history, the new
   * secret is persisted in the DB and `internal.jwtSecretSource` flips to
   * `db`, making the DB authoritative from then on. Env-var secrets cannot be
   * rotated (nothing to write to) and are rejected.
   */
  async rotate(
    actor = "unknown",
    ip?: string,
  ): Promise<{ rotated: true; retainedSecrets: number }> {
    // Serialize rotations (in-process mutex): prevents two concurrent calls
    // from reading the same pre-rotation state and orphaning tokens signed
    // with a secret that never lands in the history.
    const previous = this.rotation;
    let release!: () => void;
    this.rotation = new Promise<void>((resolve) => (release = resolve));
    await previous;

    try {
      if (process.env.JWT_SECRET?.trim()) {
        throw new BadRequestException(this.t("jwtSecretExternallyManaged"));
      }
      if (!this.config.isEditAllowed()) {
        throw new BadRequestException(this.t("jwtSecretExternallyManaged"));
      }

      const source = this.getSecretSource();
      const fileSecret = this.readFileSecret();
      const dbSecret = this.readDbSecret();

      if (source === "db") {
        if (!dbSecret) {
          throw new BadRequestException(this.t("jwtSecretExternallyManaged"));
        }
      } else if (fileSecret) {
        // Hybrid rotation — see docblock above.
      }
      const current =
        source === "db"
          ? dbSecret
          : fileSecret || dbSecret;

      const nextHistory: Array<{ s: string; rot: number }> = [
        { s: current, rot: Date.now() },
        ...this.getHistoryEntries()
          .filter((e) => e.secret !== current)
          .map((e) => ({ s: e.secret, rot: e.rotatedAt })),
      ].slice(0, JwtSecretService.MAX_HISTORY);

      const newSecret = crypto.randomBytes(256).toString("base64");

      const writes: ReturnType<typeof this.prisma.config.update>[] = [
        this.prisma.config.update({
          where: { name_category: { category: "internal", name: "jwtSecret" } },
          data: { value: encryptSecret(newSecret) },
        }),
        this.prisma.config.update({
          where: {
            name_category: { category: "internal", name: "jwtSecretHistory" },
          },
          data: { value: encryptSecret(JSON.stringify(nextHistory)) },
        }),
      ];

      // Switch the DB to authoritative once a file secret is adopted, so the
      // rotated DB secret is actually used for signing afterwards.
      if (source === "auto" && fileSecret) {
        writes.push(
          this.prisma.config.update({
            where: {
              name_category: { category: "internal", name: "jwtSecretSource" },
            },
            data: { value: "db" },
          }),
        );
      }

      await this.prisma.$transaction(writes);

      await this.config.reload();
      this.invalidateCache();

      this.logger.log(
        `JWT secret rotated by ${actor}${ip ? ` from ${ip}` : ""}; ` +
          `${nextHistory.length} previous secret(s) retained for verification.`,
      );
      return { rotated: true, retainedSecrets: nextHistory.length };
    } finally {
      release();
    }
  }

  private invalidateCache(): void {
    this.cache = null;
    this.fileSecret = undefined;
  }

  private getCache(): {
    current: string;
    verification: string[];
    byKid: Map<string, string>;
  } {
    if (!this.cache) {
      const envSecret = process.env.JWT_SECRET?.trim();
      const dbSecret = this.readDbSecret();
      const current =
        this.getSecretSource() === "db"
          ? dbSecret
          : envSecret || this.readFileSecret() || dbSecret;
      const history = this.getHistoryEntries()
        .filter((e) => e.secret !== current)
        .map((e) => e.secret);
      const verification = [current, ...history];
      this.cache = {
        current,
        verification,
        byKid: new Map(verification.map((s) => [this.getKid(s), s])),
      };
    }
    return this.cache;
  }

  /**
   * Reads the DB secret, decrypting it at rest when an encryption key is set.
   * Warns once (per cache build) when the value is encrypted but the key is
   * missing — a misconfiguration that invalidates all signed tokens.
   */
  private readDbSecret(): string {
    const raw = this.config.getString("internal.jwtSecret");
    if (
      isEncrypted(raw) &&
      !hasEncryptionKey() &&
      !this.warnedMissingEncryptionKey
    ) {
      this.warnedMissingEncryptionKey = true;
      this.logger.error(
        "DB JWT secret is encrypted but JWT_SECRET_ENCRYPTION_KEY is not " +
          "configured; existing tokens can no longer be verified.",
      );
    }
    return decryptSecret(raw);
  }

  /**
   * Reads the Docker secret file once (cached) so the hot path stays in
   * memory; a missing/unreadable file is cached as `null` instead of throwing
   * on every request.
   */
  private readFileSecret(): string | null {
    if (this.fileSecret === undefined) {
      try {
        this.fileSecret =
          fs.readFileSync(JwtSecretService.SECRET_FILE, "utf8").trim() || null;
      } catch {
        this.fileSecret = null;
      }
    }
    return this.fileSecret;
  }

  private getSecretSource(): string {
    try {
      return this.config.getString("internal.jwtSecretSource") || "auto";
    } catch {
      return "auto";
    }
  }

  /**
   * Parses the rotation history, normalizing legacy plain arrays
   * (`["old-1"]`) into timestamped entries, and evicts entries older than the
   * retention window (~13 months, covering 1-year share tokens).
   */
  private getHistoryEntries(): Array<{ secret: string; rotatedAt: number }> {
    let raw: string;
    try {
      raw = this.config.getString("internal.jwtSecretHistory");
    } catch {
      // Row missing (e.g. pre-upgrade install) — no history to retain.
      return [];
    }
    const plain = decryptSecret(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(plain);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];

    const cutoff = Date.now() - JwtSecretService.MAX_AGE_MS;
    return parsed
      .map((entry): { secret: string; rotatedAt: number } | null => {
        if (typeof entry === "string" && entry.length > 0) {
          // Legacy plain-string entry (no rotation timestamp) — treat as fresh
          // so it is never evicted until the next rotation writes timestamps.
          return { secret: entry, rotatedAt: Date.now() };
        }
        if (entry && typeof entry === "object") {
          const e = entry as { s?: unknown; rot?: unknown };
          if (typeof e.s === "string" && e.s.length > 0) {
            return {
              secret: e.s,
              rotatedAt: typeof e.rot === "number" ? e.rot : Date.now(),
            };
          }
        }
        return null;
      })
      .filter((e): e is { secret: string; rotatedAt: number } => e !== null)
      .filter((e) => e.rotatedAt >= cutoff)
      .sort((a, b) => b.rotatedAt - a.rotatedAt);
  }

  private t(
    key: string,
    args?: Record<string, string | number | boolean>,
  ): string {
    const translated = I18nContext.current()?.t(key, { args }) as string | undefined;
    if (translated && translated !== key) return translated;

    const fallbacks: Record<string, string> = {
      jwtSecretExternallyManaged:
        "JWT secret is externally managed (env var or Docker secret file); rotate it in the secret manager instead.",
    };
    return Object.entries(args ?? {}).reduce(
      (message, [argKey, value]) =>
        message.replaceAll(`{${argKey}}`, String(value)),
      fallbacks[key] ?? key,
    );
  }
}
