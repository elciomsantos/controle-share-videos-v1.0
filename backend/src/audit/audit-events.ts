/**
 * Eventos mínimos de auditoria (§29.4). Nomes preservados para estabilidade do
 * dashboard; adicione novos eventos aqui e use nas chamadas de `record`.
 *
 * Arquivo próprio (sem dependências) para evitar import circular entre
 * AuditService e AuditWormService.
 */
export const AuditEvent = {
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILURE: "LOGIN_FAILURE",
  LOGOUT: "LOGOUT",
  SESSION_CREATED: "SESSION_CREATED",
  SESSION_REVOKED: "SESSION_REVOKED",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  PASSWORD_RESET_REQUESTED: "PASSWORD_RESET_REQUESTED",
  PASSWORD_RESET_COMPLETED: "PASSWORD_RESET_COMPLETED",
  MFA_ENABLED: "MFA_ENABLED",
  MFA_DISABLED: "MFA_DISABLED",
  MFA_FAILED: "MFA_FAILED",
  PERMISSION_CHANGED: "PERMISSION_CHANGED",
  ROLE_CHANGED: "ROLE_CHANGED",
  SHARE_CREATED: "SHARE_CREATED",
  SHARE_REVOKED: "SHARE_REVOKED",
  SHARE_ACCESS: "SHARE_ACCESS",
  SHARE_DOWNLOAD: "SHARE_DOWNLOAD",
  REFRESH_TOKEN_REUSE_DETECTED: "REFRESH_TOKEN_REUSE_DETECTED",
  ADMIN_SESSION_REVOKED: "ADMIN_SESSION_REVOKED",

  // WORM (issue #10, 2.3.3): evidência da verificação diária da chain.
  AUDIT_INTEGRITY_CHECK: "AUDIT_INTEGRITY_CHECK",
} as const;

export type AuditEventType = (typeof AuditEvent)[keyof typeof AuditEvent];

export interface AuditRecordInput {
  userId?: string | null;
  sessionId?: string | null;
  resource?: string | null;
  result?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}
