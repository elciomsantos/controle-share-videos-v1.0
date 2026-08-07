import { BadRequestException } from "@nestjs/common";
import { LocalFileService } from "./local.service";
import { ConfigService } from "../config/config.service";
import { PrismaService } from "../prisma/prisma.service";
import { I18nService } from "nestjs-i18n";
import { fileTypeFromBuffer } from "file-type";
import * as fs from "fs/promises";

jest.mock("fs/promises", () => ({
  stat: jest.fn(),
  statfs: jest.fn(),
  appendFile: jest.fn(),
  rename: jest.fn(),
  unlink: jest.fn(),
  open: jest.fn(),
  read: jest.fn(),
  close: jest.fn(),
}));

jest.mock("file-type", () => ({
  fileTypeFromBuffer: jest.fn(),
}));

const fsMock = fs as unknown as Record<string, jest.Mock>;
const fileTypeMock = fileTypeFromBuffer as unknown as jest.Mock;

describe("LocalFileService (SEC-08)", () => {
  let prisma: {
    share: { findUnique: jest.Mock };
    file: { create: jest.Mock };
  };
  let config: {
    getBoolean: jest.Mock;
    getString: jest.Mock;
    getNumber: jest.Mock;
  };
  let i18n: { t: jest.Mock };
  let service: LocalFileService;

  beforeEach(() => {
    fileTypeMock.mockReset();
    fileTypeMock.mockResolvedValue(undefined);
    prisma = {
      share: { findUnique: jest.fn() },
      file: { create: jest.fn() },
    };
    config = {
      getBoolean: jest.fn(),
      getString: jest.fn(),
      getNumber: jest.fn((key: string) => {
        const values: Record<string, number> = {
          "share.chunkSize": 1048576,
          "share.maxSize": 1073741824,
          "share.maxFileSize": 0,
        };
        return values[key] ?? 0;
      }),
    };
    i18n = {
      t: jest.fn((key: string) => `t:${key}`),
    };
    service = new LocalFileService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      i18n as unknown as I18nService,
    );

    prisma.share.findUnique.mockResolvedValue({
      id: "s1",
      uploadLocked: false,
      files: [],
      creator: { shareSizeLimit: null },
    });
    fsMock.stat.mockResolvedValue({ size: 0 } as never);
    fsMock.statfs.mockResolvedValue({
      bavail: 1000000,
      bsize: 4096,
    } as never);
    fsMock.appendFile.mockResolvedValue(undefined);
    fsMock.rename.mockResolvedValue(undefined);
    fsMock.unlink.mockResolvedValue(undefined);
    fsMock.open.mockResolvedValue({
      read: jest.fn((sample: Buffer) => ({
        bytesRead: sample.byteLength,
      })),
      close: jest.fn().mockResolvedValue(undefined),
    } as never);
    prisma.file.create.mockResolvedValue({ id: "f1" });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("rejeita o upload quando a detecção de magic bytes falha de forma inesperada (fail-closed)", async () => {
    fileTypeMock.mockRejectedValue(new Error("parser exploded"));

    await expect(
      service.create("Zm9v", { index: 0, total: 1 }, { id: "a82eb345-ab84-4fa4-b71a-cbfe89592b9c", name: "doc.txt" }, "s1"),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(fsMock.unlink).toHaveBeenCalled();
    expect(prisma.file.create).not.toHaveBeenCalled();
  });

  it("aceita o upload quando os magic bytes correspondem à extensão", async () => {
    fileTypeMock.mockResolvedValue({ ext: "txt", mime: "text/plain" });

    const result = await service.create(
      "Zm9v",
      { index: 0, total: 1 },
      { id: "a82eb345-ab84-4fa4-b71a-cbfe89592b9c", name: "doc.txt" },
      "s1",
    );

    expect(result.id).toBe("a82eb345-ab84-4fa4-b71a-cbfe89592b9c");
    expect(prisma.file.create).toHaveBeenCalled();
  });

  it("mantém o erro de validação (magic bytes não batem com a extensão)", async () => {
    fileTypeMock.mockResolvedValue({ ext: "exe", mime: "application/x-msdownload" });

    await expect(
      service.create("Zm9v", { index: 0, total: 1 }, { id: "a82eb345-ab84-4fa4-b71a-cbfe89592b9c", name: "doc.txt" }, "s1"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.file.create).not.toHaveBeenCalled();
  });
});
