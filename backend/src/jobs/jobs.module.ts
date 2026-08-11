import { Module } from "@nestjs/common";
import { FileModule } from "../file/file.module";
import { JobsService } from "./jobs.service";
import { ConfigModule } from "../config/config.module";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [FileModule, ConfigModule, StorageModule],
  providers: [JobsService],
})
export class JobsModule {}
