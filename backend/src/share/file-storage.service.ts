import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { I18nService } from "nestjs-i18n";
import { SystemService } from "../system/system.service";
import {
  IUploadRepository,
  type IUploadRepository as IUploadRepositoryType,
} from "../storage/upload-repository.interface";

@Injectable()
export class FileStorageService {
  constructor(
    private systemService: SystemService,
    private readonly i18n: I18nService,
    @Inject(IUploadRepository)
    private readonly repository: IUploadRepositoryType,
  ) {}

  async ensureSpaceAvailable(size: number) {
    const systemInfo = await this.systemService.getSystemInfo();
    if (systemInfo && systemInfo.total - systemInfo.used < size) {
      throw new BadRequestException(this.i18n.t("share.notEnoughSpace"));
    }
  }

  createShareDirectory(shareId: string) {
    this.repository.createShareDirectory(shareId);
  }
}
