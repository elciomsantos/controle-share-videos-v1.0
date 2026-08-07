// globalSetup: creates the ephemeral e2e database schema and seeds it.
// R07 explicitly forbids `prisma migrate reset -f` (destructive). Instead we use
// `migrate deploy` (non-destructive, applies only missing migrations) followed by
// `db seed` on the throwaway test-e2e.db database.
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const testDataDir = path.resolve(process.cwd(), "data/e2e-test");
const dbPath = path.join(testDataDir, "test-e2e.db");
const databaseUrl = `file:${dbPath}`;

export default async function globalSetup() {
  fs.mkdirSync(testDataDir, { recursive: true });
  fs.mkdirSync(path.join(testDataDir, "uploads"), { recursive: true });

  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    DATA_DIRECTORY: testDataDir,
    CONFIG_FILE: path.join(testDataDir, "no-config.yaml"),
    NODE_ENV: "test",
  };

  execSync("npx prisma migrate deploy", {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });

  execSync("npx prisma db seed", {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });
}
