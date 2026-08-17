import { RequestThrottlerGuard } from "./request-throttler.guard";

class ExposedGuard extends RequestThrottlerGuard {
  public getTracker(req: Record<string, unknown>): Promise<string> {
    return super.getTracker(req);
  }
}

function createGuard(): ExposedGuard {
  return new ExposedGuard(
    [{ ttl: 60_000, limit: 100 }],
    {} as never,
    {} as never,
  );
}

describe("RequestThrottlerGuard", () => {
  let guard: ExposedGuard;

  beforeEach(() => {
    guard = createGuard();
  });

  it("keya o login por conta + IP (§22.1)", async () => {
    const key = await guard.getTracker({
      originalUrl: "/api/auth/signIn",
      body: { email: "User@Example.com", password: "x" },
      ip: "1.2.3.4",
      socket: { remoteAddress: "1.2.3.4" },
    });
    expect(key).toBe("user@example.com:1.2.3.4");
  });

  it("keya o login por username + IP quando email ausente (§22.1)", async () => {
    const key = await guard.getTracker({
      originalUrl: "/api/auth/signIn",
      body: { username: "admin", password: "x" },
      ip: "1.2.3.4",
      socket: { remoteAddress: "1.2.3.4" },
    });
    expect(key).toBe("admin:1.2.3.4");
  });

  it("cai para IP quando o login não informa conta (§22.1)", async () => {
    const key = await guard.getTracker({
      originalUrl: "/api/auth/signIn",
      body: { password: "x" },
      ip: "1.2.3.4",
      socket: { remoteAddress: "1.2.3.4" },
    });
    expect(key).toBe("1.2.3.4");
  });

  it("keya o acesso público ao share por IP + share id (§22.3/§23.5)", async () => {
    const key = await guard.getTracker({
      originalUrl: "/api/shares/abc123/view",
      ip: "1.2.3.4",
      socket: { remoteAddress: "1.2.3.4" },
      cookies: {},
    });
    expect(key).toBe("1.2.3.4:share:abc123");
  });

  it("inclui o token de share quando presente (§22.3)", async () => {
    const key = await guard.getTracker({
      originalUrl: "/api/shares/abc123",
      ip: "1.2.3.4",
      socket: { remoteAddress: "1.2.3.4" },
      cookies: { share_abc123_token: "tok" },
    });
    expect(key).toBe("1.2.3.4:share:abc123:token");
  });

  it("não chaveia rotas de share autenticadas por recurso", async () => {
    const key = await guard.getTracker({
      originalUrl: "/api/shares/abc123/from-owner",
      ip: "1.2.3.4",
      socket: { remoteAddress: "1.2.3.4" },
      cookies: {},
    });
    expect(key).toBe("1.2.3.4");
  });

  it("usa IP por padrão nas demais rotas", async () => {
    const key = await guard.getTracker({
      originalUrl: "/api/users",
      ip: "1.2.3.4",
      socket: { remoteAddress: "1.2.3.4" },
    });
    expect(key).toBe("1.2.3.4");
  });
});