import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "./node_modules/.bin/tsx prisma/seed/config.seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL || "file:./data/controle-videos.db",
  },
});
