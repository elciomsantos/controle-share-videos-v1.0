import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { CertificateService } from "./certificate.service";

@Module({
  imports: [StorageModule],
  providers: [CertificateService],
  exports: [CertificateService],
})
export class CertificateModule {}
