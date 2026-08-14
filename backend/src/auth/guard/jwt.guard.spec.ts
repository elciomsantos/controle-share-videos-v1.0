import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../decorator/public.decorator";
import { JwtGuard } from "./jwt.guard";

const mockCanActivate = jest.fn();

jest.mock("@nestjs/passport", () => ({
  AuthGuard: jest.fn(() =>
    class MockAuthGuard {
      async canActivate(): Promise<boolean> {
        return mockCanActivate();
      }
    },
  ),
}));

describe("JwtGuard", () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  function makeContext(req: Record<string, unknown> = {}) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockCanActivate.mockReset();
  });

  it("allows public routes even when the passport strategy rejects (optional auth)", async () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(true);
    mockCanActivate.mockRejectedValue(new Error("no token"));
    const guard = new JwtGuard(reflector);

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(mockCanActivate).toHaveBeenCalled();
  });

  it("populates the user on public routes when a valid token is present", async () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(true);
    mockCanActivate.mockResolvedValue(true);
    const req = { user: { id: "user-123" } };
    const guard = new JwtGuard(reflector);

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(mockCanActivate).toHaveBeenCalledTimes(1);
  });

  it("allows public routes without a token (guest access)", async () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(true);
    mockCanActivate.mockRejectedValue(new UnauthorizedException());
    const guard = new JwtGuard(reflector);

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });

  it("authenticates a valid token and stamps the user id on the context", async () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(false);
    mockCanActivate.mockResolvedValue(true);
    const req = { user: { id: "user-123" } };
    const guard = new JwtGuard(reflector);

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(mockCanActivate).toHaveBeenCalledTimes(1);
  });

  it("fails closed: a rejected token becomes UnauthorizedException", async () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(false);
    mockCanActivate.mockRejectedValue(new Error("invalid token"));
    const guard = new JwtGuard(reflector);

    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("fails closed: no token (super returns false) does not grant access", async () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(false);
    mockCanActivate.mockResolvedValue(false);
    const guard = new JwtGuard(reflector);

    await expect(guard.canActivate(makeContext())).resolves.toBe(false);
  });

  it("uses the IS_PUBLIC_KEY decorator metadata", async () => {
    const guard = new JwtGuard(reflector);
    expect(IS_PUBLIC_KEY).toBeDefined();
    expect(guard).toBeInstanceOf(JwtGuard);
  });
});
