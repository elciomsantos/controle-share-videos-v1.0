import { Controller, Get, Header, Res } from "@nestjs/common";
import { Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../auth/decorator/public.decorator";
import { MetricsService } from "./metrics.service";

// SEC-1.2/22: endpoint de métricas público com limite próprio (coleta do
// Prometheus) sem expor o servidor a abuso.
@Controller("metrics")
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Public()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  async exposeMetrics(@Res() res: Response): Promise<void> {
    res.send(await this.metrics.metrics());
  }
}
