import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../auth/guard/jwt.guard";
import { Roles } from "../auth/decorator/roles.decorator";
import { RolesGuard } from "../auth/guard/roles.guard";
import {
  DownloadLogEvent,
  DownloadLogService,
} from "../download-log/download-log.service";

@Controller("admin/download-logs")
@UseGuards(JwtGuard, RolesGuard)
@Roles("admin", "auditor")
export class AdminDownloadLogsController {
  constructor(private downloadLogService: DownloadLogService) {}

  @Get()
  async findAll(
    @Query("shareId") shareId?: string,
    @Query("userId") userId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("event") event?: DownloadLogEvent,
    @Query("success") success?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    const successBoolean =
      success === undefined
        ? undefined
        : success === "true"
          ? true
          : success === "false"
            ? false
            : undefined;
    return this.downloadLogService.findAll({
      shareId,
      userId,
      from,
      to,
      event,
      success: successBoolean,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }
}
