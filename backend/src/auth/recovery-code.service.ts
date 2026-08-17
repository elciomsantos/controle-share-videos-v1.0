import { Injectable } from "@nestjs/common";
import * as crypto from "crypto";
import { RequestContextLogger } from "../common/request-context/request-context";
import { PrismaService } from "../prisma/prisma.service";

/**
 * SEC-1.2/15.3 — Recovery codes de uso único para o segundo fator.
 *
 * Apenas o hash SHA-256 de cada código é persistido (nunca o valor em texto
 * puro). O valor é gerado e retornado uma única vez na ativação do TOTP; no
 * login, o cliente envia o código em texto puro e o consumo é atômico e de
 * uso único (updateMany com condição de não-uso).
 */
@Injectable()
export class RecoveryCodeService {
  private readonly logger = new RequestContextLogger(RecoveryCodeService.name);

  constructor(private prisma: PrismaService) {}

  private static hash(code: string): string {
    return crypto.createHash("sha256").update(code).digest("hex");
  }

  private static generateCode(): string {
    // 10 caracteres hexadecimais (40 bits) por código.
    return crypto.randomBytes(5).toString("hex");
  }

  /**
   * Gera `count` novos códigos para o usuário, revogando os anteriores
   * (ex.: regeneração). Retorna os valores em texto puro — exibidos UMA única
   * vez ao usuário.
   */
  async regenerate(userId: string, count = 10): Promise<string[]> {
    await this.prisma.recoveryCode.deleteMany({ where: { userId } });

    const codes: string[] = [];
    const data: { codeHash: string; userId: string }[] = [];

    while (data.length < count) {
      const code = RecoveryCodeService.generateCode();
      if (data.some((d) => d.codeHash === RecoveryCodeService.hash(code)))
        continue;
      data.push({ codeHash: RecoveryCodeService.hash(code), userId });
      codes.push(code);
    }

    await this.prisma.recoveryCode.createMany({ data });

    this.logger.log(`Generated ${count} recovery codes for user ${userId}`);
    return codes;
  }

  /**
   * Consome um código de recuperação de uso único. Retorna `true` apenas se o
   * hash existe, pertence ao usuário e ainda não foi usado. O consumo é
   * atômico: o UPDATE condicionado a `usedAt: null` evita reuso concorrente.
   */
  async consume(userId: string, code: string): Promise<boolean> {
    const codeHash = RecoveryCodeService.hash(code);

    const { count } = await this.prisma.recoveryCode.updateMany({
      where: { userId, codeHash, usedAt: null },
      data: { usedAt: new Date() },
    });

    if (count === 0) return false;

    this.logger.log(`Recovery code consumed for user ${userId}`);
    return true;
  }

  /** Revoga todos os códigos do usuário (ex.: ao desabilitar o TOTP). */
  async clearForUser(userId: string): Promise<void> {
    await this.prisma.recoveryCode.deleteMany({ where: { userId } });
  }
}
