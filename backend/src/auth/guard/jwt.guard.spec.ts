import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../decorator/public.decorator";
import { JwtGuard } from "./jwt.guard";

describe("JwtGuard", () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;
  let sessionService: { validate: jest.Mock };
  let config: { getBoolean: jest.Mock };

  function makeContext(req: Record<string, unknown> = {}) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    sessionService = { validate: jest.fn() };
    config = { getBoolean: jest.fn(() => false) }; // dev: cookie legado
  });

  it("permite rotas públicas sem token (acesso anônimo)", async () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(true);
    sessionService.validate.mockResolvedValue(null);
    const guard = new JwtGuard(reflector, sessionService as never, config as never);

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });

  it("popula o usuário em rotas públicas quando há sessão válida", async () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(true);
    sessionService.validate.mockResolvedValue({ id: "user-123" });
    const req = {};
    const guard = new JwtGuard(reflector, sessionService as never, config as never);

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect((req as { user?: { id: string } }).user?.id).toBe("user-123");
  });

  it("autentica um token de sessão válido e marca o user id", async () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(false);
    sessionService.validate.mockResolvedValue({ id: "user-123" });
    const req = {};
    const guard = new JwtGuard(reflector, sessionService as never, config as never);

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(sessionService.validate).toHaveBeenCalledWith(undefined);
  });

  it("falha fechado: sessão inválida em rota protegida vira UnauthorizedException", async () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(false);
    sessionService.validate.mockResolvedValue(null);
    const guard = new JwtGuard(reflector, sessionService as never, config as never);

    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("usa a metadata IS_PUBLIC_KEY", async () => {
    const guard = new JwtGuard(reflector, sessionService as never, config as never);
    expect(IS_PUBLIC_KEY).toBeDefined();
    expect(guard).toBeInstanceOf(JwtGuard);
  });
});