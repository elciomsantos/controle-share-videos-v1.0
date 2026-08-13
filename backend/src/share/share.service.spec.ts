import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { EventEmitter } from "events";
import { PassThrough } from "stream";
import argon from "argon2";
import { ShareService } from "./share.service";
import { ShareMapper } from "./share.mapper";
import { FileStorageService } from "./file-storage.service";
import { ShareArchiveService } from "./share-archive.service";
import { ShareValidationService } from "./domain/share-validation.service";
import { ShareTokenService } from "./domain/share-token.service";
import { ShareLimitService } from "./domain/share-limit.service";
import { PrismaService } from "../prisma/prisma.service";
import { ConfigService } from "../config/config.service";
import { SystemService } from "../system/system.service";
import { FileService } from "../file/file.service";
import { DownloadLogService } from "../download-log/download-log.service";
import { EmailService } from "../email/email.service";
import { MetricsService } from "../metrics/metrics.service";
import { I18nService } from "nestjs-i18n";
import { createZipStream } from "../common/zip";
import type { IUploadRepository } from "../storage/upload-repository.interface";
import {
  File,
  ShareSecurity,
  ShareRecipient,
  User,
} from "../../prisma/generated/prisma/client";

jest.mock("../common/zip", () => ({
  createZipStream: jest.fn(),
}));

jest.mock("argon2", () => ({
  hash: jest.fn(),
  verify: jest.fn(),
}));
const hashMock = argon.hash as jest.Mock;
const verifyMock = argon.verify as jest.Mock;

describe("ShareMapper", () => {
  let mapper: ShareMapper;

  beforeEach(() => {
    mapper = new ShareMapper();
  });

  it("soma os tamanhos dos arquivos via toBytes", () => {
    const result = mapper.transformShare({
      id: "s1",
      files: [{ size: 1048576n }, { size: 2048n }] as File[],
      recipients: [{ email: "a@x.com" }] as ShareRecipient[],
      security: { password: "hash", maxViews: 5, maxDownloads: 3 } as ShareSecurity,
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
      maxViews: null,
      maxDownloads: null,
      passwordProtected: false,
    });
  });
});

describe("FileStorageService", () => {
  let systemService: { getSystemInfo: jest.Mock };
  let i18n: { t: jest.Mock };
  let repository: jest.Mocked<IUploadRepository>;
  let service: FileStorageService;

  beforeEach(() => {
    systemService = { getSystemInfo: jest.fn() };
    i18n = { t: jest.fn((key: string) => key) };
    repository = {
      createShareDirectory: jest.fn(),
    } as unknown as jest.Mocked<IUploadRepository>;
    service = new FileStorageService(
      systemService as unknown as SystemService,
      i18n as unknown as I18nService,
      repository,
    );
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

  it("cria o diretório do share via repositório", () => {
    service.createShareDirectory("abc");

    expect(repository.createShareDirectory).toHaveBeenCalledWith("abc");
  });
});

describe("ShareArchiveService", () => {
  let prisma: { file: { findMany: jest.Mock } };
  let config: { getNumber: jest.Mock };
  let repository: jest.Mocked<IUploadRepository>;
  let service: ShareArchiveService;
  let writeStream: EventEmitter & { destroy: jest.Mock };

  const createZipStreamMock = jest.mocked(createZipStream);

  function makeArchive() {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    const archive: {
      on: jest.Mock;
      once: jest.Mock;
      append: jest.Mock;
      pipe: jest.Mock;
      finalize: jest.Mock;
      abort: jest.Mock;
      emitData: (chunk: Buffer) => void;
      emitDrain: () => void;
    } = {
      on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
        (listeners[event] ??= []).push(cb);
        return archive;
      }),
      once: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
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
      emitDrain: () => {
        (listeners["drain"] ?? []).splice(0).forEach((cb) => cb());
      },
    };
    return archive;
  }

  beforeEach(() => {
    prisma = { file: { findMany: jest.fn() } };
    config = { getNumber: jest.fn() };
    repository = {
      createWriteStream: jest.fn(),
      createReadStream: jest.fn(() => new PassThrough()),
    } as unknown as jest.Mocked<IUploadRepository>;
    service = new ShareArchiveService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      repository,
    );
    writeStream = new EventEmitter() as EventEmitter & { destroy: jest.Mock };
    writeStream.destroy = jest.fn();
    repository.createWriteStream.mockReturnValue(
      writeStream as unknown as ReturnType<IUploadRepository["createWriteStream"]>,
    );
  });

  afterEach(() => {
    repository.createWriteStream.mockClear();
    createZipStreamMock.mockReset();
  });

  it("lança BadRequestException quando excede o máximo de arquivos", async () => {
    config.getNumber.mockImplementation((key: string) =>
      key === "share.zipMaxFiles" ? 2 : undefined,
    );
    prisma.file.findMany.mockResolvedValue([
      { id: "f1", size: 1n, name: "a" },
      { id: "f2", size: 1n, name: "b" },
      { id: "f3", size: 1n, name: "c" },
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
      { id: "f1", size: 60n, name: "a" },
      { id: "f2", size: 60n, name: "b" },
    ]);

    await expect(service.createZip("s1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("gera o zip quando os limites são respeitados", async () => {
    config.getNumber.mockImplementation(() => undefined);
    const archive = makeArchive();
    createZipStreamMock.mockResolvedValue(archive as never);
    prisma.file.findMany.mockResolvedValue([{ id: "f1", size: 10n, name: "a" }]);

    const promise = service.createZip("s1");
    await new Promise((r) => setImmediate(r));
    archive.emitDrain();
    await new Promise((r) => setImmediate(r));
    writeStream.emit("close");

    await expect(promise).resolves.toBeUndefined();
  });

  it("detecta zip-bomb quando o ratio excede o limite", async () => {
    config.getNumber.mockImplementation(() => undefined);
    const archive = makeArchive();
    createZipStreamMock.mockResolvedValue(archive as never);
    prisma.file.findMany.mockResolvedValue([{ id: "f1", size: 10n, name: "a" }]);

    const promise = service.createZip("s1");
    await new Promise((r) => setImmediate(r));
    archive.emitDrain();
    archive.emitData(Buffer.alloc(1031));

    await expect(promise).rejects.toBeInstanceOf(BadRequestException);
    expect(archive.abort).toHaveBeenCalled();
  });
});

describe("ShareService", () => {
  type Mocks = {
    prisma: {
      share: {
        create: jest.Mock;
        findUnique: jest.Mock;
        findFirst: jest.Mock;
        findMany: jest.Mock;
        count: jest.Mock;
        update: jest.Mock;
        updateMany: jest.Mock;
        delete: jest.Mock;
      };
      shareSecurity: { delete: jest.Mock; upsert: jest.Mock };
    };
    fileService: { deleteAllFiles: jest.Mock };
    emailService: { sendMailToShareRecipients: jest.Mock };
    downloadLogService: { record: jest.Mock };
    shareMapper: { transformShare: jest.Mock };
    archiveService: { createZip: jest.Mock };
    storageService: {
      ensureSpaceAvailable: jest.Mock;
      createShareDirectory: jest.Mock;
    };
    validationService: {
      validateShareIdAvailable: jest.Mock;
      parseExpiration: jest.Mock;
      validateExpiration: jest.Mock;
      validateCreatorAccess: jest.Mock;
    };
    tokenService: { generateShareToken: jest.Mock; verifyShareToken: jest.Mock };
    limitService: { checkShareSizeLimit: jest.Mock };
    config: { getBoolean: jest.Mock; getNumber: jest.Mock };
    metrics: { incSharesCreated: jest.Mock };
    service: ShareService;
  };

  function makeService(): Mocks {
    const mocks = {
      prisma: {
        share: {
          create: jest.fn(),
          findUnique: jest.fn(),
          findFirst: jest.fn(),
          findMany: jest.fn(),
          count: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
          delete: jest.fn(),
        },
        shareSecurity: { delete: jest.fn(), upsert: jest.fn() },
      },
      fileService: { deleteAllFiles: jest.fn() },
      emailService: { sendMailToShareRecipients: jest.fn() },
      downloadLogService: { record: jest.fn() },
      shareMapper: { transformShare: jest.fn((share) => share) },
      archiveService: { createZip: jest.fn() },
      storageService: {
        ensureSpaceAvailable: jest.fn(),
        createShareDirectory: jest.fn(),
      },
      validationService: {
        validateShareIdAvailable: jest.fn(),
        parseExpiration: jest.fn((expiration: string) =>
          expiration === "never" ? null : new Date(expiration),
        ),
        validateExpiration: jest.fn(),
        validateCreatorAccess: jest.fn(),
      },
      tokenService: {
        generateShareToken: jest.fn(),
        verifyShareToken: jest.fn(),
      },
      limitService: { checkShareSizeLimit: jest.fn() },
      config: { getBoolean: jest.fn(), getNumber: jest.fn() },
      metrics: { incSharesCreated: jest.fn() },
    } as unknown as Mocks;

    mocks.service = new ShareService(
      mocks.prisma as unknown as PrismaService,
      mocks.fileService as unknown as FileService,
      mocks.emailService as unknown as EmailService,
      mocks.downloadLogService as unknown as DownloadLogService,
      { t: (key: string) => `t:${key}` } as unknown as I18nService,
      mocks.shareMapper as unknown as ShareMapper,
      mocks.archiveService as unknown as ShareArchiveService,
      mocks.storageService as unknown as FileStorageService,
      mocks.validationService as unknown as ShareValidationService,
      mocks.tokenService as unknown as ShareTokenService,
      mocks.limitService as unknown as ShareLimitService,
      mocks.config as unknown as ConfigService,
      mocks.metrics as unknown as MetricsService,
    );

    return mocks;
  }

  const makeShare = (overrides: Record<string, unknown> = {}) => ({
    id: "s1",
    createdAt: new Date("2026-01-01"),
    updatedAt: null,
    name: "Share 1",
    uploadLocked: true,
    isZipReady: false,
    views: 0,
    downloads: 0,
    expiration: null,
    description: null,
    removedReason: null,
    creatorId: "u1",
    storageProvider: "LOCAL",
    files: [],
    recipients: [],
    security: null,
    creator: null,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    hashMock.mockResolvedValue("argon-hash");
    verifyMock.mockResolvedValue(true);
  });

  describe("create", () => {
    it("cria share básico com user conectado e deduplica recipients", async () => {
      const { service, prisma, storageService, validationService, metrics } =
        makeService();
      const dto = {
        id: "share-1",
        name: "Share 1",
        expiration: "never",
        description: "desc",
        recipients: ["a@x.com", "a@x.com", "b@x.com"],
        security: undefined,
      };
      validationService.validateShareIdAvailable.mockResolvedValue({
        isAvailable: true,
      });
      prisma.share.create.mockResolvedValue(makeShare({ id: "share-1" }));

      const result = await service.create(dto as never, {
        id: "u1",
        isAdmin: false,
      } as User);

      expect(storageService.ensureSpaceAvailable).not.toHaveBeenCalled();
      expect(storageService.createShareDirectory).toHaveBeenCalledWith("share-1");
      expect(prisma.share.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            creator: { connect: { id: "u1" } },
            recipients: {
              create: [{ email: "a@x.com" }, { email: "b@x.com" }],
            },
          }),
        }),
      );
      expect(metrics.incSharesCreated).toHaveBeenCalled();
      expect(result.generatedPassword).toBeUndefined();
    });

    it("valida espaço disponível quando size é informado", async () => {
      const { service, storageService, prisma, validationService } = makeService();
      validationService.validateShareIdAvailable.mockResolvedValue({
        isAvailable: true,
      });
      prisma.share.create.mockResolvedValue(makeShare());

      await service.create(
        { id: "share-1", expiration: "never", size: 500, recipients: [] } as never,
        undefined,
      );

      expect(storageService.ensureSpaceAvailable).toHaveBeenCalledWith(500);
    });

    it("lança BadRequest quando o id já está em uso", async () => {
      const { service, validationService } = makeService();
      validationService.validateShareIdAvailable.mockResolvedValue({
        isAvailable: false,
      });

      await expect(
        service.create({ id: "dup", expiration: "never" } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(validationService.validateExpiration).not.toHaveBeenCalled();
    });

    it("faz hash do password informado", async () => {
      const { service, prisma, validationService } = makeService();
      validationService.validateShareIdAvailable.mockResolvedValue({
        isAvailable: true,
      });
      prisma.share.create.mockResolvedValue(makeShare());

      await service.create({
        id: "share-1",
        expiration: "never",
        security: { password: "secret", maxViews: 5, maxDownloads: 3 },
        recipients: [],
      } as never);

      expect(hashMock).toHaveBeenCalledWith("secret", expect.anything());
      expect(prisma.share.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            security: {
              create: { password: "argon-hash", maxViews: 5, maxDownloads: 3 },
            },
          }),
        }),
      );
    });

    it("gera senha automática quando autoGeneratePassword está ativo", async () => {
      const { service, prisma, validationService, config } = makeService();
      validationService.validateShareIdAvailable.mockResolvedValue({
        isAvailable: true,
      });
      config.getBoolean.mockReturnValue(true);
      config.getNumber.mockReturnValue(12);
      prisma.share.create.mockResolvedValue(makeShare());

      const result = await service.create({
        id: "share-1",
        expiration: "never",
        security: undefined,
        recipients: [],
      } as never);

      expect(hashMock).toHaveBeenCalledTimes(1);
      expect(result.generatedPassword).toBeDefined();
      expect(prisma.share.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            security: {
              create: expect.objectContaining({ password: "argon-hash" }),
            },
          }),
        }),
      );
    });
  });

  describe("complete", () => {
    it("lança BadRequest quando o share já está completo", async () => {
      const { service, prisma } = makeService();
      prisma.share.findUnique.mockResolvedValue(
        makeShare({ uploadLocked: true }),
      );

      await expect(service.complete("s1")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("lança NotFound quando o share não existe", async () => {
      const { service, prisma } = makeService();
      prisma.share.findUnique.mockResolvedValue(null);

      await expect(service.complete("s1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("lança BadRequest quando não há arquivos", async () => {
      const { service, prisma } = makeService();
      prisma.share.findUnique.mockResolvedValue(
        makeShare({ uploadLocked: false, files: [] }),
      );

      await expect(service.complete("s1")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("gera zip e envia e-mails quando há múltiplos arquivos", async () => {
      const { service, prisma, archiveService, emailService } = makeService();
      prisma.share.findUnique.mockResolvedValue(
        makeShare({
          uploadLocked: false,
          files: [{ id: "f1" }, { id: "f2" }],
          recipients: [{ id: "r1", email: "a@x.com" }],
          security: { password: "hash", maxViews: 5, maxDownloads: 3 },
        }),
      );
      archiveService.createZip.mockResolvedValue(undefined);
      emailService.sendMailToShareRecipients.mockResolvedValue(undefined);
      prisma.share.update.mockResolvedValue(
        makeShare({
          uploadLocked: true,
          security: { password: "hash", maxViews: 5, maxDownloads: 3 },
        }),
      );

      const result = await service.complete("s1");

      expect(archiveService.createZip).toHaveBeenCalledWith("s1");
      expect(emailService.sendMailToShareRecipients).toHaveBeenCalledTimes(1);
      expect(result.hasPassword).toBe(true);
      expect(result.maxViews).toBe(5);
      expect(result.maxDownloads).toBe(3);
    });

    it("não gera zip com um único arquivo", async () => {
      const { service, prisma, archiveService } = makeService();
      prisma.share.findUnique.mockResolvedValue(
        makeShare({
          uploadLocked: false,
          files: [{ id: "f1" }],
          recipients: [],
        }),
      );
      prisma.share.update.mockResolvedValue(makeShare({ uploadLocked: true }));

      await service.complete("s1");

      expect(archiveService.createZip).not.toHaveBeenCalled();
    });
  });

  describe("revertComplete", () => {
    it("desbloqueia upload e desmarca zip", async () => {
      const { service, prisma } = makeService();
      prisma.share.update.mockResolvedValue(makeShare());

      await service.revertComplete("s1");

      expect(prisma.share.update).toHaveBeenCalledWith({
        where: { id: "s1" },
        data: { uploadLocked: false, isZipReady: false },
      });
    });
  });

  describe("getShares", () => {
    it("pagina e transforma via mapper", async () => {
      const { service, prisma, shareMapper } = makeService();
      prisma.share.findMany.mockResolvedValue([makeShare(), makeShare()]);
      prisma.share.count.mockResolvedValue(2);
      shareMapper.transformShare.mockReturnValue({ id: "mapped" });

      const result = await service.getShares(1, 10);

      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.perPage).toBe(10);
      expect(result.items).toHaveLength(2);
      expect(shareMapper.transformShare).toHaveBeenCalledTimes(2);
    });
  });

  describe("getSharesByUser", () => {
    it("filtra por creator, locked e expiração futura", async () => {
      const { service, prisma } = makeService();
      prisma.share.findMany.mockResolvedValue([makeShare()]);
      prisma.share.count.mockResolvedValue(1);

      const result = await service.getSharesByUser("u1", 1, 10);

      expect(prisma.share.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            creator: { id: "u1" },
            uploadLocked: true,
            OR: expect.any(Array),
          },
        }),
      );
      expect(result.items).toHaveLength(1);
    });
  });

  describe("get", () => {
    it("lança NotFound com removedReason", async () => {
      const { service, prisma } = makeService();
      prisma.share.findUnique.mockResolvedValue(
        makeShare({ removedReason: "removido" }),
      );

      await expect(service.get("s1")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("lança NotFound quando não existe ou não está locked", async () => {
      const { service, prisma } = makeService();
      prisma.share.findUnique.mockResolvedValue(null);

      await expect(service.get("s1")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("retorna share transformado", async () => {
      const { service, prisma, shareMapper } = makeService();
      prisma.share.findUnique.mockResolvedValue(makeShare());
      shareMapper.transformShare.mockReturnValue({ id: "s1", size: 10 });

      const result = await service.get("s1");

      expect(result).toEqual({ id: "s1", size: 10 });
    });
  });

  describe("remove", () => {
    it("lança NotFound quando o share não existe", async () => {
      const { service, prisma } = makeService();
      prisma.share.findUnique.mockResolvedValue(null);

      await expect(service.remove("s1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("valida acesso, registra logs e deleta", async () => {
      const { service, prisma, fileService, downloadLogService, validationService } =
        makeService();
      prisma.share.findUnique.mockResolvedValue({
        id: "s1",
        creatorId: "u1",
        files: [{ id: "f1", name: "a.txt", size: "100" }],
      });

      await service.remove("s1", false, {
        userId: "u1",
        username: "user",
        ip: "1.2.3.4",
      });

      expect(validationService.validateCreatorAccess).toHaveBeenCalled();
      expect(downloadLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: "delete", fileId: "f1" }),
      );
      expect(fileService.deleteAllFiles).toHaveBeenCalledWith("s1");
      expect(prisma.share.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
    });
  });

  describe("expire", () => {
    it("lança NotFound quando o share não existe", async () => {
      const { service, prisma } = makeService();
      prisma.share.findUnique.mockResolvedValue(null);

      await expect(service.expire("s1")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("define expiration para agora após validar acesso", async () => {
      const { service, prisma, validationService } = makeService();
      prisma.share.findUnique.mockResolvedValue(makeShare());

      await service.expire("s1");

      expect(validationService.validateCreatorAccess).toHaveBeenCalledWith(
        expect.anything(),
        false,
        "expire",
      );
      expect(prisma.share.update).toHaveBeenCalled();
      const updateArg = prisma.share.update.mock.calls[0][0];
      expect(updateArg.data.expiration).toBeInstanceOf(Date);
    });
  });

  describe("update", () => {
    it("lança NotFound quando o share não existe", async () => {
      const { service, prisma } = makeService();
      prisma.share.findUnique.mockResolvedValue(null);

      await expect(
        service.update("s1", { name: "Novo" }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("atualiza campos e aplica security quando informada", async () => {
      const { service, prisma, validationService } = makeService();
      prisma.share.findUnique
        .mockResolvedValueOnce(makeShare())
        .mockResolvedValueOnce(makeShare());
      prisma.share.update.mockResolvedValue(makeShare());
      validationService.parseExpiration.mockReturnValue(
        new Date("2026-02-01"),
      );

      await service.update(
        "s1",
        {
          name: "Novo",
          description: "desc",
          expiration: "2026-02-01",
          security: { password: "nova", maxViews: 3 },
        } as never,
        { id: "u1", isAdmin: false } as User,
      );

      expect(prisma.share.update).toHaveBeenCalledWith({
        where: { id: "s1" },
        data: expect.objectContaining({
          name: "Novo",
          description: "desc",
          expiration: new Date("2026-02-01"),
        }),
      });
      expect(prisma.shareSecurity.upsert).toHaveBeenCalled();
    });
  });

  describe("updateSecurity", () => {
    it("deleta security quando tudo é removido", async () => {
      const { service, prisma } = makeService();
      await (service as unknown as {
        updateSecurity: (
          shareId: string,
          body: { security: { removePassword: true } },
          current?: ShareSecurity,
        ) => Promise<void>;
      }).updateSecurity(
        "s1",
        { security: { removePassword: true } },
        { shareId: "s1", password: "hash" } as ShareSecurity,
      );

      expect(prisma.shareSecurity.delete).toHaveBeenCalledWith({
        where: { shareId: "s1" },
      });
      expect(prisma.shareSecurity.upsert).not.toHaveBeenCalled();
    });

    it("faz upsert com novo password hashado", async () => {
      const { service, prisma } = makeService();
      await (service as unknown as {
        updateSecurity: (
          shareId: string,
          body: { security: { password: string; maxViews: number } },
          current?: ShareSecurity,
        ) => Promise<void>;
      }).updateSecurity("s1", { security: { password: "nova", maxViews: 3 } });

      expect(hashMock).toHaveBeenCalledWith("nova", expect.anything());
      expect(prisma.shareSecurity.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ password: "argon-hash" }),
          update: expect.objectContaining({ password: "argon-hash" }),
        }),
      );
    });
  });

  describe("increaseViewCount", () => {
    it("incrementa via update quando não há maxViews", async () => {
      const { service, prisma } = makeService();
      prisma.share.update.mockResolvedValue(makeShare());

      await service.increaseViewCount(makeShare() as never);

      expect(prisma.share.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "s1" },
          data: { views: { increment: 1 } },
        }),
      );
    });

    it("usa updateMany com limite e registra log de sucesso", async () => {
      const { service, prisma, downloadLogService } = makeService();
      prisma.share.updateMany.mockResolvedValue({ count: 1 });

      await service.increaseViewCount(
        makeShare({ security: { maxViews: 5, views: 2 } }) as never,
        { ip: "1.2.3.4", userAgent: "UA" },
      );

      expect(prisma.share.updateMany).toHaveBeenCalled();
      expect(downloadLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, event: "view" }),
      );
    });

    it("lança Forbidden quando maxViews é atingido", async () => {
      const { service, prisma, downloadLogService } = makeService();
      prisma.share.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.increaseViewCount(
          makeShare({ security: { maxViews: 5 } }) as never,
          { ip: "1.2.3.4" },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(downloadLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          reason: "maxViewsExceeded",
        }),
      );
    });
  });

  describe("reloadShareViews", () => {
    it("recarrega views do banco", async () => {
      const { service, prisma } = makeService();
      const share = makeShare({ views: 0 });
      prisma.share.findUnique.mockResolvedValue({ views: 42 });

      await service.reloadShareViews(share as never);

      expect(share.views).toBe(42);
    });
  });

  describe("getShareToken", () => {
    it("lança NotFound quando o share não existe", async () => {
      const { service, prisma } = makeService();
      prisma.share.findFirst.mockResolvedValue(null);

      await expect(service.getShareToken("s1", "")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("exige password quando o share é protegido", async () => {
      const { service, prisma } = makeService();
      prisma.share.findFirst.mockResolvedValue(
        makeShare({ security: { password: "hash" } }),
      );

      await expect(
        service.getShareToken("s1", ""),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("lança Forbidden com senha incorreta", async () => {
      const { service, prisma } = makeService();
      verifyMock.mockResolvedValue(false);
      prisma.share.findFirst.mockResolvedValue(
        makeShare({ security: { password: "hash" } }),
      );

      await expect(
        service.getShareToken("s1", "wrong", { ip: "1.2.3.4" }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("lança Forbidden quando maxViews é atingido", async () => {
      const { service, prisma } = makeService();
      prisma.share.findFirst.mockResolvedValue(
        makeShare({ security: { maxViews: 5, password: null }, views: 5 }),
      );

      await expect(
        service.getShareToken("s1", ""),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("gera token com senha válida", async () => {
      const { service, prisma, tokenService } = makeService();
      tokenService.generateShareToken.mockResolvedValue("token");
      prisma.share.findFirst.mockResolvedValue(
        makeShare({ security: { password: "hash", maxViews: 5 }, views: 2 }),
      );

      const result = await service.getShareToken("s1", "correct");

      expect(result).toBe("token");
      expect(verifyMock).toHaveBeenCalledWith("hash", "correct");
    });
  });

  describe("verifyShareToken", () => {
    it("delega ao tokenService", async () => {
      const { service, tokenService } = makeService();
      tokenService.verifyShareToken.mockResolvedValue(true);

      const result = await service.verifyShareToken(makeShare() as never, "t");

      expect(result).toBe(true);
      expect(tokenService.verifyShareToken).toHaveBeenCalled();
    });
  });

  describe("isShareIdAvailable", () => {
    it("delega ao validationService", async () => {
      const { service, validationService } = makeService();
      validationService.validateShareIdAvailable.mockResolvedValue({
        isAvailable: true,
      });

      const result = await service.isShareIdAvailable("s1");

      expect(result).toEqual({ isAvailable: true });
    });
  });
});
