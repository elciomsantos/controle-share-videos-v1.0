import { Module } from "@nestjs/common";
import { EmailModule } from "../email/email.module";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";
import { FileModule } from "../file/file.module";

@Module({
  imports: [EmailModule, FileModule],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
