import { RecoveryCodeService } from "./recovery-code.service";

describe("RecoveryCodeService", () => {
  let prisma: {
    recoveryCode: {
      deleteMany: jest.Mock;
      createMany: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let service: RecoveryCodeService;

  beforeEach(() => {
    prisma = {
      recoveryCode: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new RecoveryCodeService(prisma as never);
  });

  describe("regenerate", () => {
    it("revoga códigos anteriores e retorna códigos em texto puro únicos", async () => {
      const codes = await service.regenerate("u1", 10);

      expect(prisma.recoveryCode.deleteMany).toHaveBeenCalledWith({
        where: { userId: "u1" },
      });
      expect(codes).toHaveLength(10);
      expect(new Set(codes).size).toBe(10);
      // Cada código hex de 10 chars.
      codes.forEach((code) => expect(code).toMatch(/^[0-9a-f]{10}$/));

      const data = prisma.recoveryCode.createMany.mock.calls[0][0].data;
      expect(data).toHaveLength(10);
      // Nenhum texto puro é persistido — apenas hash sha256 (64 hex).
      data.forEach((d: { codeHash: string; userId: string }) => {
        expect(d.codeHash).toMatch(/^[0-9a-f]{64}$/);
        expect(d.userId).toBe("u1");
        expect(codes).not.toContain(d.codeHash);
      });
    });
  });

  describe("consume", () => {
    it("consome um código de uso único atômico e retorna true", async () => {
      const ok = await service.consume("u1", "a1b2c3d4e5");

      expect(ok).toBe(true);
      expect(prisma.recoveryCode.updateMany).toHaveBeenCalledWith({
        where: {
          userId: "u1",
          codeHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          usedAt: null,
        },
        data: { usedAt: expect.any(Date) },
      });
    });

    it("retorna false quando o código não existe ou já foi usado", async () => {
      prisma.recoveryCode.updateMany.mockResolvedValue({ count: 0 });

      const ok = await service.consume("u1", "a1b2c3d4e5");

      expect(ok).toBe(false);
    });
  });

  describe("clearForUser", () => {
    it("revoga todos os códigos do usuário", async () => {
      await service.clearForUser("u1");

      expect(prisma.recoveryCode.deleteMany).toHaveBeenCalledWith({
        where: { userId: "u1" },
      });
    });
  });
});