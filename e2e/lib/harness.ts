import { spawn, execFileSync, ChildProcess } from "child_process";
import * as http from "http";
import * as path from "path";
import {
  BACKEND_DIR,
  FRONTEND_DIR,
  BACKEND_PORT,
  FRONTEND_PORT,
  BACKEND_URL,
  BACKEND_ENV,
  JWT_SECRET,
  E2E_DATA_DIR,
  ensureE2EDirs,
} from "./env";

function exec(cmd: string, args: string[], cwd: string) {
  execFileSync(cmd, args, {
    cwd,
    env: BACKEND_ENV,
    stdio: "inherit",
  });
}

export function setupDatabase() {
  ensureE2EDirs();
  console.log(
    "[e2e:harness] aplicando migrações no banco efêmero",
    E2E_DATA_DIR,
  );
  exec("npx", ["prisma", "migrate", "deploy"], BACKEND_DIR);
  console.log("[e2e:harness] migrações aplicadas");
  // `prisma db seed` popula as variáveis de configuração (config.seed.ts).
  exec("npx", ["prisma", "db", "seed"], BACKEND_DIR);
  console.log("[e2e:harness] configuração semeada");
}

export function seedAdmin() {
  const tsxBin = path.join(BACKEND_DIR, "node_modules", ".bin", "tsx");
  // Reaproveita o seed oficial de admin (argon2 options corretos + resolução de
  // node_modules do backend) — lê ADMIN_EMAIL/USERNAME/PASSWORD do env.
  console.log("[e2e:harness] criando usuário admin de teste");
  exec(tsxBin, ["prisma/seed/user.seed.ts"], BACKEND_DIR);
  console.log("[e2e:harness] aplicando overrides de config E2E");
  exec(tsxBin, ["prisma/seed/e2e-overrides.ts"], BACKEND_DIR);
}

function waitForHttp(url: string, timeoutMs: number, label: string) {
  const started = Date.now();
  return new Promise<void>((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        // Aceita qualquer resposta HTTP (2xx/4xx/5xx) — servidor está de pé.
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`[e2e:harness] timeout aguardando ${label} em ${url}`));
        } else {
          setTimeout(attempt, 500);
        }
      });
      req.setTimeout(1500, () => {
        req.destroy();
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`[e2e:harness] timeout aguardando ${label} em ${url}`));
        } else {
          setTimeout(attempt, 500);
        }
      });
    };
    attempt();
  });
}

export function startBackend(): ChildProcess {
  console.log(`[e2e:harness] subindo backend em :${BACKEND_PORT}`);
  const proc = spawn("node", ["dist/src/main"], {
    cwd: BACKEND_DIR,
    env: BACKEND_ENV,
    stdio: "pipe",
    detached: true,
  });
  proc.stdout?.on("data", (d) => process.stdout.write(`[backend] ${d}`));
  proc.stderr?.on("data", (d) => process.stderr.write(`[backend:err] ${d}`));
  return proc;
}

function assertFrontendPointsToE2EBackend() {
  // As rewrites do Next são gravadas em build-time (next.config). Se o frontend
  // foi buildado com outro API_URL, o `next start` do E2E encaminha /api/* para
  // a porta errada (ECONNREFUSED silencioso). Detecta e aponta o erro antes.
  const manifestPath = path.join(
    FRONTEND_DIR,
    ".next",
    "routes-manifest.json",
  );
  let targetOk = false;
  try {
    const manifest = JSON.parse(
      require("fs").readFileSync(manifestPath, "utf8"),
    );
    const rewriter = (manifest.rewrites?.afterFiles ?? []).find(
      (r: { source?: string }) => r.source === "/api/:path*",
    );
    targetOk = !!rewriter && (rewriter.destination as string).includes(
      `:${BACKEND_PORT}`,
    );
  } catch {
    // manifest ausente = frontend nunca buildado
  }
  if (!targetOk) {
    throw new Error(
      `[e2e:harness] frontend buildado para outro backend. Rode antes: ` +
        `e2e:build-frontend (bakeia API_URL=http://localhost:${BACKEND_PORT} nas rewrites). ` +
        `Manifest: ${manifestPath}`,
    );
  }
}

export function startFrontend(): ChildProcess {
  // Rodamos o servidor Next a partir do diretório do projeto (frontend/), onde
  // `next start` serve `/._next/static` e `/public` da própria árvore de build,
  // evitando os problemas de trim do standalone (que não serve os chunks estáticos
  // e impede a hidratação do React). As rewrites de `/api/*` para o backend de
  // teste ficam embutidas no build (feito com API_URL=<backend>).
  console.log(
    `[e2e:harness] subindo frontend (next start) em :${FRONTEND_PORT}`,
  );
  assertFrontendPointsToE2EBackend();
  const nextCli = path.join(FRONTEND_DIR, "node_modules", ".bin", "next");
  const proc = spawn(nextCli, ["start", "-p", String(FRONTEND_PORT)], {
    cwd: FRONTEND_DIR,
    env: {
      ...process.env,
      HOSTNAME: "0.0.0.0",
      API_URL: BACKEND_URL,
      JWT_SECRET,
      PORT: String(FRONTEND_PORT),
    },
    stdio: "pipe",
    detached: true,
  });
  proc.stdout?.on("data", (d) => process.stdout.write(`[frontend] ${d}`));
  proc.stderr?.on("data", (d) => process.stderr.write(`[frontend:err] ${d}`));
  return proc;
}

function freeE2EPorts() {
  // Mata qualquer processo remanescente preso nas portas do E2E (backend/frontend
  // de execuções anteriores que sobreviveram ao teardown). `fuser -k` mata pelo
  // número da porta, então não afeta a stack de dev (3000/3333).
  for (const port of [BACKEND_PORT, FRONTEND_PORT]) {
    try {
      execFileSync("fuser", ["-k", "-9", `${port}/tcp`], {
        stdio: "ignore",
      });
    } catch {
      // nenhum processo na porta, ou fuser indisponível — tudo bem
    }
  }
}

export interface StackProcesses {
  backend: ChildProcess;
  frontend: ChildProcess;
}

export async function startStack(): Promise<StackProcesses> {
  // Garante estado limpo antes de bootar: evita EADDRINUSE se um processo de uma
  // execução anterior (que sobreviveu ao teardown) ainda segura a porta.
  freeE2EPorts();
  await new Promise((r) => setTimeout(r, 500));

  setupDatabase();
  seedAdmin();

  const backend = startBackend();
  await waitForHttp(`${BACKEND_URL}/api/system/info`, 60_000, "backend");

  const frontend = startFrontend();
  await waitForHttp(`http://localhost:${FRONTEND_PORT}/`, 60_000, "frontend");

  return { backend, frontend };
}

export function stopStack(processes: StackProcesses) {
  for (const proc of [processes.frontend, processes.backend]) {
    if (!proc || proc.pid === undefined) continue;
    try {
      // Mata o processo e todo o grupo (children como o `next-server` interno),
      // evitando órfãos que travam as portas na próxima execução.
      process.kill(-proc.pid, "SIGKILL");
    } catch {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* noop */
      }
    }
  }
}
