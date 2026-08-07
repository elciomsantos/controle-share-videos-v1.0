// E2E environment. Runs before the test files load (setupFiles), so DATABASE_URL
// is set before PrismaService and constants.ts are imported. Uses an ephemeral
// SQLite database under data/e2e-test/ — never touches the real dev DB.
import * as path from "path";

const testDataDir = path.resolve(process.cwd(), "data/e2e-test");

process.env.DATABASE_URL = `file:${path.join(testDataDir, "test-e2e.db")}`;
process.env.DATA_DIRECTORY = testDataDir;
process.env.SHARE_DIRECTORY = path.join(testDataDir, "uploads", "shares");
process.env.CONFIG_FILE = path.join(testDataDir, "no-config.yaml");
process.env.SWAGGER_ENABLED = "false";
process.env.NODE_ENV = "test";
process.env.CORS_ORIGIN = "";
