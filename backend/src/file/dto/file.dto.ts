import { Expose, plainToClass } from "class-transformer";
import { ShareDTO } from "../../share/dto/share.dto";

export class FileDTO {
  @Expose()
  id!: string;

  @Expose()
  name!: string;

  @Expose()
  size!: string;

  @Expose()
  description?: string | null;

  share!: ShareDTO;

  from(partial: Partial<FileDTO>) {
    return plainToClass(FileDTO, partial, { excludeExtraneousValues: true });
  }
}
