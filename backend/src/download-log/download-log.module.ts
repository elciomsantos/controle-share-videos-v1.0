import { Module } from "@nestjs/common";
import { AdminDownloadLogsController } from "./admin-download-logs.controller";
import { DownloadLogService } from "./download-log.service";

@Module({
  controllers: [AdminDownloadLogsController],
  providers: [DownloadLogService],
  exports: [DownloadLogService],
})
export class DownloadLogModule {}
