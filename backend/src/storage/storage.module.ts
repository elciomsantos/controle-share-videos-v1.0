import { Module } from "@nestjs/common";
import { FilesystemUploadRepository } from "./filesystem-upload.repository";
import { IUploadRepository } from "./upload-repository.interface";

/**
 * R02 — Camada de storage. Fornece IUploadRepository -> FilesystemUploadRepository.
 * Trocar para S3 no futuro = criar S3UploadRepository e mudar a implementação
 * deste provider — nenhuma regra de negócio é afetada.
 */
@Module({
  providers: [
    {
      provide: IUploadRepository,
      useClass: FilesystemUploadRepository,
    },
  ],
  exports: [IUploadRepository],
})
export class StorageModule {}
