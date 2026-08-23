import {
  decryptSecret,
  encryptSecret,
  hasEncryptionKey,
  isEncrypted,
} from "./jwt-secret-crypto";

const TEST_KEY = Buffer.alloc(32, 7).toString("base64");
const SECRET = "JBSWY3DPEHPK3PXP";

describe("jwt-secret-crypto (SEC-AT-REST VULN-08)", () => {
  afterEach(() => {
    delete process.env.JWT_SECRET_ENCRYPTION_KEY;
  });

  it("sem chave configurada: valor permanece plaintext (modo legado)", () => {
    expect(hasEncryptionKey()).toBe(false);
    expect(encryptSecret(SECRET)).toBe(SECRET);
    expect(decryptSecret(SECRET)).toBe(SECRET);
  });

  it("com chave: cifra com prefixo enc:v1, sem plaintext, e recupera o original", () => {
    process.env.JWT_SECRET_ENCRYPTION_KEY = TEST_KEY;
    const cipher = encryptSecret(SECRET);

    expect(isEncrypted(cipher)).toBe(true);
    expect(cipher).not.toContain(SECRET);
    expect(decryptSecret(cipher)).toBe(SECRET);
  });

  it("decifra valores plaintext legados sem prefixo (rollout gradual)", () => {
    process.env.JWT_SECRET_ENCRYPTION_KEY = TEST_KEY;
    expect(decryptSecret(SECRET)).toBe(SECRET);
  });

  it("IV aleatório: mesmo plaintext gera ciphertexts distintos", () => {
    process.env.JWT_SECRET_ENCRYPTION_KEY = TEST_KEY;
    expect(encryptSecret(SECRET)).not.toBe(encryptSecret(SECRET));
  });

  it("chave com tamanho errado não habilita criptografia", () => {
    process.env.JWT_SECRET_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString(
      "base64",
    );
    expect(hasEncryptionKey()).toBe(false);
    expect(encryptSecret(SECRET)).toBe(SECRET);
  });
});
