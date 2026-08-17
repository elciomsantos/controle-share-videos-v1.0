import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { JwtGuard } from "../auth/guard/jwt.guard";
import { Roles } from "../auth/decorator/roles.decorator";
import { RolesGuard } from "../auth/guard/roles.guard";
import { AuditService } from "./audit.service";

// SEC-1.2/22.4: endpoints administrativos com limite mais restritivo.
@Controller("admin/audit-logs")
@UseGuards(JwtGuard, RolesGuard)
@Roles("admin", "auditor")
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class AdminAuditLogsController {
  constructor(private auditService: AuditService) {}

  @Get()
  async findAll(
    @Query("eventType") eventType?: string,
    @Query("userId") userId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.auditService.findAll({
      eventType,
      userId,
      from,
      to,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }
}