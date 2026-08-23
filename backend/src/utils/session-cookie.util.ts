import type { Response } from "express";

export const REFRESH_COOKIE_NAME = "refresh_token";
export const SESSION_COOKIE_NAME = "__Host-SID";
export const LEGACY_SESSION_COOKIE_NAME = "access_token";

// VULN-13: com secureCookies ativo o refresh usa o prefixo __Host-, que o
// browser valida rigidamente (Secure obrigatório, Path=/ e nenhum atributo
// Domain) — impede cookie-tossing de subdomínios. O nome/path legados só
// sobrevivem para leitura em migração e limpeza de cookies antigos.
export const LEGACY_REFRESH_COOKIE_NAME = REFRESH_COOKIE_NAME;
export const LEGACY_REFRESH_COOKIE_PATH = "/api/auth/token";
export const SECURE_REFRESH_COOKIE_NAME = "__Host-refresh_token";

export function getSessionCookieName(secure: boolean): string {
  return secure ? SESSION_COOKIE_NAME : LEGACY_SESSION_COOKIE_NAME;
}

export function getRefreshCookieName(secure: boolean): string {
  return secure ? SECURE_REFRESH_COOKIE_NAME : LEGACY_REFRESH_COOKIE_NAME;
}

/**
 * Expira os cookies de sessão com os MESMOS paths usados na emissão
 * (token.service.addTokensToResponse). Expira também o formato legado do
 * refresh para migrar sessões abertas antes da correção VULN-13.
 */
export function expireAuthCookies(response: Response, isSecure: boolean): void {
  response.setHeader("Cache-Control", "no-store");
  response.cookie(getSessionCookieName(isSecure), "", {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    maxAge: -1,
    secure: isSecure,
  });
  if (isSecure) {
    // Cookies __Host- só são aceitos/reescritos com Secure.
    response.cookie(SECURE_REFRESH_COOKIE_NAME, "", {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      maxAge: -1,
      secure: true,
    });
  }
  response.cookie(LEGACY_REFRESH_COOKIE_NAME, "", {
    path: LEGACY_REFRESH_COOKIE_PATH,
    httpOnly: true,
    sameSite: "strict",
    maxAge: -1,
    secure: isSecure,
  });
}
