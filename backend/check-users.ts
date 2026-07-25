import { PrismaClient } from './prisma/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import * as path from 'path';

const DEFAULT_DB_PATH = path.join(__dirname, 'data', 'controle-videos.db');
const dbPath = process.env.DATABASE_FILE
  ? path.resolve(process.env.DATABASE_FILE)
  : DEFAULT_DB_PATH;
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, isAdmin: true, role: true, passwordMustChange: true },
  });
  console.table(users);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
