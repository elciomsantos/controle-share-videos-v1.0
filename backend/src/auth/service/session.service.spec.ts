import { SessionService } from "./session.service";

describe("SessionService (SEC-1.2/§10-§11)", () => {
  let prisma: {
    session: { updateMany: jest.Mock };
  };
  let tokenService: { getSessionByAccessToken: jest.Mock };
  let config: { getTimespan: jest.Mock };
  let service: SessionService;

  const makeSession = (overrides: Record<string, unknown> = {}) => ({
    id: "s1",
    revokedAt: null as Date | null,
    expiresAt: new Date(Date.now() + 3_600_000),
    lastActivityAt: new Date(Date.now() - 5_000),
    user: { id: "u1", isActivated: true },
    ...overrides,
  });

  beforeEach(() => {
    prisma = { session: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    tokenService = { getSessionByAccessToken: jest.fn() };
    config = { getTimespan: jest.fn(() => ({ value: 30, unit: "minutes" })) };
    service = new SessionService(prisma as never, tokenService as never, config as never);
  });

  it("retorna null sem token (§10.1)", async () => {
    await expect(service.validate(undefined)).resolves.toBeNull();
  });

  it("retorna null para sessão inexistente", async () => {
    tokenService.getSessionByAccessToken.mockResolvedValue(null);
    await expect(service.validate("opaque")).resolves.toBeNull();
  });

  it("recusa sessão revogada (§10.2)", async () => {
    tokenService.getSessionByAccessToken.mockResolvedValue(
      makeSession({ revokedAt: new Date() }),
    );
    await expect(service.validate("opaque")).resolves.toBeNull();
  });

  it("recusa sessão além da expiração absoluta (§11.1)", async () => {
    tokenService.getSessionByAccessToken.mockResolvedValue(
      makeSession({ expiresAt: new Date(Date.now() - 1_000) }),
    );
    await expect(service.validate("opaque")).resolves.toBeNull();
  });

  it("recusa sessão fora do idle timeout (§11.2)", async () => {
    tokenService.getSessionByAccessToken.mockResolvedValue(
      makeSession({ lastActivityAt: new Date(Date.now() - 31 * 60_000) }),
    );
    await expect(service.validate("opaque")).resolves.toBeNull();
  });

  it("recusa usuário inativo (§10)", async () => {
    tokenService.getSessionByAccessToken.mockResolvedValue(
      makeSession({ user: { id: "u1", isActivated: false } }),
    );
    await expect(service.validate("opaque")).resolves.toBeNull();
  });

  it("aceita sessão válida e atualiza lastActivityAt de forma condicional (§10.4)", async () => {
    tokenService.getSessionByAccessToken.mockResolvedValue(
      makeSession({ lastActivityAt: new Date(Date.now() - 120_000) }),
    );

    const user = await service.validate("opaque");

    expect(user?.id).toBe("u1");
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { id: "s1", lastActivityAt: expect.any(Date) },
      data: { lastActivityAt: expect.any(Date) },
    });
  });

  it("não atualiza lastActivityAt dentro do intervalo de 1 min (§10.4)", async () => {
    tokenService.getSessionByAccessToken.mockResolvedValue(makeSession());

    await service.validate("opaque");

    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });
});