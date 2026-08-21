// SEC-4.1 — Testes de versionamento da API.
// Valida: prefixo /api/v{N}/ (rewrite para rota canônica), header
// X-API-Version, negociação via Accept (vnd.cs.v{N}+json) e rejeição
// fail-closed de versões não suportadas (400 unsupported_api_version).
import { Test } from "@nestjs/testing";
import { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/main";
import { ConfigService } from "../src/config/config.service";

describe("API Versioning (SEC-4.1)", () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    await configureApp(app, app.get(ConfigService));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("GET /api/health retorna 200 com X-API-Version: 1", async () => {
    const res = await request(app.getHttpServer()).get("/api/health").expect(200);
    expect(res.text).toBe("OK");
    expect(res.headers["x-api-version"]).toBe("1");
  });

  it("GET /api/v1/health faz rewrite para /api/health e retorna 200", async () => {
    // Garante que o rewrite preserva o global prefix (/api), não apenas strip.
    const res = await request(app.getHttpServer()).get("/api/v1/health").expect(200);
    expect(res.text).toBe("OK");
    expect(res.headers["x-api-version"]).toBe("1");
  });

  it("GET /api/v99/health retorna 400 unsupported_api_version", async () => {
    const res = await request(app.getHttpServer()).get("/api/v99/health").expect(400);
    expect(res.body.message).toBe("unsupported_api_version");
    expect(res.body.supportedVersions).toEqual(["1"]);
    expect(res.headers["x-api-version"]).toBe("99");
  });

  it("Accept: application/vnd.cs.v1+json negocia versão 1", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/health")
      .set("Accept", "application/vnd.cs.v1+json")
      .expect(200);
    expect(res.headers["x-api-version"]).toBe("1");
  });

  it("Accept com versão não suportada retorna 400 fail-closed", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/health")
      .set("Accept", "application/vnd.cs.v42+json")
      .expect(400);
    expect(res.body.message).toBe("unsupported_api_version");
  });

  it("Accept padrão (*/* ou omitido) não bloqueia a requisição", async () => {
    await request(app.getHttpServer()).get("/api/health").set("Accept", "*/*").expect(200);
    await request(app.getHttpServer()).get("/api/health").expect(200);
  });
});
