import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./router.util";

describe("safeRedirectPath (issue #41 — open redirect)", () => {
  it("retorna / para vazio/undefined", () => {
    expect(safeRedirectPath(undefined)).toBe("/");
    expect(safeRedirectPath("")).toBe("/");
  });

  it("mantém caminhos relativos válidos", () => {
    expect(safeRedirectPath("/upload")).toBe("/upload");
    expect(safeRedirectPath("/share/abc?x=1")).toBe("/share/abc?x=1");
  });

  it("prefixa caminho sem barra inicial", () => {
    expect(safeRedirectPath("upload")).toBe("/upload");
  });

  it.each([
    "//evil.com",
    "///evil.com",
    "/\\evil.com",
    "/%2F%2Fevil.com".replace("%2F", "/") + "", // coberto abaixo
  ])("rejeita protocol-relative: %s", (input) => {
    const result = safeRedirectPath(input);
    expect(result.startsWith("//")).toBe(false);
    expect(result.startsWith("/\\")).toBe(false);
  });

  it("rejeita caracteres de controle (smuggling por \\n)", () => {
    expect(safeRedirectPath("/ok\r\nSet-Cookie:x=1")).toBe("/");
    expect(safeRedirectPath("/a\tb")).toBe("/");
  });

  it("URL absoluta externa vira caminho relativo (comportamento legado mantido)", () => {
    expect(safeRedirectPath("https://evil.com/x")).toBe("/https://evil.com/x");
  });
});
