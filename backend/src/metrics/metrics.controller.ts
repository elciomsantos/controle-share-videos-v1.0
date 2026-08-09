import { Controller, Get, Header, Res } from "@nestjs/common";
import { Response } from "express";
import { Public } from "../auth/decorator/public.decorator";
import { MetricsService } from "./metrics.service";

@Controller("metrics")
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Public()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  async exposeMetrics(@Res() res: Response): Promise<void> {
    res.send(await this.metrics.metrics());
  }
}
