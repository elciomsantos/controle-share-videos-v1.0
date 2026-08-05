// Isolated environment for unit tests: point every mutable path at a throwaway
// location so a unit test can never touch the real dev database or uploads.
import * as path from "path";

const testDataDir = path.resolve(process.cwd(), "data/e2e-test");

process.env.DATABASE_URL = `file:${path.join(testDataDir, "test-e2e.db")}`;
process.env.DATA_DIRECTORY = testDataDir;
process.env.CONFIG_FILE = path.join(testDataDir, "no-config.yaml");
process.env.NODE_ENV = "test";
