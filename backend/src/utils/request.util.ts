import { Request } from "express";

export function getRequestIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

const USER_AGENT_MAX_LENGTH = 512;

export function getRequestUserAgent(req: Request): string | null {
  const ua = req.headers["user-agent"];
  const value = Array.isArray(ua) ? (ua[0] ?? null) : (ua ?? null);
  if (!value) return null;
  return value.length > USER_AGENT_MAX_LENGTH
    ? value.slice(0, USER_AGENT_MAX_LENGTH)
    : value;
}
