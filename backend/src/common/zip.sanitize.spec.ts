import { sanitizeZipEntryName } from "./zip";

// SEC-ZIPSLIP (VULN-03): vetores clássicos de Zip Slip precisam ser neutralizados.
describe("sanitizeZipEntryName", () => {
  it.each([
    ["../../../etc/passwd", "etc/passwd"],
    ["..\\..\\windows\\system32", "windows/system32"],
    ["/absolute/path/file.txt", "absolute/path/file.txt"],
    ["a/../../b.txt", "a/b.txt"],
    ["videos/2024/trailer.mp4", "videos/2024/trailer.mp4"],
    ["relatório final.txt", "relatório final.txt"],
    ["a/../..b/c.txt", "a/..b/c.txt"],
    ["....//x.txt", "..../x.txt"],
  ])("sanitiza %s → %s", (input, expected) => {
    expect(sanitizeZipEntryName(input)).toBe(expected);
  });

  it("usa o fallback quando o nome vira vazio após sanitização", () => {
    expect(sanitizeZipEntryName("../..")).toBe("arquivo");
    expect(sanitizeZipEntryName("../../", "f1")).toBe("f1");
    expect(sanitizeZipEntryName(".")).toBe("arquivo");
  });
});
