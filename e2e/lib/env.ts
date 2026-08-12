import * as fs from "fs";
import * as path from "path";

export const ROOT = path.resolve(__dirname, "..", "..");
export const BACKEND_DIR = path.join(ROOT, "backend");
export const FRONTEND_DIR = path.join(ROOT, "frontend");

export function ensureE2EDirs(): void {
  fs.mkdirSync(E2E_DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(E2E_DATA_DIR, "shares"), { recursive: true });
}

export const BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT || 8181);
export const FRONTEND_PORT = Number(process.env.E2E_FRONTEND_PORT || 3999);

export const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${FRONTEND_PORT}`;
export const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

export const E2E_DATA_DIR = path.join(BACKEND_DIR, "data", "e2e-pw");
export const E2E_DB_PATH = path.join(E2E_DATA_DIR, "pw.db");
export const DATABASE_URL = `file:${E2E_DB_PATH}`;

export const E2E_ADMIN = {
  email: "admin@e2e.local",
  username: "admin",
  password: "E2e-Teste-2026!",
};

export const JWT_SECRET =
  process.env.E2E_JWT_SECRET || "e2e-test-secret-0123456789abcdef0123456789abcd";

export const BACKEND_ENV = {
  ...process.env,
  DATABASE_URL,
  DATA_DIRECTORY: E2E_DATA_DIR,
  SHARE_DIRECTORY: path.join(E2E_DATA_DIR, "shares"),
  CONFIG_FILE: path.join(E2E_DATA_DIR, "no-config.yaml"),
  NODE_ENV: "test",
  BACKEND_PORT: String(BACKEND_PORT),
  PORT: String(BACKEND_PORT),
  SWAGGER_ENABLED: "false",
  CORS_ORIGIN: "",
  JWT_SECRET,
  ADMIN_EMAIL: E2E_ADMIN.email,
  ADMIN_USERNAME: E2E_ADMIN.username,
  ADMIN_PASSWORD: E2E_ADMIN.password,
} as Record<string, string>;