import { Request } from "express";

export function getRequestIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function getRequestUserAgent(req: Request): string | null {
  const ua = req.headers["user-agent"];
  if (Array.isArray(ua)) return ua[0] ?? null;
  return ua ?? null;
}
