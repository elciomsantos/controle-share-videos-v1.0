import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import * as argon2 from "argon2";

// Same options as src/constants.ts ARGON2_OPTIONS
const ARGON2_OPTIONS = {
  type: 2, // argon2id
  memoryCost: 131072,
  timeCost: 4,
  parallelism: 2,
} as const;

async function seedAdminUser() {
  const email = process.env.ADMIN_EMAIL;
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

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
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      console.log(
        `Skipping admin user seed: ${userCount} user(s) already exist.`,
      );
      return;
    }

    const hash = await argon2.hash(password, ARGON2_OPTIONS);
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
  } finally {
    await prisma.$disconnect();
  }
}

seedAdminUser().catch(async (e) => {
  console.error("Failed to seed admin user:", e);
  process.exit(1);
});
