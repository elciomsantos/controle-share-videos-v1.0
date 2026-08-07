// globalTeardown: remove the ephemeral e2e database so subsequent runs start clean.
import * as fs from "fs";
import * as path from "path";

const testDataDir = path.resolve(process.cwd(), "data/e2e-test");

export default async function globalTeardown() {
  fs.rmSync(testDataDir, { recursive: true, force: true });
}
