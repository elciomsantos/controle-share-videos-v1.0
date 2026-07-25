import { PrismaClient } from './generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const dbPath = path.join(__dirname, '..', 'data', 'controle-videos.db');
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, isAdmin: true },
  });

  for (const user of users) {
    const role = user.isAdmin ? 'admin' : 'operador';
    await prisma.user.update({
      where: { id: user.id },
      data: { role, passwordMustChange: false },
    });
    console.log(`User ${user.id}: role=${role}, passwordMustChange=false`);
  }

  console.log('Backfill completed');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });