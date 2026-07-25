import { Module } from "@nestjs/common";
import { FileModule } from "../file/file.module";
import { JobsService } from "./jobs.service";
import { ConfigModule } from "../config/config.module";

@Module({
  imports: [FileModule, ConfigModule],
  providers: [JobsService],
})
export class JobsModule {}
