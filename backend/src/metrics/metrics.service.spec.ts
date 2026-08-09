import { Test } from "@nestjs/testing";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";

describe("MetricsService", () => {
  let service: MetricsService;
  let controller: MetricsController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [MetricsService],
    }).compile();

    service = moduleRef.get(MetricsService);
    controller = moduleRef.get(MetricsController);
    service.onModuleInit();
  });

  it("registra métricas HTTP por rota, método e status", async () => {
    service.recordHttpRequest("GET", "/share/:id", 200, 0.042);
    service.recordHttpRequest("POST", "/share", 201, 0.1);

    const text = await service.metrics();
    expect(text).toContain('http_requests_total{method="GET",route="/share/:id",status="200"} 1');
    expect(text).toContain('http_requests_total{method="POST",route="/share",status="201"} 1');
    expect(text).toContain('http_request_duration_seconds_bucket');
  });

  it("incrementa contadores de negócio", async () => {
    service.incSharesCreated();
    service.incAppEvent("download", true);
    service.incAppEvent("upload", false);
    service.incJwtRotation();

    const text = await service.metrics();
    expect(text).toContain("shares_created_total 1");
    expect(text).toContain('app_events_total{event="download",success="true"} 1');
    expect(text).toContain('app_events_total{event="upload",success="false"} 1');
    expect(text).toContain("jwt_rotations_total 1");
  });

  it("expõe o gauge de integridade SQLite (0 = OK por padrão)", async () => {
    const text = await service.metrics();
    expect(text).toContain("sqlite_integrity_check_failed 0");

    service.setSqliteIntegrityFailed(true);
    const textAfter = await service.metrics();
    expect(textAfter).toContain("sqlite_integrity_check_failed 1");
  });

  it("coleta métricas default do Node.js", async () => {
    const text = await service.metrics();
    expect(text).toContain("nodejs_eventloop_lag_seconds");
    expect(text).toContain("nodejs_heap_size_total_bytes");
  });

  it("o controller serve o texto do registry", async () => {
    const res = {
      send: jest.fn(),
    };
    await controller.exposeMetrics(res as never);
    expect(res.send).toHaveBeenCalled();
    const body = (res.send as jest.Mock).mock.calls[0][0] as string;
    expect(body).toContain("http_requests_total");
  });
});
