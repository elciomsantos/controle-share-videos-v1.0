import { Expose, plainToClass } from "class-transformer";
import { ShareDTO } from "./share.dto";

export class CompletedShareDTO extends ShareDTO {
  @Expose()
  maxViews?: number;

  @Expose()
  maxDownloads?: number;

  from(partial: Partial<CompletedShareDTO>) {
    return plainToClass(CompletedShareDTO, partial, {
      excludeExtraneousValues: true,
    });
  }

  fromList(partial: Partial<CompletedShareDTO>[]) {
    return partial.map((part) =>
      plainToClass(CompletedShareDTO, part, { excludeExtraneousValues: true }),
    );
  }
}
