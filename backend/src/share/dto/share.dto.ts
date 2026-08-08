import { Expose, plainToClass, Type } from "class-transformer";
import { FileDTO } from "../../file/dto/file.dto";
import { PublicUserDTO } from "../../user/dto/publicUser.dto";

export function toBytes(
  value: string | number | bigint | null | undefined,
): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "bigint") return Number(value);
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export class ShareDTO {
  @Expose()
  id!: string;

  @Expose()
  name?: string | null;

  @Expose()
  expiration!: Date;

  @Expose()
  @Type(() => FileDTO)
  files!: FileDTO[];

  @Expose()
  @Type(() => PublicUserDTO)
  creator!: PublicUserDTO;

  @Expose()
  description!: string;

  @Expose()
  hasPassword!: boolean;

  @Expose()
  size!: number;

  @Expose()
  generatedPassword?: string;

  from(partial: Partial<ShareDTO>) {
    return plainToClass(ShareDTO, partial, { excludeExtraneousValues: true });
  }

  fromList(partial: Partial<ShareDTO>[]) {
    return partial.map((part) =>
      plainToClass(ShareDTO, part, { excludeExtraneousValues: true }),
    );
  }
}
