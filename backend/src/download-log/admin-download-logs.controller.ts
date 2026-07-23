import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../auth/guard/jwt.guard";
import { AdministratorGuard } from "../auth/guard/isAdmin.guard";
import { DownloadLogService } from "../download-log/download-log.service";

@Controller("admin/download-logs")
@UseGuards(JwtGuard, AdministratorGuard)
export class AdminDownloadLogsController {
  constructor(private downloadLogService: DownloadLogService) {}

  @Get()
  async findAll(
    @Query("shareId") shareId?: string,
    @Query("userId") userId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.downloadLogService.findAll({
      shareId,
      userId,
      from,
      to,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }
}
