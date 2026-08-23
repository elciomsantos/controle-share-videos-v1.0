import { createHash } from "crypto";

/**
 * Hash determinístico (SHA-256 hex) para tokens "apresentáveis" armazenados no
 * banco — tokens de ativação de conta e de reset de senha (VULN-20). O valor
 * bruto é entregue somente ao destinatário por e-mail; o banco guarda apenas
 * o hash, de modo que um vazamento da base não permita usar os tokens.
 */
export function hashShareableToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
