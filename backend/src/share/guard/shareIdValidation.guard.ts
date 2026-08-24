import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { I18nService } from "nestjs-i18n";

@Injectable()
export class IdValidation implements CanActivate {
  constructor(private readonly i18n: I18nService) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const candidates: unknown[] = [];
    try {
      candidates.push(
        request.params?.id,
        request.query?.id,
        request.body?.id,
        request.params?.shareId,
        request.params?.fileId,
      );
    } catch {
      throw new BadRequestException(this.i18n.t("file.invalidIdFormat"));
    }

    // Regular expression to check for Base64
    const isBase64 = (value: unknown) =>
      /^[a-zA-Z0-9-]*={0,2}$/.test(String(value));

    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null || candidate === "") {
        continue;
      }
      if (!isBase64(candidate)) {
        throw new BadRequestException(this.i18n.t("file.invalidIdFormat"));
      }
    }

    return true;
  }
}
