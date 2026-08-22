import { MetricsService } from "./metrics.service";
import { ConfigService } from "../config/config.service";
import { TlsCertificateChecker } from "./tls-certificate.checker";

describe("TlsCertificateChecker", () => {
  let metrics: {
    setTlsCertificateExpiry: jest.Mock;
    setTlsProbeFailed: jest.Mock;
  };
  let config: { getString: jest.Mock };
  let service: TlsCertificateChecker;

  const cleanEnv = () => {
    delete process.env.TLS_PROBE_DOMAINS;
    delete process.env.TLS_PROBE_PORT;
    delete process.env.DOMAIN;
  };

  beforeEach(() => {
    cleanEnv();
    metrics = {
      setTlsCertificateExpiry: jest.fn(),
      setTlsProbeFailed: jest.fn(),
    };
    config = {
      getString: jest.fn().mockReturnValue("https://exemplo.com.br"),
    };
    service = new TlsCertificateChecker(
      metrics as unknown as MetricsService,
      config as unknown as ConfigService,
    );
  });

  afterEach(cleanEnv);

  describe("resolveDomains", () => {
    it("prioriza TLS_PROBE_DOMAINS (múltiplos domínios)", () => {
      process.env.TLS_PROBE_DOMAINS = "a.com, b.com ,c.com";
      expect(service.resolveDomains()).toEqual(["a.com", "b.com", "c.com"]);
    });

    it("deriva hostname de general.appUrl", () => {
      expect(service.resolveDomains()).toEqual(["exemplo.com.br"]);
    });

    it("ignora localhost e cai para DOMAIN env", () => {
      config.getString.mockReturnValue("http://localhost:3000");
      process.env.DOMAIN = "videos.example.org";
      expect(service.resolveDomains()).toEqual(["videos.example.org"]);
    });

    it("retorna vazio quando nada configurado", () => {
      config.getString.mockReturnValue("http://localhost:3000");
      expect(service.resolveDomains()).toEqual([]);
    });
  });

  describe("checkDomain", () => {
    it("exporta expiração em unix seconds quando o probe funciona", async () => {
      const expiry = Math.floor(Date.now() / 1000) + 60 * 86400; // 60 dias
      jest.spyOn(service as never as { probeExpiry: () => Promise<number> }, "probeExpiry").mockResolvedValue(expiry);

      await service.checkDomain("exemplo.com.br");

      expect(metrics.setTlsCertificateExpiry).toHaveBeenCalledWith(
        "exemplo.com.br",
        expiry,
      );
      expect(metrics.setTlsProbeFailed).not.toHaveBeenCalled();
    });

    it("remove a série de expiração quando o probe falha (alertas ficam quietos)", async () => {
      jest.spyOn(
        service as never as { probeExpiry: () => Promise<number> },
        "probeExpiry",
      ).mockRejectedValue(new Error("ECONNREFUSED"));

      await service.checkDomain("exemplo.com.br");

      expect(metrics.setTlsProbeFailed).toHaveBeenCalledWith("exemplo.com.br");
      expect(metrics.setTlsCertificateExpiry).not.toHaveBeenCalled();
    });

    it("probe real contra porta fechada rejeita (sem falso positivo)", async () => {
      process.env.TLS_PROBE_PORT = "1"; // porta fechada no runner

      await service.checkDomain("127.0.0.1");

      expect(metrics.setTlsProbeFailed).toHaveBeenCalledWith("127.0.0.1");
      expect(metrics.setTlsCertificateExpiry).not.toHaveBeenCalled();
    }, 20_000);
  });
});
