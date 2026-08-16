import { IsEmail } from "class-validator";

export class RequestResetPasswordDTO {
  @IsEmail()
  email!: string;
}