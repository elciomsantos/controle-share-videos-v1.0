import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { DownloadLogModule } from "../download-log/download-log.module";
import { EmailModule } from "../email/email.module";
import { ShareModule } from "../share/share.module";
import { FileController } from "./file.controller";
import { FileService } from "./file.service";
import { LocalFileService } from "./local.service";
import { DownloadLimitGuard } from "./guard/downloadLimit.guard";

@Module({
  imports: [
    JwtModule.register({}),
    EmailModule,
    ShareModule,
    DownloadLogModule,
  ],
  controllers: [FileController],
  providers: [FileService, LocalFileService, DownloadLimitGuard],
  exports: [FileService],
})
export class FileModule {}
