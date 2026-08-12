import {
  setupDatabase,
  seedAdmin,
  startBackend,
  startFrontend,
} from "./lib/harness";

// Sobe a stack E2E (backend :8181 + frontend :3999) e a mantém viva para teste
// visual no navegador. Uso: `tsx e2e/bootstrap.ts` (ou via script npm).
async function main() {
  setupDatabase();
  seedAdmin();

  const backend = startBackend();
  console.log("[e2e:bootstrap] backend iniciado — ctrl+c para interromper");

  const frontend = startFrontend();
  console.log("[e2e:bootstrap] frontend iniciado em http://localhost:3999");
  console.log("[e2e:bootstrap] admin:", "admin@e2e.local");

  const shutdown = () => {
    try {
      if (backend.pid !== undefined) process.kill(-backend.pid, "SIGKILL");
    } catch {}
    try {
      if (frontend.pid !== undefined) process.kill(-frontend.pid, "SIGKILL");
    } catch {}
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Mantém o processo vivo enquanto os filhos rodam.
  setInterval(() => {}, 1000);
}

main().catch((e) => {
  console.error("[e2e:bootstrap] erro:", e);
  process.exit(1);
});
