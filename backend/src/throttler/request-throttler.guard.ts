import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { Request } from "express";
import { getRequestIp } from "../utils/request.util";

/**
 * SEC-1.2/22 — Guard de rate limiting ciente do recurso.
 *
 * - Login (§22.1): a chave combina o identificador de conta (email ou
 *   username) com o IP, de forma que limites de login são aplicados por
 *   conta + IP, não somente por IP.
 * - Share público (§22.3/§23.5): a chave combina IP + id do share, escopando
 *   o limite ao recurso (e ao token de compartilhamento quando presente),
 *   evitando abuso concentrado em um único share.
 * - Demais endpoints: comportamento padrão por IP.
 */
@Injectable()
export class RequestThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(
    req: Record<string, unknown>,
  ): Promise<string> {
    const ip = getRequestIp(req as unknown as Request);

    const originalUrl =
      typeof req.originalUrl === "string" ? req.originalUrl : "";
    const url = typeof req.url === "string" ? req.url : "";
    // Remove o prefixo global de rotas ("/api") para avaliar o caminho real.
    const path = (originalUrl || url).replace(/^\/api(?=\/)/, "");

    const body = req.body as Record<string, unknown> | undefined;

    if (path.startsWith("/auth/signIn")) {
      const account = body?.email ?? body?.username;
      if (typeof account === "string" && account.length > 0)
        return `${account.toLowerCase()}:${ip}`;
      return ip;
    }

    const shareMatch = path.match(
      /^\/shares\/([^/]+)\/?(view|metaData|token)?$/,
    );
    if (shareMatch) {
      const cookies = req.cookies as Record<string, string> | undefined;
      const shareToken = cookies?.[`share_${shareMatch[1]}_token`];
      return `${ip}:share:${shareMatch[1]}${shareToken ? ":token" : ""}`;
    }

    return ip;
  }
}