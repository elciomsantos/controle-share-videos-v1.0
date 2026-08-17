import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { I18nService } from "nestjs-i18n";
import { Throttle } from "@nestjs/throttler";
import { JwtGuard } from "../auth/guard/jwt.guard";
import { Roles } from "../auth/decorator/roles.decorator";
import { RolesGuard } from "../auth/guard/roles.guard";
import { ReauthRequired } from "../auth/decorator/reauth.decorator";
import { AdminSessionsService } from "./admin-sessions.service";

class RevokeSessionsDto {
  userId!: string;
}

// SEC-1.2/22.4 + §34: endpoints administrativos com limite restritivo; a
// revogação é crítica (§34.3) — admin apenas + reautenticação recente (§15.4).
@Controller("admin/sessions")
@UseGuards(JwtGuard, RolesGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class AdminSessionsController {
  constructor(
    private adminSessionsService: AdminSessionsService,
    private readonly i18n: I18nService,
  ) {}

  @Get()
  @Roles("admin", "auditor")
  async findAll(
    @Query("userId") userId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.adminSessionsService.findAll({
      userId,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Post(":id/revoke")
  @Roles("admin")
  @ReauthRequired()
  async revoke(@Param("id") id: string) {
    return this.adminSessionsService.revoke(id);
  }

  @Post("revoke-all")
  @Roles("admin")
  @ReauthRequired()
  async revokeAll(@Body() body: RevokeSessionsDto) {
    if (!body.userId)
      throw new NotFoundException(this.i18n.t("session.userNotFound"));
    return this.adminSessionsService.revokeAllByUser(body.userId);
  }
}