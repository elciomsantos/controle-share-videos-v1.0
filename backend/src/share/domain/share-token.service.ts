import { Injectable } from "@nestjs/common";
import * as crypto from "crypto";
import dayjs from "dayjs";
import { Share } from "../../../prisma/generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { isEpochZero } from "../../utils/date.util";

@Injectable()
export class ShareTokenService {
  constructor(private prisma: PrismaService) {}

  /**
   * Gera um share token opaco com 256 bits de entropia (§23.2) e persiste
   * apenas o SHA-256 (§23). O texto puro é retornado uma única vez para o
   * cookie `share_${id}_token`.
   */
  async generateShareToken(
    share: Pick<Share, "id" | "expiration">,
    context?: { ip?: string; userAgent?: string | null },
  ): Promise<string> {
    const plainToken = crypto.randomBytes(32).toString("base64url");
    const expiresAt = !share.expiration || isEpochZero(share.expiration)
      ? dayjs().add(1, "year").toDate()
      : new Date(share.expiration.getTime());

    await this.prisma.shareToken.create({
      data: {
        shareId: share.id,
        tokenHash: this.hashToken(plainToken),
        expiresAt,
        ipAddress: context?.ip ?? null,
        userAgent: context?.userAgent ?? null,
      },
    });

    return plainToken;
  }

  /**
   * Token expirado ou revogado deve ser rejeitado (§23.4). O share é resolvido
   * antes pelo guard (404 para share inexistente/expirado).
   */
  async verifyShareToken(share: Pick<Share, "id">, token?: string): Promise<boolean> {
    if (!token) return false;
    const record = await this.prisma.shareToken.findUnique({
      where: { tokenHash: this.hashToken(token) },
    });
    if (!record || record.shareId !== share.id || record.revokedAt) return false;
    if (record.expiresAt < new Date()) return false;
    return true;
  }

  /**
   * Revoga em lote os tokens ativos do share (ex.: troca de senha) marcando
   * revokedAt — mantém o histórico para auditoria (§23/§29.4 SHARE_REVOKED).
   */
  async revokeAllForShare(shareId: string): Promise<void> {
    await this.prisma.shareToken.updateMany({
      where: { shareId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}