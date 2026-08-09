import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { HttpMetricsInterceptor } from "./http-metrics.interceptor";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";
import { SqliteIntegrityChecker } from "./sqlite-integrity.checker";

@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    MetricsService,
    SqliteIntegrityChecker,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
