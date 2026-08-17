export const REFRESH_COOKIE_NAME = "refresh_token";
export const SESSION_COOKIE_NAME = "__Host-SID";
export const LEGACY_SESSION_COOKIE_NAME = "access_token";

export function getSessionCookieName(secure: boolean): string {
  return secure ? SESSION_COOKIE_NAME : LEGACY_SESSION_COOKIE_NAME;
}