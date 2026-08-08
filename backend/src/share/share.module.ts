import { Module, forwardRef } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { DownloadLogModule } from "../download-log/download-log.module";
import { EmailModule } from "../email/email.module";
import { FileModule } from "../file/file.module";
import { SystemModule } from "../system/system.module";
import { ShareDomainModule } from "./domain/share-domain.module";
import { ShareController } from "./share.controller";
import { ShareService } from "./share.service";
import { ShareMapper } from "./share.mapper";
import { ShareArchiveService } from "./share-archive.service";
import { FileStorageService } from "./file-storage.service";

@Module({
  imports: [
    JwtModule.register({}),
    EmailModule,
    forwardRef(() => FileModule),
    forwardRef(() => DownloadLogModule),
    SystemModule,
    ShareDomainModule,
  ],
  controllers: [ShareController],
  providers: [ShareService, ShareMapper, ShareArchiveService, FileStorageService],
  exports: [ShareService],
})
export class ShareModule {}
