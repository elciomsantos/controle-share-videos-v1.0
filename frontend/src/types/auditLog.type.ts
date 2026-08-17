export const AUDIT_EVENTS = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILURE",
  "LOGOUT",
  "SESSION_CREATED",
  "SESSION_REVOKED",
  "PASSWORD_CHANGED",
  "PASSWORD_RESET_REQUESTED",
  "PASSWORD_RESET_COMPLETED",
  "MFA_ENABLED",
  "MFA_DISABLED",
  "MFA_FAILED",
  "PERMISSION_CHANGED",
  "ROLE_CHANGED",
  "SHARE_CREATED",
  "SHARE_REVOKED",
  "REFRESH_TOKEN_REUSE_DETECTED",
  "ADMIN_SESSION_REVOKED",
] as const;

export type AuditEventType = (typeof AUDIT_EVENTS)[number];

export interface AuditLog {
  id: string;
  createdAt: string;
  eventType: string;
  userId?: string | null;
  sessionId?: string | null;
  resource?: string | null;
  result?: string | null;
  metadata?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  user?: { id: string; email: string; username: string } | null;
}

export interface AuditLogPage {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuditLogQuery {
  eventType?: string;
  userId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}