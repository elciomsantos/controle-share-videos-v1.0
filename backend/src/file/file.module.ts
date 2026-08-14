import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { DownloadLogModule } from "../download-log/download-log.module";
import { EmailModule } from "../email/email.module";
import { ShareDomainModule } from "../share/domain/share-domain.module";
import { StorageModule } from "../storage/storage.module";
import { FileController } from "./file.controller";
import { FileService } from "./file.service";
import { LocalFileService } from "./local.service";
import { DownloadLimitGuard } from "./guard/downloadLimit.guard";

@Module({
  imports: [
    JwtModule.register({}),
    EmailModule,
    ShareDomainModule,
    DownloadLogModule,
    StorageModule,
  ],
  controllers: [FileController],
  providers: [FileService, LocalFileService, DownloadLimitGuard],
  exports: [FileService, LocalFileService],
})
export class FileModule {}
