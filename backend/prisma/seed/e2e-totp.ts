import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Habilita TOTP no admin de teste do harness E2E (Playwright), com um segredo
// fixo conhecido — o helper loginAsAdmin gera o código via otplib. Reexecução
// é idempotente (update). Sem top-level await (tsx do backend).
async function main() {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL || "file:./data/controle-videos.db",
  });
  const prisma = new PrismaClient({ adapter });

  const email = process.env.E2E_TOTP_ADMIN_EMAIL || "admin@e2e.local";
  const secret = process.env.E2E_TOTP_ADMIN_SECRET || "WYHQCW3YRDUNVYWXY37S6NEMQBPK6AWK";

  const user = await prisma.user.update({
    where: { email },
    data: { totpVerified: true, totpSecret: secret },
  });
  console.log(`[e2e:totp] admin ${user.email} com TOTP verificado`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Failed to enable TOTP for e2e admin:", e);
  process.exit(1);
});