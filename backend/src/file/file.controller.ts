import {
  Body,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import contentDisposition from "content-disposition";
import { Request, Response } from "express";
import { DownloadLogService } from "../download-log/download-log.service";
import { User } from "../../prisma/generated/prisma/client";
import { Public } from "../auth/decorator/guards.decorator";
import {
  StrictShareOwnerAccess,
  SharePublicAccess,
} from "../share/decorator/share-guards.decorator";
import { FileService } from "./file.service";
import { DownloadLimitGuard } from "./guard/downloadLimit.guard";
import mime from "mime-types";
import range from "range-parser";
import { HttpStatus } from "@nestjs/common";
import { getRequestIp, getRequestUserAgent } from "../utils/request.util";
import { GetUser } from "../auth/decorator/getUser.decorator";
import { PrismaService } from "../prisma/prisma.service";

const VALID_ID_REGEX = /^[a-zA-Z0-9-]*={0,2}$/;

interface AuthenticatedRequest extends Request {
  user?: User;
}

/**
 * AUD-ENRICH: contexto de auditoria extraído do request + banco para enriquecer
 * os download logs (shareName, creatorUsername, authMethod, referer, mimeType,
 * fileHash e recipientEmail).
 */
interface AuditContext {
  shareName?: string | null;
  creatorUsername?: string | null;
  mimeType?: string | null;
  authMethod?: string | null;
  referer?: string | null;
  fileHash?: string | null;
  recipientEmail?: string | null;
}

async function buildAuditContext(
  prisma: PrismaService,
  shareId: string,
  req: Request,
  fileMime?: string | null,
  opts?: { fileId?: string; recipientId?: string },
): Promise<AuditContext> {
  const [share, file, recipient] = await Promise.all([
    prisma.share.findUnique({
      where: { id: shareId },
      select: { name: true, creator: { select: { username: true } } },
    }),
    opts?.fileId
      ? prisma.file.findUnique({
          where: { id: opts.fileId },
          select: { sha256: true },
        })
      : Promise.resolve(null),
    opts?.recipientId
      ? prisma.shareRecipient.findUnique({
          where: { id: opts.recipientId },
          select: { email: true },
        })
      : Promise.resolve(null),
  ]);

  const shareToken = req.cookies?.[`share_${shareId}_token`] as
    string | undefined;
  const hasSession = Boolean((req as AuthenticatedRequest).user);

  return {
    shareName: share?.name ?? null,
    creatorUsername: share?.creator?.username ?? null,
    mimeType: fileMime ?? null,
    authMethod: hasSession
      ? "session"
      : shareToken
        ? "shareToken"
        : "anonymous",
    referer: req.headers.referer ?? null,
    fileHash: file?.sha256 ?? null,
    recipientEmail: recipient?.email ?? null,
  };
}

/**
 * AUD-ENRICH: registra um download log enriquecido, medindo a duração do
 * request e anotando bytes transferidos, contexto de auth e HTTP status.
 */
function makeAuditEntry(
  base: {
    shareId: string;
    fileId?: string;
    fileName: string;
    fileSize?: string | null;
    fileHash?: string | null;
    userId?: string;
    username?: string;
    ip: string;
    userAgent?: string | null;
    success: boolean;
    reason?: string;
    event?: "download" | "view" | "upload" | "delete";
  },
  context: AuditContext,
  startedAt: number,
  opts?: {
    recipientId?: string;
    recipientEmail?: string;
    transferBytes?: string | number;
    httpStatus?: number;
  },
): Parameters<DownloadLogService["record"]>[0] {
  return {
    ...base,
    ...context,
    recipientId: opts?.recipientId ?? null,
    recipientEmail: opts?.recipientEmail ?? null,
    transferBytes:
      opts?.transferBytes != null ? String(opts.transferBytes) : null,
    httpStatus: opts?.httpStatus ?? null,
    durationMs: Math.max(0, Date.now() - startedAt),
  };
}

function getValidRecipientId(recipientId?: string): string | undefined {
  if (!recipientId) return undefined;
  return VALID_ID_REGEX.test(recipientId) ? recipientId : undefined;
}

@Controller("shares/:shareId/files")
export class FileController {
  constructor(
    private fileService: FileService,
    private downloadLimitGuard: DownloadLimitGuard,
    private downloadLogService: DownloadLogService,
    private prisma: PrismaService,
  ) {}

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @StrictShareOwnerAccess()
  async create(
    @Query()
    query: {
      id: string;
      name: string;
      chunkIndex: string;
      totalChunks: string;
      description?: string;
    },
    @Body() body: string,
    @Param("shareId") shareId: string,
    @Req() req: Request,
    @GetUser() user: User,
  ) {
    const { id, name, chunkIndex, totalChunks, description } = query;

    const result = await this.fileService.create(
      body,
      { index: parseInt(chunkIndex, 10), total: parseInt(totalChunks, 10) },
      { id, name, description },
      shareId,
    );

    if (parseInt(chunkIndex, 10) === parseInt(totalChunks, 10) - 1) {
      const startedAt = Date.now();
      let fileSize: string | null = null;
      let mimeType: string | null = null;
      try {
        const meta = await this.fileService.getFileMetaData(shareId, id);
        fileSize = meta?.size != null ? meta.size.toString() : null;
        mimeType = mime.lookup(name) || null;
      } catch {
        fileSize = null;
      }
      const context = await buildAuditContext(
        this.prisma,
        shareId,
        req,
        mimeType,
        {
          fileId: id,
        },
      );
      void this.downloadLogService.record(
        makeAuditEntry(
          {
            shareId,
            fileId: id,
            fileName: name,
            fileSize,
            userId: user?.id,
            username: user?.username,
            ip: getRequestIp(req),
            userAgent: getRequestUserAgent(req),
            success: true,
            event: "upload",
          },
          context,
          startedAt,
        ),
      );
    }

    return result;
  }

  @Get("zip")
  @Public()
  @SharePublicAccess()
  async getZip(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("shareId") shareId: string,
    @Query("recipient") recipientId?: string,
  ) {
    await this.downloadLimitGuard.canActivate({
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext);

    const zipStream = await this.fileService.getZip(shareId);

    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition(`${shareId}.zip`),
    });

    const user = (req as AuthenticatedRequest).user;
    const startedAt = Date.now();
    const context = await buildAuditContext(
      this.prisma,
      shareId,
      req,
      "application/zip",
      { recipientId: getValidRecipientId(recipientId) },
    );
    void this.downloadLogService.record(
      makeAuditEntry(
        {
          shareId,
          fileName: `${shareId}.zip`,
          fileSize: null,
          userId: user?.id,
          username: user?.username,
          ip: getRequestIp(req),
          userAgent: getRequestUserAgent(req),
          success: true,
          event: "download",
        },
        context,
        startedAt,
        { httpStatus: HttpStatus.OK },
      ),
    );
    void this.fileService.notifyRecipientDownload(
      shareId,
      `${shareId}.zip`,
      getValidRecipientId(recipientId),
    );

    return new StreamableFile(zipStream);
  }

  @Get(":fileId/certificate")
  @Public()
  @SharePublicAccess()
  async getCertificate(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("shareId") shareId: string,
    @Param("fileId") fileId: string,
  ) {
    const { metaData, file } = await this.fileService.getCertificate(
      shareId,
      fileId,
    );

    res.set({
      "Content-Type": "application/pdf",
      "Content-Length": metaData.size,
      "Content-Security-Policy": "sandbox allow-scripts allow-same-origin",
      "Cache-Control": "no-store",
      "Content-Disposition": contentDisposition(metaData.name, { type: "inline" }),
    });

    return new StreamableFile(file);
  }

  @Get(":fileId")
  @Public()
  @SharePublicAccess()
  async getFile(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("shareId") shareId: string,
    @Param("fileId") fileId: string,
    @Query("download") download = "true",
    @Query("recipient") recipientId?: string,
  ) {
    const isDownload = download === "true";

    const fileMetaData = await this.fileService.getFileMetaData(
      shareId,
      fileId,
    );
    const isCertificate = fileMetaData.name.endsWith(".certificado.pdf");
    const isSignedVideo = /\.assinado\.\w+$/.test(fileMetaData.name);

    if (isDownload && !isCertificate) {
      await this.downloadLimitGuard.canActivate({
        switchToHttp: () => ({
          getRequest: () => req,
        }),
      } as unknown as ExecutionContext);
    }

    const file = await this.fileService.get(shareId, fileId);

    const hasFolderPath = file.metaData.name.includes("/");

    // Vídeos originais: baixa junto o certificado PDF (autenticidade).
    const isOriginalVideo = !isCertificate && !isSignedVideo && !hasFolderPath;
    const hasCert = await this.fileService.hasCertificate(shareId, fileId);
    if (isDownload && isOriginalVideo && hasCert) {
      const zipStream = await this.fileService.getVideoWithCertificateZip(
        shareId,
        fileId,
      );
      res.set({
        "Content-Type": "application/zip",
        "Content-Security-Policy": "sandbox",
        "Cache-Control": "no-store",
        "Content-Disposition": contentDisposition(`${fileMetaData.name}.zip`),
      });

      const user = (req as AuthenticatedRequest).user;
      const startedAt = Date.now();
      const context = await buildAuditContext(
        this.prisma,
        shareId,
        req,
        "application/zip",
        { fileId, recipientId: getValidRecipientId(recipientId) },
      );
      void this.downloadLogService.record(
        makeAuditEntry(
          {
            shareId,
            fileId,
            fileName: file.metaData.name,
            fileSize: file.metaData.size,
            userId: user?.id,
            username: user?.username,
            ip: getRequestIp(req),
            userAgent: getRequestUserAgent(req),
            success: true,
            event: "download",
          },
          context,
          startedAt,
          { httpStatus: HttpStatus.OK },
        ),
      );
      void this.fileService.notifyRecipientDownload(
        shareId,
        file.metaData.name,
        getValidRecipientId(recipientId),
      );

      return new StreamableFile(zipStream);
    }

    if (isDownload && hasFolderPath) {
      const zipStream = await this.fileService.getFileZip(shareId, fileId);
      const zipBaseName =
        file.metaData.name.split("/").pop() || file.metaData.name;
      res.set({
        "Content-Type": "application/zip",
        "Content-Security-Policy": "sandbox",
        "Cache-Control": "no-store",
        "Content-Disposition": contentDisposition(`${zipBaseName}.zip`),
      });

      const user = (req as AuthenticatedRequest).user;
      const startedAt = Date.now();
      const context = await buildAuditContext(
        this.prisma,
        shareId,
        req,
        "application/zip",
        { fileId, recipientId: getValidRecipientId(recipientId) },
      );
      void this.downloadLogService.record(
        makeAuditEntry(
          {
            shareId,
            fileId,
            fileName: file.metaData.name,
            fileSize: file.metaData.size,
            userId: user?.id,
            username: user?.username,
            ip: getRequestIp(req),
            userAgent: getRequestUserAgent(req),
            success: true,
            event: "download",
          },
          context,
          startedAt,
          { httpStatus: HttpStatus.OK },
        ),
      );
      void this.fileService.notifyRecipientDownload(
        shareId,
        file.metaData.name,
        getValidRecipientId(recipientId),
      );

      return new StreamableFile(zipStream);
    }

    const rangeHeader = isDownload
      ? undefined
      : (req.headers.range as string | undefined);

    if (rangeHeader) {
      const meta = await this.fileService.getFileMetaData(shareId, fileId);
      const fullSize = Number(meta.size);

      const ranges = range(fullSize, rangeHeader, { combine: true });
      if (ranges === -1) {
        res.set({ "Content-Range": `bytes */${fullSize}` });
        return res.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE).end();
      }
      if (ranges !== -2 && ranges.length > 0) {
        const { start, end } = ranges[0];
        const rangedFile = await this.fileService.get(shareId, fileId, {
          start,
          end,
        });
        res.status(HttpStatus.PARTIAL_CONTENT);
        res.set({
          "Content-Type":
            mime?.lookup?.(meta.name) || "application/octet-stream",
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${fullSize}`,
          "Accept-Ranges": "bytes",
          "Content-Security-Policy": "sandbox",
          "Cache-Control": "no-store",
          "Content-Disposition": contentDisposition(meta.name, {
            type: "inline",
          }),
        });
        return new StreamableFile(rangedFile.file);
      }
    }

    const headers = {
      "Content-Type":
        mime?.lookup?.(file.metaData.name) || "application/octet-stream",
      "Content-Length": file.metaData.size,
      "Accept-Ranges": "bytes",
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "no-store",
      "Content-Disposition": contentDisposition(
        file.metaData.name,
        isDownload ? undefined : { type: "inline" },
      ),
    };

    res.set(headers);

    if (isDownload) {
      const user = (req as AuthenticatedRequest).user;
      const startedAt = Date.now();
      const fileMime = mime.lookup(file.metaData.name) || null;
      const context = await buildAuditContext(
        this.prisma,
        shareId,
        req,
        fileMime,
        { fileId, recipientId: getValidRecipientId(recipientId) },
      );
      void this.downloadLogService.record(
        makeAuditEntry(
          {
            shareId,
            fileId,
            fileName: file.metaData.name,
            fileSize: file.metaData.size,
            userId: user?.id,
            username: user?.username,
            ip: getRequestIp(req),
            userAgent: getRequestUserAgent(req),
            success: true,
            event: "download",
          },
          context,
          startedAt,
          { httpStatus: HttpStatus.OK },
        ),
      );
      void this.fileService.notifyRecipientDownload(
        shareId,
        file.metaData.name,
        getValidRecipientId(recipientId),
      );
    }

    return new StreamableFile(file.file);
  }

  @Delete(":fileId")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @StrictShareOwnerAccess()
  async remove(
    @Param("fileId") fileId: string,
    @Param("shareId") shareId: string,
    @Req() req: Request,
    @GetUser() user: User,
  ) {
    let fileName: string | null = null;
    let fileSize: string | null = null;
    try {
      const meta = await this.fileService.getFileMetaData(shareId, fileId);
      fileName = meta?.name ?? null;
      fileSize = meta?.size != null ? meta.size.toString() : null;
    } catch {
      fileName = null;
      fileSize = null;
    }

    await this.fileService.remove(shareId, fileId);

    const startedAt = Date.now();
    const context = await buildAuditContext(this.prisma, shareId, req, null, {
      fileId,
    });
    void this.downloadLogService.record(
      makeAuditEntry(
        {
          shareId,
          fileId,
          fileName: fileName ?? fileId,
          fileSize,
          userId: user?.id,
          username: user?.username,
          ip: getRequestIp(req),
          userAgent: getRequestUserAgent(req),
          success: true,
          event: "delete",
        },
        context,
        startedAt,
        { httpStatus: HttpStatus.OK },
      ),
    );
  }
}
