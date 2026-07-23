import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module";
import { SystemController } from "./system.controller";
import { SystemService } from "./system.service";

@Module({
  imports: [ConfigModule],
  controllers: [SystemController],
  providers: [SystemService],
  exports: [SystemService],
})
export class SystemModule {}
