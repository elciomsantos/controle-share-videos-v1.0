import { OmitType } from "@nestjs/swagger";
import { Expose, plainToClass, Type } from "class-transformer";
import { ShareDTO, FileDTO } from "@/shared/dto";
import { MyShareSecurityDTO } from "./myShareSecurity.dto";

export class AdminShareDTO extends OmitType(ShareDTO, [
  "files",
  "from",
  "fromList",
] as const) {
  @Expose()
  views!: number;

  @Expose()
  createdAt!: Date;

  @Expose()
  security?: MyShareSecurityDTO;

  @Expose()
  recipients!: string[];

  // Necessário para o botão de pré-visualização em /admin/shares.
  @Expose()
  @Type(() => OmitType(FileDTO, ["shareId", "from"] as const))
  files!: Omit<FileDTO, "shareId" | "from">[];

  from(partial: Partial<AdminShareDTO>) {
    return plainToClass(AdminShareDTO, partial, {
      excludeExtraneousValues: true,
    });
  }

  fromList(partial: Partial<AdminShareDTO>[]) {
    return partial.map((part) =>
      plainToClass(AdminShareDTO, part, { excludeExtraneousValues: true }),
    );
  }
}
