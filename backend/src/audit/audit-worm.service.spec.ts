import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Prisma } from "../../prisma/generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MetricsService } from "../metrics/metrics.service";
import { AuditWormService } from "./audit-worm.service";

const GENESIS = "0".repeat(64);

/**
 * Reconstrói o hash exatamente como o serviço faz (serialização canônica
 * com chaves ordenadas) — usado para validar a chain de forma independente.
 */
function expectedHash(previousHash: string, payload: Record<string, unknown>) {
  const canonical = JSON.stringify(
    payload,
    Object.keys(payload).sort() as Array<keyof typeof payload>,
  );
  return createHash("sha256").update(previousHash + canonical).digest("hex");
}

describe("AuditWormService", () => {
  type Row = {
    id?: string;
    sequenceNumber: number | null;
    previousHash: string | null;
    currentHash: string | null;
    eventType: string;
    userId: string | null;
    sessionId: string | null;
    resource: string | null;
    result: string | null;
    metadata: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    requestId: string | null;
    createdAt: Date;
  };

  let prisma: {
    auditLog: {
      findFirst: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };
  let metrics: { setAuditChainBroken: jest.Mock };
  let rows: Row[];
  let mirrorDir: string;

  const payloadOf = (row: Row): Record<string, unknown> => ({
    sequenceNumber: row.sequenceNumber,
    eventType: row.eventType,
    userId: row.userId,
    sessionId: row.sessionId,
    resource: row.resource,
    result: row.result,
    metadata: row.metadata,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    requestId: row.requestId,
    createdAt: row.createdAt.toISOString(),
  });

  beforeEach(() => {
    rows = [];
    prisma = {
      auditLog: {
        findFirst: jest.fn().mockImplementation(() => {
          const chained = rows.filter((r) => r.sequenceNumber !== null);
          return Promise.resolve(
            chained.length ? chained[chained.length - 1] : null,
          );
        }),
        create: jest.fn().mockImplementation(({ data }: { data: Row }) => {
          const row = { ...data };
          rows.push(row);
          return Promise.resolve(row);
        }),
        findMany: jest
          .fn()
          .mockImplementation(
            ({ take, skip, cursor }: { take: number; skip?: number; cursor?: { sequenceNumber: number } }) => {
              const chained = rows.filter((r) => r.sequenceNumber !== null);
              let start = 0;
              if (cursor) {
                start =
                  chained.findIndex(
                    (r) => r.sequenceNumber === cursor.sequenceNumber,
                  ) + 1;
                if (skip) start += skip - 1;
              }
              return Promise.resolve(chained.slice(start, start + take));
            },
          ),
        count: jest.fn().mockImplementation(({ where }: { where?: { sequenceNumber?: unknown } }) =>
          Promise.resolve(
            where?.sequenceNumber === null
              ? rows.filter((r) => r.sequenceNumber === null).length
              : rows.length,
          ),
        ),
      },
    };
    metrics = { setAuditChainBroken: jest.fn() };
    process.env.AUDIT_WORM_MIRROR = "off";
  });

  afterEach(() => {
    delete process.env.AUDIT_WORM_MIRROR;
    delete process.env.AUDIT_WORM_MIRROR_DIR;
    if (mirrorDir && fs.existsSync(mirrorDir)) {
      fs.rmSync(mirrorDir, { recursive: true, force: true });
    }
    mirrorDir = "";
  });

  const createService = () =>
    new AuditWormService(
      prisma as unknown as PrismaService,
      metrics as unknown as MetricsService,
    );

  describe("record (hash chain 2.3.2)", () => {
    it("primeiro evento parte do genesis e grava seq=1", async () => {
      const svc = createService();
      await svc.record("LOGIN_SUCCESS", { userId: "u1" });

      expect(rows[0].sequenceNumber).toBe(1);
      expect(rows[0].previousHash).toBe(GENESIS);
      expect(rows[0].currentHash).toBe(expectedHash(GENESIS, payloadOf(rows[0])));
    });

    it("encadeia eventos: previousHash aponta para o hash anterior", async () => {
      const svc = createService();
      await svc.record("LOGIN_SUCCESS", { userId: "u1" });
      await svc.record("ROLE_CHANGED", { userId: "u1" });
      await svc.record("SHARE_CREATED", { userId: "u2" });

      expect(rows.map((r) => r.sequenceNumber)).toEqual([1, 2, 3]);
      expect(rows[1].previousHash).toBe(rows[0].currentHash);
      expect(rows[2].previousHash).toBe(rows[1].currentHash);
      expect(rows[2].currentHash).toBe(
        expectedHash(rows[2].previousHash ?? "", payloadOf(rows[2])),
      );
    });

    it("nunca lança quando a escrita falha (BKD-04)", async () => {
      prisma.auditLog.create.mockRejectedValue(new Error("db down"));
      const svc = createService();

      await expect(svc.record("MFA_FAILED")).resolves.toBeUndefined();
      expect(metrics.setAuditChainBroken).not.toHaveBeenCalled();
    });

    it("re-tenta após conflito de sequência (P2002) relendo o head", async () => {
      prisma.auditLog.create
        .mockRejectedValueOnce(
          new Prisma.PrismaClientKnownRequestError("unique", {
            code: "P2002",
            clientVersion: "test",
          }),
        )
        .mockImplementation(({ data }: { data: Row }) => {
          rows.push({ ...data });
          return Promise.resolve(rows[rows.length - 1]);
        });

      // Simula outro writer vencedor da corrida entre a leitura do head e o insert.
      const originalFindFirst = prisma.auditLog.findFirst;
      prisma.auditLog.findFirst = jest
        .fn()
        .mockImplementationOnce(originalFindFirst)
        .mockImplementation(() =>
          Promise.resolve({
            sequenceNumber: 7,
            currentHash: "b".repeat(64),
          }),
        );

      const svc = createService();
      await svc.record("LOGIN_SUCCESS");

      expect(rows).toHaveLength(1);
      expect(rows[0].sequenceNumber).toBe(8);
      expect(rows[0].previousHash).toBe("b".repeat(64));
    });
  });

  describe("espelho append-only (2.3.1)", () => {
    it("anexa cada evento em NDJSON diário", async () => {
      mirrorDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-worm-"));
      process.env.AUDIT_WORM_MIRROR_DIR = mirrorDir;
      process.env.AUDIT_WORM_MIRROR = "on";

      const svc = createService();
      await svc.record("LOGIN_SUCCESS", { userId: "u1" });
      await svc.record("LOGOUT", { userId: "u1" });

      const files = fs.readdirSync(mirrorDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^audit-\d{4}-\d{2}-\d{2}\.ndjson$/);

      const lines = fs
        .readFileSync(path.join(mirrorDir, files[0]), "utf-8")
        .trim()
        .split("\n");
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toMatchObject({
        eventType: "LOGIN_SUCCESS",
        sequenceNumber: 1,
        currentHash: rows[0].currentHash,
      });
    });

    it("falha de espelho não derruba o registro", async () => {
      process.env.AUDIT_WORM_MIRROR_DIR = "/proc/nao-existe/audit-worm";
      process.env.AUDIT_WORM_MIRROR = "on";

      const svc = createService();
      await expect(svc.record("LOGIN_SUCCESS")).resolves.toBeUndefined();
      expect(rows).toHaveLength(1);
    });
  });

  describe("verifyIntegrity (2.3.3)", () => {
    it("valida chain íntegra e exporta gauge 0", async () => {
      const svc = createService();
      await svc.record("LOGIN_SUCCESS", { userId: "u1" });
      await svc.record("SHARE_ACCESS", { userId: "u1" });

      const result = await svc.verifyIntegrity();

      expect(result.valid).toBe(true);
      expect(result.brokenAt).toBeUndefined();
      expect(result.checked).toBeGreaterThanOrEqual(2);
      expect(metrics.setAuditChainBroken).toHaveBeenLastCalledWith(false);
    });

    it("detecta adulteração e aponta a sequência quebrada (fail-closed)", async () => {
      const svc = createService();
      await svc.record("LOGIN_SUCCESS", { userId: "u1" });
      await svc.record("ROLE_CHANGED", { userId: "u1" });
      await svc.record("PASSWORD_CHANGED", { userId: "u1" });

      // Atacante altera evidência no banco (linha 2).
      rows[1].eventType = "LOGIN_SUCCESS";

      const result = await svc.verifyIntegrity();

      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(2);
      expect(metrics.setAuditChainBroken).toHaveBeenLastCalledWith(true);
    });

    it("detecta linha removida do meio da chain (furo de sequência)", async () => {
      const svc = createService();
      await svc.record("LOGIN_SUCCESS");
      await svc.record("LOGOUT");
      await svc.record("SHARE_CREATED");

      rows.splice(1, 1); // remove seq=2

      const result = await svc.verifyIntegrity();

      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(3);
    });

    it("ignora linhas legadas sem chain e as reporta separadamente", async () => {
      rows.push({
        sequenceNumber: null,
        previousHash: null,
        currentHash: null,
        eventType: "LEGACY_EVENT",
        userId: null,
        sessionId: null,
        resource: null,
        result: null,
        metadata: null,
        ipAddress: null,
        userAgent: null,
        requestId: null,
        createdAt: new Date(),
      } as Row);

      const svc = createService();
      await svc.record("LOGIN_SUCCESS");

      const result = await svc.verifyIntegrity();

      expect(result.valid).toBe(true);
      expect(result.legacyUnchained).toBe(1);
    });

    it("fail-closed quando a verificação não consegue rodar", async () => {
      prisma.auditLog.findMany.mockRejectedValue(new Error("io error"));
      const svc = createService();

      const result = await svc.verifyIntegrity();

      expect(result.valid).toBe(false);
      expect(metrics.setAuditChainBroken).toHaveBeenLastCalledWith(true);
    });

    it("grava o próprio resultado como evento encadeado", async () => {
      const svc = createService();
      await svc.record("LOGIN_SUCCESS");
      const totalBefore = rows.length;

      await svc.verifyIntegrity();

      expect(rows).toHaveLength(totalBefore + 1);
      expect(rows[rows.length - 1].eventType).toBe("AUDIT_INTEGRITY_CHECK");
    });
  });

  describe("getChainHead", () => {
    it("retorna head da chain ou null quando vazia", async () => {
      const empty = createService();
      await expect(empty.getChainHead()).resolves.toBeNull();

      await empty.record("LOGIN_SUCCESS");
      const head = await empty.getChainHead();
      expect(head?.sequenceNumber).toBe(1);
      expect(head?.currentHash).toBe(rows[0].currentHash);
    });
  });
});
