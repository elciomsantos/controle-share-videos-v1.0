import { Expose, plainToClass, Type } from "class-transformer";
import { ShareDTO, FileDTO } from "@/shared/dto";
import { OmitType } from "@nestjs/swagger";
import { MyShareSecurityDTO } from "./myShareSecurity.dto";

export class MyShareDTO extends OmitType(ShareDTO, [
  "files",
  "from",
  "fromList",
] as const) {
  @Expose()
  views!: number;

  @Expose()
  createdAt!: Date;

  @Expose()
  recipients!: string[];

  @Expose()
  @Type(() => OmitType(FileDTO, ["shareId", "from"] as const))
  files!: Omit<FileDTO, "shareId" | "from">[];

  @Expose()
  security?: MyShareSecurityDTO;

  from(partial: Partial<MyShareDTO>) {
    return plainToClass(MyShareDTO, partial, { excludeExtraneousValues: true });
  }

  fromList(partial: Partial<MyShareDTO>[]) {
    return partial.map((part) =>
      plainToClass(MyShareDTO, part, { excludeExtraneousValues: true }),
    );
  }
}