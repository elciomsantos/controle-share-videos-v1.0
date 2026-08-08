import { Controller, Get } from "@nestjs/common";
import { AdminOrAuditor } from "../auth/decorator/guards.decorator";
import { SystemService } from "./system.service";
import { SystemInfoDTO } from "./dto/systemInfo.dto";

@Controller("system")
export class SystemController {
  constructor(private systemService: SystemService) {}

  @Get("info")
  @AdminOrAuditor()
  async getSystemInfo(): Promise<SystemInfoDTO | null> {
    return await this.systemService.getSystemInfo();
  }
}
