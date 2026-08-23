import { Module, Global } from "@nestjs/common";
import { ConfigModule } from "../../config/config.module";
import { DownloadLogModule } from "../../download-log/download-log.module";
import { ShareValidationService } from "./share-validation.service";
import { ShareTokenService } from "./share-token.service";
import { ShareLimitService } from "./share-limit.service";
import { StreamViewCounterService } from "./stream-view-counter.service";

@Global()
@Module({
  imports: [ConfigModule, DownloadLogModule],
  providers: [
    ShareValidationService,
    ShareTokenService,
    ShareLimitService,
    StreamViewCounterService,
  ],
  exports: [
    ShareValidationService,
    ShareTokenService,
    ShareLimitService,
    StreamViewCounterService,
  ],
})
export class ShareDomainModule {}
