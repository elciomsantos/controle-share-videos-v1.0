import { pathToFileURL } from "url";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..", "..");
const BACKEND_DIR = path.join(ROOT, "backend");

const BACKEND_PORT = 8181;
const FRONTEND_PORT = 4199;

const E2E_DATA_DIR = path.join(BACKEND_DIR, "data", "e2e-pw");
const E2E_DB_PATH = path.join(E2E_DATA_DIR, "pw.db");
const DATABASE_URL = `file:${E2E_DB_PATH}`;

process.env.DATABASE_URL = DATABASE_URL;
process.env.DATA_DIRECTORY = E2E_DATA_DIR;
process.env.SHARE_DIRECTORY = path.join(E2E_DATA_DIR, "shares");
process.env.CONFIG_FILE = path.join(E2E_DATA_DIR, "no-config.yaml");
process.env.NODE_ENV = "test";
process.env.BACKEND_PORT = String(BACKEND_PORT);
process.env.PORT = String(BACKEND_PORT);
process.env.SWAGGER_ENABLED = "false";
process.env.CORS_ORIGIN = "";
process.env.JWT_SECRET = "e2e-test-secret-0123456789abcdef0123456789abcd";
process.env.ADMIN_EMAIL = "admin@e2e.local";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "E2e-Teste-2026!";

export {};