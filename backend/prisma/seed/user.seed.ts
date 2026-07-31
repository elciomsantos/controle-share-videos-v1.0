import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import * as fs from "fs";
import * as argon2 from "argon2";

// Same options as src/constants.ts ARGON2_OPTIONS
const ARGON2_OPTIONS = {
  type: 2, // argon2id
  memoryCost: 131072,
  timeCost: 4,
  parallelism: 2,
} as const;

// Reads a Docker secret from the `<NAME>_FILE` env var (Docker secrets mount as
// files under /run/secrets), falling back to the plain `<NAME>` env var.
function readSecretEnv(name: string): string | undefined {
  const filePath = process.env[`${name}_FILE`];
  if (filePath) {
    try {
      const value = fs.readFileSync(filePath, "utf8").trim();
      if (value) return value;
    } catch (e) {
      console.warn(`Failed to read ${name}_FILE at ${filePath}:`, e);
    }
  }
  return process.env[name];
}

async function seedAdminUser() {
  const email = readSecretEnv("ADMIN_EMAIL");
  const username = readSecretEnv("ADMIN_USERNAME");
  const password = readSecretEnv("ADMIN_PASSWORD");

  if (!email || !username || !password) {
    console.log(
      "Skipping admin user seed: ADMIN_EMAIL, ADMIN_USERNAME, or ADMIN_PASSWORD not set.",
    );
    return;
  }

  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL || "file:./data/controle-videos.db",
  });
  const prisma = new PrismaClient({ adapter });

  try {
    const hash = await argon2.hash(password, ARGON2_OPTIONS);

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email: email.toLowerCase().trim() }, { username: username.trim() }] },
    });

    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          email: email.toLowerCase().trim(),
          username: username.trim(),
          password: hash,
          isAdmin: true,
          role: "admin",
          isActivated: true,
        },
      });
      console.log(`Admin user updated: ${email}`);
    } else {
      await prisma.user.create({
        data: {
          email: email.toLowerCase().trim(),
          username: username.trim(),
          password: hash,
          isAdmin: true,
          role: "admin",
          isActivated: true,
        },
      });
      console.log(`Admin user created: ${email}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

seedAdminUser().catch(async (e) => {
  console.error("Failed to seed admin user:", e);
  process.exit(1);
});
