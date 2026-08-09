import { Injectable } from "@nestjs/common";
import { JwtService, JwtSignOptions } from "@nestjs/jwt";
import * as crypto from "crypto";
import dayjs from "dayjs";
import { Share, ShareSecurity } from "../../../prisma/generated/prisma/client";
import { JwtSecretService } from "../../config/jwt-secret.service";
import { isEpochZero } from "../../utils/date.util";

@Injectable()
export class ShareTokenService {
  constructor(
    private jwtService: JwtService,
    private jwtSecret: JwtSecretService,
  ) {}

  async generateShareToken(share: Share & { security?: ShareSecurity }): Promise<string> {
    const { id: shareId, expiration, createdAt, security } = share;
    const secret = this.jwtSecret.getCurrentSecret();

    const tokenPayload = {
      shareId,
      shareCreatedAt: dayjs(createdAt).unix(),
      sharePasswordSignature: this.getSharePasswordSignature(security?.password, secret),
      iat: dayjs().unix(),
    };

    const tokenOptions: JwtSignOptions = {
      expiresIn: isEpochZero(expiration) ? "1y" : Math.max(1, dayjs(expiration).diff(dayjs(), "seconds")),
      secret,
      keyid: this.jwtSecret.getKid(secret),
    };

    return this.jwtService.signAsync(tokenPayload, tokenOptions);
  }

  async verifyShareToken(
    share: Share & { security?: ShareSecurity },
    token: string,
  ): Promise<boolean> {
    const { expiration, createdAt, security } = share;
    // O(1): resolve the exact secret that signed the token by its header kid,
    // falling back to the current secret for legacy tokens without a kid. The
    // password signature is HMAC'd with that same secret, so both sides agree.
    const secret =
      this.jwtSecret.resolveSecretForToken(token) ?? this.jwtSecret.getCurrentSecret();
    try {
      const claims = await this.jwtService.verifyAsync(token, {
        secret,
        algorithms: ["HS256", "HS512"],
        ignoreExpiration: isEpochZero(expiration),
      });
      return (
        claims.shareId === share.id &&
        claims.shareCreatedAt === dayjs(createdAt).unix() &&
        (!security?.password ||
          this.signaturesMatch(
            claims.sharePasswordSignature,
            this.getSharePasswordSignature(security.password, secret),
          ))
      );
    } catch {
      return false;
    }
  }

  /**
   * Constant-time comparison of the two HMAC-SHA512 signatures (128 hex chars
   * each). Length is fixed by construction; a length guard avoids a crash if a
   * malformed claim ever sneaks through.
   */
  private signaturesMatch(a?: string, b?: string): boolean {
    if (!a || !b) return a === b;
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  private getSharePasswordSignature(
    password?: string | null,
    secret?: string,
  ): string | undefined {
    if (!password) return undefined;
    return crypto
      .createHmac("sha512", secret ?? this.jwtSecret.getCurrentSecret())
      .update(password)
      .digest("hex");
  }
}
