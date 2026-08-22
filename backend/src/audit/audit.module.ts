import { Global, Module } from "@nestjs/common";
import { AdminAuditLogsController } from "./admin-audit-logs.controller";
import { AdminSessionsController } from "./admin-sessions.controller";
import { AdminSessionsService } from "./admin-sessions.service";
import { AuditService } from "./audit.service";
import { AuditWormService } from "./audit-worm.service";

@Global()
@Module({
  controllers: [AdminAuditLogsController, AdminSessionsController],
  providers: [AuditService, AuditWormService, AdminSessionsService],
  exports: [AuditService, AuditWormService],
})
export class AuditModule {}
