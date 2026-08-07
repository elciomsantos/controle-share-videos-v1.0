import { Logger } from "@nestjs/common";
import { JobsService } from "./jobs.service";
import { FileService } from "../file/file.service";
import { PrismaService } from "../prisma/prisma.service";
import { ConfigService } from "../config/config.service";
import * as fs from "fs";

describe("JobsService", () => {
  let prisma: {
    share: { findMany: jest.Mock; deleteMany: jest.Mock };
    user: { findMany: jest.Mock; deleteMany: jest.Mock };
  };
  let fileService: { deleteAllFiles: jest.Mock };
  let configServer: { getTimespan: jest.Mock; getNumber: jest.Mock };
  let service: JobsService;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    prisma = {
      share: { findMany: jest.fn(), deleteMany: jest.fn() },
      user: { findMany: jest.fn(), deleteMany: jest.fn() },
    };
    fileService = { deleteAllFiles: jest.fn() };
    configServer = { getTimespan: jest.fn(), getNumber: jest.fn() };
    service = new JobsService(
      prisma as unknown as PrismaService,
      fileService as unknown as FileService,
      configServer as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("deleteExpiredShares", () => {
    it("retorna cedo quando fileRetentionPeriod = -1", async () => {
      configServer.getTimespan.mockReturnValue({ value: -1, unit: "day" });

      await service.deleteExpiredShares();

      expect(prisma.share.findMany).not.toHaveBeenCalled();
    });

    it("processa em lotes e para quando o batch fica vazio", async () => {
      configServer.getTimespan.mockReturnValue({ value: 7, unit: "day" });
      prisma.share.findMany
        .mockResolvedValueOnce([{ id: "a" }, { id: "b" }])
        .mockResolvedValueOnce([{ id: "c" }])
        .mockResolvedValueOnce([]);
      prisma.share.deleteMany.mockResolvedValue({ count: 1 });
      fileService.deleteAllFiles.mockResolvedValue(undefined);

      await service.deleteExpiredShares();

      expect(prisma.share.findMany).toHaveBeenCalledTimes(3);
      expect(prisma.share.deleteMany).toHaveBeenCalledTimes(3);
      expect(prisma.share.deleteMany).toHaveBeenCalledWith({
        where: { id: "a" },
      });
    });

    it("isola falha: um share com erro não interrompe o lote", async () => {
      configServer.getTimespan.mockReturnValue({ value: 7, unit: "day" });
      prisma.share.findMany
        .mockResolvedValueOnce([{ id: "bad" }, { id: "ok" }])
        .mockResolvedValueOnce([]);
      prisma.share.deleteMany.mockResolvedValue({ count: 1 });
      fileService.deleteAllFiles
        .mockRejectedValueOnce(new Error("disco cheio"))
        .mockResolvedValueOnce(undefined);

      await expect(service.deleteExpiredShares()).resolves.toBeUndefined();

      expect(prisma.share.deleteMany).toHaveBeenCalledTimes(1);
      expect(prisma.share.deleteMany).toHaveBeenCalledWith({
        where: { id: "ok" },
      });
    });
  });

  describe("deleteUnfinishedShares", () => {
    it("deleta em lote com deleteMany", async () => {
      prisma.share.findMany
        .mockResolvedValueOnce([{ id: "u1" }, { id: "u2" }])
        .mockResolvedValueOnce([]);
      prisma.share.deleteMany.mockResolvedValue({ count: 1 });
      fileService.deleteAllFiles.mockResolvedValue(undefined);

      await service.deleteUnfinishedShares();

      expect(prisma.share.deleteMany).toHaveBeenCalledTimes(2);
      expect(fileService.deleteAllFiles).toHaveBeenCalledWith("u1");
    });
  });

  describe("deleteUnactivatedUsers", () => {
    it("deleta arquivos dos shares e o usuário, isolando falha", async () => {
      prisma.user.findMany
        .mockResolvedValueOnce([
          { id: "u1", shares: [{ id: "s1" }] },
          { id: "u2", shares: [] },
        ])
        .mockResolvedValueOnce([]);
      prisma.user.deleteMany.mockResolvedValue({ count: 1 });
      fileService.deleteAllFiles
        .mockRejectedValueOnce(new Error("permissão negada"))
        .mockResolvedValueOnce(undefined);

      await expect(service.deleteUnactivatedUsers()).resolves.toBeUndefined();

      expect(prisma.user.deleteMany).toHaveBeenCalledTimes(1);
      expect(prisma.user.deleteMany).toHaveBeenCalledWith({
        where: { id: "u2" },
      });
      expect(fileService.deleteAllFiles).toHaveBeenCalledWith("s1");
    });
  });

  describe("deleteTemporaryFiles", () => {
    const mockDir = (name: string) => ({
      name,
      isDirectory: () => true,
    }) as unknown as import("fs").Dirent;

    beforeEach(() => {
      jest.spyOn(fs.promises, "readdir").mockReset();
      jest.spyOn(fs.promises, "stat").mockReset();
      jest.spyOn(fs.promises, "rm").mockReset();
    });

    it("deleta arquivos .tmp-chunk com mtime > 1 dia", async () => {
      const oldDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      (fs.promises.readdir as jest.Mock)
        .mockResolvedValueOnce([mockDir("share1"), mockDir("share2")])
        .mockResolvedValueOnce(["file1.tmp-chunk", "normal.txt"])
        .mockResolvedValueOnce(["file2.tmp-chunk"]);
      (fs.promises.stat as jest.Mock).mockImplementation(async () => ({
        mtime: oldDate,
      }));
      (fs.promises.rm as jest.Mock).mockResolvedValue(undefined);

      await service.deleteTemporaryFiles();

      expect(fs.promises.rm).toHaveBeenCalledTimes(2);
    });

    it("não deleta arquivos mais novos que 1 dia", async () => {
      const recentDate = new Date();
      (fs.promises.readdir as jest.Mock)
        .mockResolvedValueOnce([mockDir("share1")])
        .mockResolvedValueOnce(["recent.tmp-chunk"]);
      (fs.promises.stat as jest.Mock).mockImplementation(async () => ({
        mtime: recentDate,
      }));
      (fs.promises.rm as jest.Mock).mockResolvedValue(undefined);

      await service.deleteTemporaryFiles();

      expect(fs.promises.rm).not.toHaveBeenCalled();
    });

    it("isola falha: erro de leitura em um share não interrompe", async () => {
      const oldDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      (fs.promises.readdir as jest.Mock)
        .mockResolvedValueOnce([mockDir("bad"), mockDir("good")])
        .mockRejectedValueOnce(new Error("permission denied"))
        .mockResolvedValueOnce(["ok.tmp-chunk"]);
      (fs.promises.stat as jest.Mock).mockImplementation(async () => ({
        mtime: oldDate,
      }));
      (fs.promises.rm as jest.Mock).mockResolvedValue(undefined);

      await expect(service.deleteTemporaryFiles()).resolves.toBeUndefined();
      expect(fs.promises.rm).toHaveBeenCalledTimes(1);
    });

    it("retorna cedo se readdir do SHARE_DIRECTORY falha", async () => {
      (fs.promises.readdir as jest.Mock).mockRejectedValueOnce(
        new Error("ENOENT"),
      );

      await expect(service.deleteTemporaryFiles()).resolves.toBeUndefined();
      expect(fs.promises.stat).not.toHaveBeenCalled();
    });
  });
});
