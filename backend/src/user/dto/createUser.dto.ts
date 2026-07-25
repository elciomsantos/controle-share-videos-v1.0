import { plainToClass } from "class-transformer";
import { Allow, IsIn, IsOptional, MinLength } from "class-validator";
import { UserDTO } from "./user.dto";

export class CreateUserDTO extends UserDTO {
  @Allow()
  isAdmin!: boolean;

  @Allow()
  @IsOptional()
  isActivated!: boolean;

  @MinLength(8)
  @IsOptional()
  password!: string;

  @IsIn(["admin", "operador", "auditor"])
  @IsOptional()
  role!: string;

  @Allow()
  @IsOptional()
  generatePassword!: boolean;

  from(partial: Partial<CreateUserDTO>) {
    return plainToClass(CreateUserDTO, partial, {
      excludeExtraneousValues: true,
    });
  }
}
