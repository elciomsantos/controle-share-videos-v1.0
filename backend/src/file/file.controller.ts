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
import { SkipThrottle } from "@nestjs/throttler";
import contentDisposition from "content-disposition";
import { Request, Response } from "express";
import { DownloadLogService } from "../download-log/download-log.service";
import { User } from "../../prisma/generated/prisma/client";
import { JwtGuard } from "../auth/guard/jwt.guard";
import { StrictShareOwnerGuard } from "../share/guard/strictShareOwner.guard";
import { IdValidation } from "../share/guard/shareIdValidation.guard";
import { FileService } from "./file.service";
import { DownloadLimitGuard } from "./guard/downloadLimit.guard";
import { FileSecurityGuard } from "./guard/fileSecurity.guard";
import mime from "mime-types";

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
  @SkipThrottle()
  @UseGuards(IdValidation, JwtGuard, StrictShareOwnerGuard)
  async create(
    @Query()
    query: {
      id: string;
      name: string;
      chunkIndex: string;
      totalChunks: string;
    },
    @Body() body: string,
    @Param("shareId") shareId: string,
  ) {
    const { id, name, chunkIndex, totalChunks } = query;

    // Data can be empty if the file is empty
    return await this.fileService.create(
      body,
      { index: parseInt(chunkIndex), total: parseInt(totalChunks) },
      { id, name },
      shareId,
    );
  }

  @Get("zip")
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
      userId: user?.id,
      username: user?.username,
      ip: req.ip || req.socket.remoteAddress || "unknown",
      success: true,
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

    const headers = {
      "Content-Type":
        mime?.lookup?.(file.metaData.name) || "application/octet-stream",
      "Content-Length": file.metaData.size,
      "Content-Security-Policy": "sandbox",
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
        userId: user?.id,
        username: user?.username,
        ip: req.ip || req.socket.remoteAddress || "unknown",
        success: true,
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
  @SkipThrottle()
  @UseGuards(StrictShareOwnerGuard)
  async remove(
    @Param("fileId") fileId: string,
    @Param("shareId") shareId: string,
  ) {
    await this.fileService.remove(shareId, fileId);
  }
}
