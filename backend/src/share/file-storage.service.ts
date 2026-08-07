import { BadRequestException, Injectable } from "@nestjs/common";
import { I18nService } from "nestjs-i18n";
import { SystemService } from "../system/system.service";
import { SHARE_DIRECTORY } from "../constants";
import * as fs from "fs";

@Injectable()
export class FileStorageService {
  constructor(
    private systemService: SystemService,
    private readonly i18n: I18nService,
  ) {}

  async ensureSpaceAvailable(size: number) {
    const systemInfo = await this.systemService.getSystemInfo();
    if (systemInfo && systemInfo.total - systemInfo.used < size) {
      throw new BadRequestException(this.i18n.t("share.notEnoughSpace"));
    }
  }

  createShareDirectory(shareId: string) {
    fs.mkdirSync(`${SHARE_DIRECTORY}/${shareId}`, {
      recursive: true,
    });
  }
}
