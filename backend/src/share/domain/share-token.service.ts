import { Injectable } from "@nestjs/common";
import { JwtService, JwtSignOptions } from "@nestjs/jwt";
import { ConfigService } from "../../config/config.service";
import * as crypto from "crypto";
import dayjs from "dayjs";
import { Share, ShareSecurity } from "../../../prisma/generated/prisma/client";
import { isEpochZero } from "../../utils/date.util";

@Injectable()
export class ShareTokenService {
  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async generateShareToken(share: Share & { security?: ShareSecurity }): Promise<string> {
    const { id: shareId, expiration, createdAt, security } = share;

    const tokenPayload = {
      shareId,
      shareCreatedAt: dayjs(createdAt).unix(),
      sharePasswordSignature: this.getSharePasswordSignature(security?.password),
      iat: dayjs().unix(),
    };

    const tokenOptions: JwtSignOptions = {
      secret: this.config.getString("internal.jwtSecret"),
    };

    if (!isEpochZero(expiration)) {
      const diffSeconds = dayjs(expiration).diff(new Date(), "seconds");
      tokenOptions.expiresIn = diffSeconds > 0 ? diffSeconds : 3600;
    }

    return this.jwtService.sign(tokenPayload, tokenOptions);
  }

  async verifyShareToken(
    share: Share & { security?: ShareSecurity },
    token: string,
  ): Promise<boolean> {
    const { expiration, createdAt, security } = share;

    try {
      const claims = this.jwtService.verify(token, {
        secret: this.config.getString("internal.jwtSecret"),
        ignoreExpiration: isEpochZero(expiration),
      });

      return (
        claims.shareId === share.id &&
        claims.shareCreatedAt === dayjs(createdAt).unix() &&
        (!security?.password ||
          claims.sharePasswordSignature === this.getSharePasswordSignature(security.password))
      );
    } catch {
      return false;
    }
  }

  private getSharePasswordSignature(password?: string | null): string | undefined {
    if (!password) return undefined;

    return crypto
      .createHmac("sha512", this.config.getString("internal.jwtSecret"))
      .update(password)
      .digest("hex");
  }
}
