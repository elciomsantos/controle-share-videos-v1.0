import { HttpException, HttpStatus } from "@nestjs/common";

export class DuplicatedFieldException extends HttpException {
  constructor(
    message: string,
    readonly field: "username" | "email",
  ) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        message,
        error: "duplicated_field",
        field,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
