import { Global, Module } from "@nestjs/common";
import { AdminAuditLogsController } from "./admin-audit-logs.controller";
import { AdminSessionsController } from "./admin-sessions.controller";
import { AdminSessionsService } from "./admin-sessions.service";
import { AuditService } from "./audit.service";

@Global()
@Module({
  controllers: [AdminAuditLogsController, AdminSessionsController],
  providers: [AuditService, AdminSessionsService],
  exports: [AuditService],
})
export class AuditModule {}