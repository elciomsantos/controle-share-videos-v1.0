import { IsString } from "class-validator";

/**
 * Cadastro de TOTP pré-login para contas administrativas: exige o login token
 * emitido no primeiro passo (senha válida) + confirmação da senha.
 */
export class EnrollTotpDTO {
  @IsString()
  loginToken!: string;

  @IsString()
  password!: string;
}
