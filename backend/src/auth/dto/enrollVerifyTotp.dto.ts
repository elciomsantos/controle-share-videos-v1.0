import { IsString } from "class-validator";

/** Conclui o cadastro de TOTP validando o código contra o segredo gerado. */
export class EnrollVerifyTotpDTO {
  @IsString()
  loginToken!: string;

  @IsString()
  code!: string;
}
