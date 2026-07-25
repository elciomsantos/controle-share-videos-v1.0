import { Module, forwardRef } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ClamScanModule } from "../clamscan/clamscan.module";
import { EmailModule } from "../email/email.module";
import { FileModule } from "../file/file.module";
import { SystemModule } from "../system/system.module";
import { ShareController } from "./share.controller";
import { ShareService } from "./share.service";

@Module({
  imports: [
    JwtModule.register({}),
    EmailModule,
    forwardRef(() => ClamScanModule),
    forwardRef(() => FileModule),
    SystemModule,
  ],
  controllers: [ShareController],
  providers: [ShareService],
  exports: [ShareService],
})
export class ShareModule {}
