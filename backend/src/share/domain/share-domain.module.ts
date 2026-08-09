import { Module, Global } from "@nestjs/common";
import { ConfigModule } from "../../config/config.module";
import { ShareValidationService } from "./share-validation.service";
import { ShareTokenService } from "./share-token.service";
import { ShareLimitService } from "./share-limit.service";

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    ShareValidationService,
    ShareTokenService,
    ShareLimitService,
  ],
  exports: [
    ShareValidationService,
    ShareTokenService,
    ShareLimitService,
  ],
})
export class ShareDomainModule {}
