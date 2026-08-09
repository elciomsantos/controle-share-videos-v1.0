import { BadRequestException } from "@nestjs/common";
import * as fs from "fs";
import { ConfigService } from "./config.service";
import { JwtSecretService } from "./jwt-secret.service";
import { PrismaService } from "../prisma/prisma.service";

jest.mock("../prisma/prisma.service");
jest.mock("fs", () => {
  const actual = jest.requireActual<typeof import("fs")>("fs");
  return {
    ...actual,
    readFileSync: jest.fn(),
    existsSync: jest.fn(() => false),
  };
});

type ConfigRow = {
  category: string;
  name: string;
  value: string | null;
  defaultValue: string;
  type: string;
  locked: boolean;
  secret: boolean;
  order: number;
};

function row(overrides: Partial<ConfigRow> = {}): ConfigRow {
  return {
    category: "internal",
    name: "jwtSecret",
    value: "db-current-secret",
    defaultValue: "",
    type: "string",
    locked: true,
    secret: true,
    order: 1,
    ...overrides,
  };
}

describe("JwtSecretService", () => {
  type MockPrisma = {
    config: {
      findMany: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  const prisma: MockPrisma = {
    config: {
      findMany: jest.fn(),
      update: jest.fn((args: { data: Record<string, string> }) => Promise.resolve({ ...args })),
    },
    $transaction: jest.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  };

  function makeService(rows: ConfigRow[], yaml?: unknown) {
    const config = new ConfigService(rows as never, prisma as unknown as PrismaService);
    config.yamlConfig = yaml as never;
    return new JwtSecretService(config as unknown as ConfigService, prisma as unknown as PrismaService);
  }

  const historyRow = (value: string) =>
    row({ name: "jwtSecretHistory", value, defaultValue: "[]" });

  const sourceRow = () =>
    row({ name: "jwtSecretSource", value: "auto", defaultValue: "auto" });

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.JWT_SECRET;
    delete process.env.JWT_SECRET_ENCRYPTION_KEY;
    (fs.existsSync as jest.Mock).mockReset();
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.readFileSync as jest.Mock).mockReset();
  });

  describe("secret resolution", () => {
    it("returns the DB secret when no external manager is configured", () => {
      const service = makeService([row()]);
      expect(service.getCurrentSecret()).toBe("db-current-secret");
    });

    it("prefers the JWT_SECRET env var", () => {
      process.env.JWT_SECRET = "env-secret";
      const service = makeService([row()]);
      expect(service.getCurrentSecret()).toBe("env-secret");
    });

    it("prefers the Docker secret file over the DB", () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue("file-secret\n");
      const service = makeService([row()]);
      expect(service.getCurrentSecret()).toBe("file-secret");
    });

    it("reads the Docker secret file only once (cached)", () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue("file-secret\n");
      const service = makeService([row()]);
      expect(service.getCurrentSecret()).toBe("file-secret");
      expect(service.getCurrentSecret()).toBe("file-secret");
      expect(service.getCurrentSecret()).toBe("file-secret");
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });

    it("lists verification secrets: current + history, de-duplicated", () => {
      const service = makeService([
        row(),
        historyRow(JSON.stringify(["old-1", "old-2", "db-current-secret"])),
      ]);
      expect(service.getVerificationSecrets()).toEqual([
        "db-current-secret",
        "old-1",
        "old-2",
      ]);
    });

    it("handles an empty/invalid history gracefully", () => {
      const service = makeService([row(), historyRow("not-json")]);
      expect(service.getVerificationSecrets()).toEqual(["db-current-secret"]);
    });

    it("evicts history entries older than the retention window", () => {
      const history = [
        { s: "very-old", rot: Date.now() - 1000 * 60 * 60 * 24 * 400 },
        { s: "recent", rot: Date.now() - 1000 * 60 * 60 * 24 * 30 },
      ];
      const service = makeService([row(), historyRow(JSON.stringify(history))]);
      expect(service.getVerificationSecrets()).toEqual([
        "db-current-secret",
        "recent",
      ]);
    });

    it("normalizes legacy plain-string history entries", () => {
      const service = makeService([
        row(),
        historyRow(JSON.stringify(["legacy-1", "db-current-secret"])),
      ]);
      expect(service.getVerificationSecrets()).toEqual([
        "db-current-secret",
        "legacy-1",
      ]);
    });
  });

  describe("kid resolution", () => {
    it("derives a stable kid and resolves it back", () => {
      const service = makeService([row()]);
      const kid = service.getKid("db-current-secret");
      expect(kid).toHaveLength(16);
      expect(service.getSecretByKid(kid)).toBe("db-current-secret");
      expect(service.getSecretByKid("nope")).toBeUndefined();
    });

    it("resolves the signing secret from a raw token by header kid", () => {
      const service = makeService([
        row(),
        historyRow(JSON.stringify(["old-1"])),
      ]);
      const header = Buffer.from(
        JSON.stringify({ alg: "HS512", typ: "JWT", kid: service.getKid("old-1") }),
      ).toString("base64");
      expect(service.resolveSecretForToken(`${header}.payload.sig`)).toBe("old-1");
    });

    it("returns undefined for tokens without a known kid", () => {
      const service = makeService([row()]);
      const header = Buffer.from(JSON.stringify({ alg: "HS512" })).toString("base64");
      expect(service.resolveSecretForToken(`${header}.payload.sig`)).toBeUndefined();
    });
  });

  describe("rotate", () => {
    it("persists the current secret into history and generates a new one", async () => {
      const service = makeService([
        row(),
        historyRow(JSON.stringify(["old-1"])),
      ]);
      const result = await service.rotate();

      expect(result.rotated).toBe(true);
      expect(result.retainedSecrets).toBe(2);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      type UpdateArgs = {
        where?: { name_category?: { name: string } };
        data: { value: string };
      };
      const updateArgs: UpdateArgs[] = prisma.config.update.mock.calls.map(
        (c: unknown[]) => c[0] as UpdateArgs,
      );
      const updateCurrent = updateArgs.find(
        (c) => c.where?.name_category?.name === "jwtSecret",
      );
      const updateHistory = updateArgs.find(
        (c) => c.where?.name_category?.name === "jwtSecretHistory",
      );
      expect(updateCurrent?.data.value).not.toBe("db-current-secret");
      expect(updateCurrent?.data.value.length).toBeGreaterThanOrEqual(32);
      const persistedHistory = JSON.parse(
        updateHistory?.data.value ?? "[]",
      ) as Array<{ s: string }>;
      expect(persistedHistory.map((e) => e.s)).toEqual([
        "db-current-secret",
        "old-1",
      ]);
      expect(prisma.config.findMany).toHaveBeenCalled(); // reload()
    });

    it("caps the history at MAX_HISTORY (13)", async () => {
      const history = Array.from({ length: 20 }, (_, i) => `old-${i}`);
      const service = makeService([row(), historyRow(JSON.stringify(history))]);
      await service.rotate();
      type UpdateArgs = {
        where?: { name_category?: { name: string } };
        data: { value: string };
      };
      const historyUpdate = prisma.config.update.mock.calls
        .map((c: unknown[]) => c[0] as UpdateArgs)
        .find((c) => c.where?.name_category?.name === "jwtSecretHistory");
      const persisted = JSON.parse(historyUpdate?.data.value ?? "[]") as Array<{
        s: string;
      }>;
      expect(persisted).toHaveLength(13);
      expect(persisted[0].s).toBe("db-current-secret");
    });

    it("rejects rotation when the env var is set", async () => {
      process.env.JWT_SECRET = "env-secret";
      const service = makeService([row()]);
      await expect(service.rotate()).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("supports hybrid rotation when the Docker secret file is present", async () => {
      (fs.readFileSync as jest.Mock).mockReturnValue("file-secret\n");
      const service = makeService([
        row(),
        historyRow(JSON.stringify(["old-1"])),
        sourceRow(),
      ]);

      const result = await service.rotate();
      expect(result.rotated).toBe(true);

      type UpdateArgs = {
        where?: { name_category?: { name: string } };
        data: { value: string };
      };
      const updateArgs = prisma.config.update.mock.calls.map(
        (c: unknown[]) => c[0] as UpdateArgs,
      );
      const currentWrite = updateArgs.find(
        (c) => c.where?.name_category?.name === "jwtSecret",
      );
      const historyWrite = updateArgs.find(
        (c) => c.where?.name_category?.name === "jwtSecretHistory",
      );
      const sourceWrite = updateArgs.find(
        (c) => c.where?.name_category?.name === "jwtSecretSource",
      );

      // New secret replaces the file secret; the file secret lands in the
      // history and the DB becomes authoritative.
      expect(currentWrite?.data.value).not.toBe("file-secret");
      const persistedHistory = JSON.parse(
        historyWrite?.data.value ?? "[]",
      ) as Array<{ s: string }>;
      expect(persistedHistory.map((e) => e.s)).toEqual(
        expect.arrayContaining(["file-secret", "old-1"]),
      );
      expect(sourceWrite?.data.value).toBe("db");
    });

    it("rejects rotation when config.yaml is active", async () => {
      const service = makeService([row()], {});
      await expect(service.rotate()).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("invalidates the cache so subsequent calls use the rotated secret", async () => {
      const rows: ConfigRow[] = [row(), historyRow(JSON.stringify(["old-1"]))];
      const service = makeService(rows);

      (prisma.config.update as jest.Mock).mockImplementation(
        (args: {
          where: { name_category: { name: string } };
          data: { value: string };
        }) => {
          const target = rows.find((r) => r.name === args.where.name_category.name);
          if (target) target.value = args.data.value;
          return Promise.resolve(args);
        },
      );
      (prisma.config.findMany as jest.Mock).mockImplementation(() =>
        Promise.resolve(rows.map((r) => ({ ...r }))),
      );

      expect(service.getCurrentSecret()).toBe("db-current-secret");
      await service.rotate();

      const rotated = service.getCurrentSecret();
      expect(rotated).not.toBe("db-current-secret");
      expect(service.getVerificationSecrets()).toContain("db-current-secret");
      expect(service.getVerificationSecrets()[0]).toBe(rotated);
    });

    it("serializes concurrent rotations so no signed secret is orphaned", async () => {
      const rows: ConfigRow[] = [row(), historyRow(JSON.stringify(["old-1"]))];
      const service = makeService(rows);

      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const jwtWrites: string[] = [];
      let txCalls = 0;
      (prisma.$transaction as jest.Mock).mockImplementation(
        (operations: Promise<unknown>[]) => {
          txCalls += 1;
          const result = Promise.all(operations);
          return txCalls === 1 ? gate.then(() => result) : result;
        },
      );
      (prisma.config.update as jest.Mock).mockImplementation(
        (args: {
          where: { name_category: { name: string } };
          data: { value: string };
        }) => {
          if (args.where.name_category.name === "jwtSecret") {
            jwtWrites.push(args.data.value);
          }
          const target = rows.find((r) => r.name === args.where.name_category.name);
          if (target) target.value = args.data.value;
          return Promise.resolve(args);
        },
      );
      (prisma.config.findMany as jest.Mock).mockImplementation(() =>
        Promise.resolve(rows.map((r) => ({ ...r }))),
      );

      const first = service.rotate();
      const second = service.rotate();
      release();
      await Promise.all([first, second]);

      const verification = service.getVerificationSecrets();
      // Every secret that actually signed tokens must still be verifiable:
      // the original one, the first rotation's, and the final one.
      expect(jwtWrites).toHaveLength(2);
      expect(verification).toContain("db-current-secret");
      for (const written of jwtWrites) {
        expect(verification).toContain(written);
      }
    });

    it("encrypts secrets at rest when the encryption key is configured", async () => {
      process.env.JWT_SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
      const rows: ConfigRow[] = [row(), historyRow(JSON.stringify(["old-1"]))];
      const service = makeService(rows);

      (prisma.config.update as jest.Mock).mockImplementation(
        (args: {
          where: { name_category: { name: string } };
          data: { value: string };
        }) => {
          const target = rows.find((r) => r.name === args.where.name_category.name);
          if (target) target.value = args.data.value;
          return Promise.resolve(args);
        },
      );
      (prisma.config.findMany as jest.Mock).mockImplementation(() =>
        Promise.resolve(rows.map((r) => ({ ...r }))),
      );

      await service.rotate();

      // Persisted values are ciphertext — the plain secret never hits the DB.
      expect(rows[0].value!.startsWith("enc:v1:")).toBe(true);
      expect(rows[1].value!.startsWith("enc:v1:")).toBe(true);
      expect(rows[0].value!).not.toContain("db-current-secret");

      // After reload the cached values are decrypted transparently.
      const rotated = service.getCurrentSecret();
      expect(rotated).not.toBe("db-current-secret");
      expect(rotated.length).toBeGreaterThanOrEqual(32);
      expect(service.getVerificationSecrets()).toContain("db-current-secret");
    });
  });
});
