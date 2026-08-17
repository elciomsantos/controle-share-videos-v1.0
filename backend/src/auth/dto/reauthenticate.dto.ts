import { IsOptional, IsString } from "class-validator";

/** Reautenticação forte para operações críticas (senha + código TOTP se ativo). */
export class ReauthenticateDTO {
  @IsString()
  password!: string;

  @IsString()
  @IsOptional()
  code?: string;
}
