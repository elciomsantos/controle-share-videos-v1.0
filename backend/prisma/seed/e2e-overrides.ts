import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Ajustes de configuração do ambiente E2E (auto-determinismo do harness).
// Executado com tsx a partir de backend/ (resolve node_modules do backend).
// Sem top-level await — o tsx do backend falha com top-level await.

async function main() {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL || "file:./data/controle-videos.db",
  });
  const prisma = new PrismaClient({ adapter });

  const overrides: Array<{ name: string; category: string; value: string }> = [
    // Fluxo determinístico: ao soltar arquivos, abre o modal de criação.
    { name: "autoOpenShareModal", category: "share", value: "true" },
    // Sem senha auto-gerada: a página pública /share/<id> fica acessível sem
    // passar pelo dialog de senha — o share.spec.ts valida listagem+download.
    { name: "autoGeneratePassword", category: "share", value: "false" },
  ];

  for (const o of overrides) {
    const existing = await prisma.config.findUnique({
      where: { name_category: { name: o.name, category: o.category } },
    });
    if (existing) {
      await prisma.config.update({
        where: { name_category: { name: o.name, category: o.category } },
        data: { value: o.value },
      });
      console.log(`[e2e:override] ${o.category}.${o.name} = ${o.value}`);
    } else {
      console.log(`[e2e:override] ${o.category}.${o.name} não encontrado (ignorado)`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Failed to apply e2e config overrides:", e);
  process.exit(1);
});
