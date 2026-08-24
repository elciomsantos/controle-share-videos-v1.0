import { afterEach, describe, expect, it, vi } from "vitest";
import { isSafeHttpUrl, safeHttpUrl, safeShareLinkBase } from "./safe-url.util";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isSafeHttpUrl (SEC-URL — scheme whitelist)", () => {
  it("aceita URLs http(s)", () => {
    expect(isSafeHttpUrl("http://example.com")).toBe(true);
    expect(isSafeHttpUrl("https://example.com/path?q=1")).toBe(true);
  });

  it("rejeita esquemas executáveis", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,<script>")).toBe(false);
    expect(isSafeHttpUrl("vbscript:msgbox")).toBe(false);
    expect(isSafeHttpUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejeita valores inválidos/vazios", () => {
    expect(isSafeHttpUrl("")).toBe(false);
    expect(isSafeHttpUrl(undefined)).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
    expect(isSafeHttpUrl("nao-e-url")).toBe(false);
  });
});

describe("safeHttpUrl", () => {
  it("retorna a URL quando segura", () => {
    expect(safeHttpUrl("https://example.com/legal")).toBe(
      "https://example.com/legal",
    );
  });

  it("retorna null quando insegura", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
  });
});

describe("safeShareLinkBase (SEC-URL — base de link de share)", () => {
  it("usa appUrl configurado quando http(s)", () => {
    expect(safeShareLinkBase("https://videos.example.com")).toBe(
      "https://videos.example.com",
    );
  });

  it("cai para a origem atual com esquema perigoso ou vazio", () => {
    vi.stubGlobal("window", { location: { origin: "https://test.origin" } });
    expect(safeShareLinkBase("javascript:alert(1)")).toBe(
      "https://test.origin",
    );
    expect(safeShareLinkBase("")).toBe("https://test.origin");
    expect(safeShareLinkBase(undefined)).toBe("https://test.origin");
  });

  it("retorna string vazia sem window (SSR/node)", () => {
    expect(safeShareLinkBase("javascript:alert(1)")).toBe("");
  });
});
