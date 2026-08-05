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
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import contentDisposition from "content-disposition";
import { Request, Response } from "express";
import { DownloadLogService } from "../download-log/download-log.service";
import { User } from "../../prisma/generated/prisma/client";
import { JwtGuard } from "../auth/guard/jwt.guard";
import { Public } from "../auth/decorator/public.decorator";
import { StrictShareOwnerGuard } from "../share/guard/strictShareOwner.guard";
import { IdValidation } from "../share/guard/shareIdValidation.guard";
import { FileService } from "./file.service";
import { DownloadLimitGuard } from "./guard/downloadLimit.guard";
import { FileSecurityGuard } from "./guard/fileSecurity.guard";
import mime from "mime-types";
import { getRequestIp, getRequestUserAgent } from "../utils/request.util";
import { GetUser } from "../auth/decorator/getUser.decorator";

const VALID_ID_REGEX = /^[a-zA-Z0-9-]*={0,2}$/;

interface AuthenticatedRequest extends Request {
  user?: User;
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
  ) {}

  @Post()
  // GAP-03: chunked uploads must be throttled — vector for DoS/abuse.
  // 30 req/min per IP (chunked uploads case several requests per file).
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseGuards(IdValidation, JwtGuard, StrictShareOwnerGuard)
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
      { index: parseInt(chunkIndex), total: parseInt(totalChunks) },
      { id, name, description },
      shareId,
    );

    // GAP: record the upload as soon as the final chunk lands (the DB row is
    // created on the last chunk) so the audit log shows who uploaded what.
    if (parseInt(chunkIndex) === parseInt(totalChunks) - 1) {
      let fileSize: string | null = null;
      try {
        const meta = await this.fileService.getFileMetaData(shareId, id);
        fileSize = meta?.size != null ? meta.size.toString() : null;
      } catch {
        // File metadata may be momentarily unavailable; still log the event.
        fileSize = null;
      }
      void this.downloadLogService.record({
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
      });
    }

    return result;
  }

  @Get("zip")
  @Public()
  @UseGuards(FileSecurityGuard)
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
    void this.downloadLogService.record({
      shareId,
      fileName: `${shareId}.zip`,
      fileSize: null,
      userId: user?.id,
      username: user?.username,
      ip: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      success: true,
      event: "download",
    });
    void this.downloadLimitGuard.incrementDownloadCount(shareId);
    void this.fileService.notifyRecipientDownload(
      shareId,
      `${shareId}.zip`,
      getValidRecipientId(recipientId),
    );

    return new StreamableFile(zipStream);
  }

  @Get(":fileId")
  @Public()
  @UseGuards(FileSecurityGuard)
  async getFile(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("shareId") shareId: string,
    @Param("fileId") fileId: string,
    @Query("download") download = "true",
    @Query("recipient") recipientId?: string,
  ) {
    const isDownload = download === "true";

    if (isDownload) {
      await this.downloadLimitGuard.canActivate({
        switchToHttp: () => ({
          getRequest: () => req,
        }),
      } as unknown as ExecutionContext);
    }

    const file = await this.fileService.get(shareId, fileId);

    // When the uploaded file lived in a folder (name carries a "dir/name"
    // path), serve the download wrapped in a zip that preserves that folder
    // structure. Browsers strip directory info from Content-Disposition, so
    // only a zip keeps the original layout.
    const hasFolderPath = file.metaData.name.includes("/");
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
      void this.downloadLogService.record({
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
      });
      void this.downloadLimitGuard.incrementDownloadCount(shareId);
      void this.fileService.notifyRecipientDownload(
        shareId,
        file.metaData.name,
        getValidRecipientId(recipientId),
      );

      return new StreamableFile(zipStream);
    }

    const headers = {
      "Content-Type":
        mime?.lookup?.(file.metaData.name) || "application/octet-stream",
      "Content-Length": file.metaData.size,
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
      void this.downloadLogService.record({
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
      });
      void this.downloadLimitGuard.incrementDownloadCount(shareId);
      void this.fileService.notifyRecipientDownload(
        shareId,
        file.metaData.name,
        getValidRecipientId(recipientId),
      );
    }

    return new StreamableFile(file.file);
  }

  @Delete(":fileId")
  // GAP-03: file deletion must also be throttled to prevent abusive cleanup loops.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseGuards(StrictShareOwnerGuard)
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

    void this.downloadLogService.record({
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
    });
  }
}
