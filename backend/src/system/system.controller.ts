import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../auth/guard/jwt.guard";
import { Roles } from "../auth/decorator/roles.decorator";
import { RolesGuard } from "../auth/guard/roles.guard";
import { SystemService } from "./system.service";
import { SystemInfoDTO } from "./dto/systemInfo.dto";

@Controller("system")
@UseGuards(JwtGuard, RolesGuard)
export class SystemController {
  constructor(private systemService: SystemService) {}

  @Get("info")
  @Roles("admin", "auditor")
  async getSystemInfo(): Promise<SystemInfoDTO | null> {
    return await this.systemService.getSystemInfo();
  }
}
