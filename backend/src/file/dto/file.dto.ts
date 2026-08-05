import { Expose, plainToClass, Transform } from "class-transformer";
import { ShareDTO } from "../../share/dto/share.dto";

export class FileDTO {
  @Expose()
  id!: string;

  @Expose()
  name!: string;

  @Expose()
  @Transform(({ value }) => (value === null || value === undefined ? "0" : value.toString()))
  size!: string;

  @Expose()
  description?: string | null;

  share!: ShareDTO;

  from(partial: Partial<FileDTO>) {
    return plainToClass(FileDTO, partial, { excludeExtraneousValues: true });
  }
}
