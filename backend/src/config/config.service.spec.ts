import {
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import * as fs from "fs";
import { ConfigService } from "./config.service";
import { PrismaService } from "../prisma/prisma.service";

jest.mock("../prisma/prisma.service");
jest.mock("fs", () => {
  const actual = jest.requireActual<typeof import("fs")>("fs");
  return { ...actual, readFileSync: jest.fn() };
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

function row(overrides: Partial<ConfigRow>): ConfigRow {
  return {
    category: "general",
    name: "appName",
    value: null,
    defaultValue: "Guarda Municipal",
    type: "string",
    locked: false,
    secret: false,
    order: 1,
    ...overrides,
  };
}

describe("ConfigService", () => {
  const prisma = {
    config: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      count: jest.fn(),
      create: jest.fn(),
    },
  };

  function makeService(rows: ConfigRow[], yaml?: unknown) {
    const service = new ConfigService(rows as never, prisma as unknown as PrismaService);
    service.yamlConfig = yaml as never;
    return service;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.readFileSync as jest.Mock).mockReturnValue("");
  });

  describe("get", () => {
    it("returns the raw value for string/text types", () => {
      const service = makeService([row({ name: "appName", type: "string", value: "Test" })]);
      expect(service.get("general.appName")).toBe("Test");
    });

    it("parses number and filesize types with parseInt", () => {
      const service = makeService([
        row({ name: "maxFileSize", type: "filesize", value: "1048576" }),
        row({ name: "zipLevel", type: "number", value: "9" }),
      ]);
      expect(service.get("general.maxFileSize")).toBe(1048576);
      expect(service.get("general.zipLevel")).toBe(9);
    });

    it("parses boolean type", () => {
      const service = makeService([
        row({ name: "flag", type: "boolean", value: "true" }),
      ]);
      expect(service.get("general.flag")).toBe(true);
    });

    it("parses timespan type into { value, unit }", () => {
      const service = makeService([
        row({ name: "sessionDuration", type: "timespan", value: "3 months" }),
      ]);
      expect(service.get("general.sessionDuration")).toEqual({
        value: 3,
        unit: "months",
      });
    });

    it("falls back to defaultValue when value is null", () => {
      const service = makeService([
        row({ name: "appName", value: null, defaultValue: "Fallback" }),
      ]);
      expect(service.get("general.appName")).toBe("Fallback");
    });

    it("throws when the key does not exist", () => {
      const service = makeService([]);
      expect(() => service.get("general.missing")).toThrow(
        "Config variable general.missing not found",
      );
    });
  });

  describe("isEditAllowed", () => {
    it("returns true when no yaml config is loaded", () => {
      const service = makeService([], undefined);
      expect(service.isEditAllowed()).toBe(true);
    });

    it("returns false when a yaml config is loaded", () => {
      const service = makeService([], { general: {} });
      expect(service.isEditAllowed()).toBe(false);
    });
  });

  describe("validateConfigVariable", () => {
    it.each([
      ["share.shareIdLength", 2, 50],
      ["share.zipCompressionLevel", 0, 9],
      ["share.zipMaxFiles", 1, 100000],
      ["share.zipMaxTotalSize", 1, Infinity],
      ["share.zipMaxRatio", 1, Infinity],
      ["share.maxFileSize", 0, Infinity],
    ])("accepts in-range values for %s", (key, min, max) => {
      const service = makeService([], undefined);
      expect(() =>
        service.validateConfigVariable(key, max === Infinity ? min : max),
      ).not.toThrow();
    });

    it("rejects out-of-range values for share.shareIdLength", () => {
      const service = makeService([], undefined);
      expect(() => service.validateConfigVariable("share.shareIdLength", 1)).toThrow(
        BadRequestException,
      );
    });

    it("accepts non-number values without applying numeric rules", () => {
      const service = makeService([], undefined);
      expect(() =>
        service.validateConfigVariable("share.shareIdLength", "abc"),
      ).not.toThrow();
    });
  });

  describe("updateMany / update", () => {
    it("blocks updates when edit is not allowed (yaml active)", async () => {
      const service = makeService([], { general: {} });
      await expect(
        service.updateMany([{ key: "general.appName", value: "x" }]),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws NotFound when the variable does not exist", async () => {
      prisma.config.findUnique.mockResolvedValue(null);
      const service = makeService([row({})]);
      await expect(
        service.update("general.appName", "x"),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequest when value type does not match", async () => {
      prisma.config.findUnique.mockResolvedValue(row({ type: "number" }));
      const service = makeService([], undefined);
      await expect(
        service.update("general.appName", "not-a-number"),
      ).rejects.toThrow(BadRequestException);
    });

    it("updates, reloads variables and emits an update event", async () => {
      prisma.config.findUnique.mockResolvedValue(row({ type: "string" }));
      prisma.config.update.mockResolvedValue(row({ type: "string", value: "new" }));
      prisma.config.findMany.mockResolvedValue([]);
      const service = makeService([row({ type: "string" })], undefined);
      const onUpdate = jest.fn();
      service.on("update", onUpdate);

      const result = await service.update("general.appName", "new");

      expect(prisma.config.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { value: "new" },
        }),
      );
      expect(prisma.config.findMany).toHaveBeenCalled();
      expect(onUpdate).toHaveBeenCalledWith("general.appName", "new");
      expect(result).toEqual(row({ type: "string", value: "new" }));
    });
  });

  describe("initialize / loadYamlConfig / migrateInitUser", () => {
    it("loads yaml config and creates the initial admin user", async () => {
      const yaml = `
initUser:
  enabled: true
  email: init@test.org
  username: init
  password: InitPassw0rd
  isAdmin: true
general:
  appName: FromYaml
`;
      const readFileSyncMock = fs.readFileSync as jest.Mock;
      readFileSyncMock.mockReturnValue(yaml);

      prisma.user.count.mockResolvedValue(0);
      prisma.user.create.mockResolvedValue({ id: "u1" });

      const service = makeService([row({})]);
      await service.initialize();

      expect(service.yamlConfig).toBeTruthy();
      expect(prisma.user.count).toHaveBeenCalled();
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: "init@test.org",
            isAdmin: true,
          }),
        }),
      );
    });

    it("skips initial user creation when an admin already exists", async () => {
      const yaml = `
initUser:
  enabled: true
  email: init@test.org
  username: init
  password: InitPassw0rd
  isAdmin: true
`;
      const readFileSyncMock = fs.readFileSync as jest.Mock;
      readFileSyncMock.mockReturnValue(yaml);
      prisma.user.count.mockResolvedValue(1);

      const service = makeService([row({})]);
      await service.initialize();

      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("falls back to UI configuration when config.yaml cannot be read", async () => {
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error("ENOENT");
      });
      const service = makeService([row({})]);
      await service.initialize();
      expect(service.yamlConfig).toBeNull();
      expect(service.isEditAllowed()).toBe(true);
    });
  });
});
