import { Module } from "@nestjs/common";
import { FileModule } from "../file/file.module";
import { ReverseShareModule } from "../reverseShare/reverseShare.module";
import { JobsService } from "./jobs.service";
import { ConfigModule } from "../config/config.module";

@Module({
  imports: [FileModule, ReverseShareModule, ConfigModule],
  providers: [JobsService],
})
export class JobsModule {}
