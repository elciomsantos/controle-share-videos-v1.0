import { BadRequestException } from "@nestjs/common";
import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { ShareMapper } from "./share.mapper";
import { FileStorageService } from "./file-storage.service";
import { ShareArchiveService } from "./share-archive.service";
import { PrismaService } from "../prisma/prisma.service";
import { ConfigService } from "../config/config.service";
import { SystemService } from "../system/system.service";
import { I18nService } from "nestjs-i18n";
import { createZipStream } from "../common/zip";
import { SHARE_DIRECTORY } from "../constants";
import * as fs from "fs";

jest.mock("../common/zip", () => ({
  createZipStream: jest.fn(),
}));

jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  createWriteStream: jest.fn(),
  createReadStream: jest.fn(() => new PassThrough()),
  mkdirSync: jest.fn(),
}));

const mkdirSyncMock = fs.mkdirSync as unknown as jest.Mock;

describe("ShareMapper", () => {
  let mapper: ShareMapper;

  beforeEach(() => {
    mapper = new ShareMapper();
  });

  it("soma os tamanhos dos arquivos via toBytes", () => {
    const result = mapper.transformShare({
      id: "s1",
      files: [{ size: "1048576" }, { size: 2048 }],
      recipients: [{ email: "a@x.com" }],
      security: { password: "hash", maxViews: 5, maxDownloads: 3 },
    });

    expect(result.size).toBe(1048576 + 2048);
    expect(result.recipients).toEqual(["a@x.com"]);
    expect(result.security).toEqual({
      maxViews: 5,
      maxDownloads: 3,
      passwordProtected: true,
    });
  });

  it("lida com share sem arquivos/recipients/security", () => {
    const result = mapper.transformShare({ id: "s2" });

    expect(result.size).toBe(0);
    expect(result.recipients).toEqual([]);
    expect(result.security).toEqual({
      maxViews: undefined,
      maxDownloads: undefined,
      passwordProtected: false,
    });
  });
});

describe("FileStorageService", () => {
  let systemService: { getSystemInfo: jest.Mock };
  let i18n: { t: jest.Mock };
  let service: FileStorageService;

  beforeEach(() => {
    systemService = { getSystemInfo: jest.fn() };
    i18n = { t: jest.fn((key: string) => key) };
    service = new FileStorageService(
      systemService as unknown as SystemService,
      i18n as unknown as I18nService,
    );
    mkdirSyncMock.mockClear();
  });

  it("não lança quando há espaço suficiente", async () => {
    systemService.getSystemInfo.mockResolvedValue({ total: 1000, used: 100 });

    await expect(service.ensureSpaceAvailable(500)).resolves.toBeUndefined();
  });

  it("lança BadRequestException quando falta espaço", async () => {
    systemService.getSystemInfo.mockResolvedValue({ total: 1000, used: 900 });

    await expect(service.ensureSpaceAvailable(500)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("cria o diretório do share", () => {
    service.createShareDirectory("abc");

    expect(mkdirSyncMock).toHaveBeenCalledWith(`${SHARE_DIRECTORY}/abc`, {
      recursive: true,
    });
  });
});

describe("ShareArchiveService", () => {
  let prisma: { file: { findMany: jest.Mock } };
  let config: { getNumber: jest.Mock };
  let service: ShareArchiveService;
  let writeStream: EventEmitter & { destroy: jest.Mock };

  const createZipStreamMock = jest.mocked(createZipStream);
  const createWriteStreamMock = fs.createWriteStream as unknown as jest.Mock;

  function makeArchive() {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    const archive: {
      on: jest.Mock;
      append: jest.Mock;
      pipe: jest.Mock;
      finalize: jest.Mock;
      abort: jest.Mock;
      emitData: (chunk: Buffer) => void;
    } = {
      on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
        (listeners[event] ??= []).push(cb);
        return archive;
      }),
      append: jest.fn(() => archive),
      pipe: jest.fn(() => writeStream),
      finalize: jest.fn(async () => {}),
      abort: jest.fn(),
      emitData: (chunk: Buffer) => {
        (listeners["data"] ?? []).forEach((cb) => cb(chunk));
      },
    };
    return archive;
  }

  beforeEach(() => {
    prisma = { file: { findMany: jest.fn() } };
    config = { getNumber: jest.fn() };
    service = new ShareArchiveService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
    );
    writeStream = new EventEmitter() as EventEmitter & { destroy: jest.Mock };
    writeStream.destroy = jest.fn();
    createWriteStreamMock.mockReturnValue(
      writeStream as unknown as fs.WriteStream,
    );
  });

  afterEach(() => {
    createWriteStreamMock.mockClear();
    createZipStreamMock.mockReset();
  });

  it("lança BadRequestException quando excede o máximo de arquivos", async () => {
    config.getNumber.mockImplementation((key: string) =>
      key === "share.zipMaxFiles" ? 2 : undefined,
    );
    prisma.file.findMany.mockResolvedValue([
      { id: "f1", size: "1", name: "a" },
      { id: "f2", size: "1", name: "b" },
      { id: "f3", size: "1", name: "c" },
    ]);

    await expect(service.createZip("s1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("lança BadRequestException quando excede o tamanho total", async () => {
    config.getNumber.mockImplementation((key: string) =>
      key === "share.zipMaxTotalSize" ? 100 : undefined,
    );
    prisma.file.findMany.mockResolvedValue([
      { id: "f1", size: "60", name: "a" },
      { id: "f2", size: "60", name: "b" },
    ]);

    await expect(service.createZip("s1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("gera o zip quando os limites são respeitados", async () => {
    config.getNumber.mockImplementation(() => undefined);
    createZipStreamMock.mockResolvedValue(makeArchive() as never);
    prisma.file.findMany.mockResolvedValue([{ id: "f1", size: "10", name: "a" }]);

    const promise = service.createZip("s1");
    await new Promise((r) => setImmediate(r));
    writeStream.emit("close");

    await expect(promise).resolves.toBeUndefined();
  });

  it("detecta zip-bomb quando o ratio excede o limite", async () => {
    config.getNumber.mockImplementation(() => undefined);
    const archive = makeArchive();
    createZipStreamMock.mockResolvedValue(archive as never);
    prisma.file.findMany.mockResolvedValue([{ id: "f1", size: "10", name: "a" }]);

    const promise = service.createZip("s1");
    await new Promise((r) => setImmediate(r));
    archive.emitData(Buffer.alloc(1031)); // totalSize(10) * MAX_RATIO(103) = 1030; 1031 > limit

    await expect(promise).rejects.toBeInstanceOf(BadRequestException);
    expect(archive.abort).toHaveBeenCalled();
  });
});
