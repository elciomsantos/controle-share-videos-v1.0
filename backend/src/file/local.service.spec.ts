import { BadRequestException } from "@nestjs/common";
import { LocalFileService } from "./local.service";
import { ConfigService } from "../config/config.service";
import { PrismaService } from "../prisma/prisma.service";
import { I18nService } from "nestjs-i18n";
import { fileTypeFromBuffer } from "file-type";
import { Readable } from "stream";
import type { IUploadRepository } from "../storage/upload-repository.interface";

jest.mock("file-type", () => ({
  fileTypeFromBuffer: jest.fn(),
}));

const fileTypeMock = fileTypeFromBuffer as unknown as jest.Mock;

describe("LocalFileService (SEC-08)", () => {
  let prisma: {
    share: { findUnique: jest.Mock };
    file: { create: jest.Mock; findUnique: jest.Mock };
  };
  let config: {
    getBoolean: jest.Mock;
    getString: jest.Mock;
    getNumber: jest.Mock;
  };
  let i18n: { t: jest.Mock };
  let repository: jest.Mocked<IUploadRepository>;
  let service: LocalFileService;

  const mockReadStream = () =>
    new Readable({
      read() {
        this.push(Buffer.alloc(100));
        this.push(null);
      },
    });

  beforeEach(() => {
    fileTypeMock.mockReset();
    fileTypeMock.mockResolvedValue(undefined);
    prisma = {
      share: { findUnique: jest.fn() },
      file: { create: jest.fn(), findUnique: jest.fn() },
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
    repository = {
      statFile: jest.fn(),
      availableSpaceBytes: jest.fn(),
      appendBuffer: jest.fn(),
      moveFile: jest.fn(),
      readSample: jest.fn(),
      createReadStream: jest.fn(mockReadStream),
      createWriteStream: jest.fn(),
      unlinkIfExists: jest.fn(),
      removeShareDirectory: jest.fn(),
      createShareDirectory: jest.fn(),
      listShareDirectories: jest.fn(),
      listDirectory: jest.fn(),
    } as unknown as jest.Mocked<IUploadRepository>;

    service = new LocalFileService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      i18n as unknown as I18nService,
      repository,
    );

    prisma.share.findUnique.mockResolvedValue({
      id: "s1",
      uploadLocked: false,
      files: [],
      creator: { shareSizeLimit: null },
    });
    repository.statFile.mockResolvedValue({ size: 0, mtime: new Date() } as never);
    repository.availableSpaceBytes.mockResolvedValue(1000000 * 4096);
    repository.appendBuffer.mockResolvedValue(undefined);
    repository.moveFile.mockResolvedValue(undefined);
    repository.readSample.mockResolvedValue(Buffer.alloc(0));
    repository.unlinkIfExists.mockResolvedValue(undefined);
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

    expect(repository.unlinkIfExists).toHaveBeenCalled();
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

  describe("get(range) PERF-06", () => {
    const meta = {
      id: "f1",
      name: "clip.mp4",
      size: BigInt(1000),
      description: null,
      createdAt: new Date(),
    };

    beforeEach(() => {
      prisma.file.findUnique.mockResolvedValue(meta);
    });

    it("repassa o parâmetro de range para o createReadStream (stream parcial)", async () => {
      await service.get("s1", "f1", { start: 100, end: 499 });

      expect(repository.createReadStream).toHaveBeenCalledTimes(1);
      expect(repository.createReadStream).toHaveBeenCalledWith("s1/f1", {
        start: 100,
        end: 499,
      });
    });

    it("chama createReadStream sem range quando nenhum é fornecido", async () => {
      await service.get("s1", "f1");

      expect(repository.createReadStream).toHaveBeenCalledWith("s1/f1", {
        start: undefined,
        end: undefined,
      });
    });

    it("retorna o metadata com size como string e o stream da faixa solicitada", async () => {
      const result = await service.get("s1", "f1", { start: 0, end: 100 });

      expect(result.metaData.size).toBe("1000");
      expect(result.file).toBeDefined();
    });

    it("lança NotFoundException quando o arquivo não existe", async () => {
      prisma.file.findUnique.mockResolvedValue(null);

      await expect(service.get("s1", "missing")).rejects.toThrow("t:file.notFound");
    });
  });
});
