export type SessionState = "active" | "idle" | "expired" | "revoked";

export interface AdminSession {
  id: string;
  userId: string;
  username?: string | null;
  email?: string | null;
  role?: string | null;
  isAdmin: boolean;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  state: SessionState;
}

export interface AdminSessionPage {
  data: AdminSession[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminSessionQuery {
  userId?: string;
  page?: number;
  limit?: number;
}