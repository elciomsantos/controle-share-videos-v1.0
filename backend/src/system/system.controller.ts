import { Controller, Get } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AdminOrAuditor } from "../auth/decorator/guards.decorator";
import { SystemService } from "./system.service";
import { SystemInfoDTO } from "./dto/systemInfo.dto";

// SEC-1.2/22.4: endpoints administrativos com limite mais restritivo que o global.
@Controller("system")
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class SystemController {
  constructor(private systemService: SystemService) {}

  @Get("info")
  @AdminOrAuditor()
  async getSystemInfo(): Promise<SystemInfoDTO | null> {
    return await this.systemService.getSystemInfo();
  }
}
