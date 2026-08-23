import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { JwtGuard } from "../auth/guard/jwt.guard";
import { Roles } from "../auth/decorator/roles.decorator";
import { RolesGuard } from "../auth/guard/roles.guard";
import {
  DownloadLogEvent,
  DownloadLogService,
} from "../download-log/download-log.service";

// SEC-1.2/22.4: endpoints administrativos com limite mais restritivo que o global.
@Controller("admin/download-logs")
@UseGuards(JwtGuard, RolesGuard)
@Roles("admin", "auditor")
@Throttle({ default: { limit: 30, ttl: 60_000 } })
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
    // VULN-17: clamp de paginação — NaN/valores negativos caem no default e o
    // limite é tetoado para não permitir consultas de tamanho arbitrário.
    return this.downloadLogService.findAll({
      shareId,
      userId,
      from,
      to,
      event,
      success: successBoolean,
      page: Math.max(parseInt(page ?? "") || 1, 1),
      limit: Math.min(Math.max(parseInt(limit ?? "") || 50, 1), 500),
    });
  }
}
