import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { UploadQueryDTO } from "./uploadQuery.dto";

const base = {
  id: "a82eb345-ab84-4fa4-b71a-cbfe89592b9c",
  name: "video.mp4",
  chunkIndex: "0",
  totalChunks: "3",
};

const validateWith = async (overrides: Record<string, unknown>) => {
  const dto = plainToInstance(UploadQueryDTO, { ...base, ...overrides });
  const errors = await validate(dto, { whitelist: true });
  return errors.map((e) => Object.keys(e.constraints ?? {}));
};

describe("UploadQueryDTO (SEC-ZIPSLIP VULN-15)", () => {
  it("aceita upload legítimo com pastas e acentos", async () => {
    expect(await validateWith({ name: "vídeos/2024/relatório final.mp4" })).toEqual([]);
  });

  it.each([
    "../etc/passwd",
    "videos/../../passwd",
    "videos/../",
    "/absolute/path.mp4",
    "back\\slash.mp4",
    "null\0byte.mp4",
  ])("rejeita traversal/absoluto/controle: %s", async (name) => {
    const errors = await validateWith({ name });
    expect(errors).toContainEqual(["matches"]);
  });

  it("rejeita nome acima de 255 caracteres", async () => {
    const errors = await validateWith({ name: `${"a".repeat(300)}.mp4` });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("converte e valida chunkIndex/totalChunks numéricos", async () => {
    expect(await validateWith({ chunkIndex: "-1" })).toContainEqual(["min"]);
    expect(await validateWith({ totalChunks: "0" })).toContainEqual(["min"]);
    expect(
      await validateWith({ chunkIndex: "1.5" }),
    ).toContainEqual(["isInt"]);
  });

  it("aceita primeiro chunk sem id (serviço gera UUID)", async () => {
    const dto = plainToInstance(UploadQueryDTO, {
      name: "video.mp4",
      chunkIndex: "0",
      totalChunks: "3",
    });
    const errors = await validate(dto, { whitelist: true });
    expect(errors).toEqual([]);
  });

  it("rejeita id que não é UUID", async () => {
    expect(await validateWith({ id: "../../etc" })).toContainEqual(["isUuid"]);
  });

  it("limita description a 512 caracteres", async () => {
    expect(
      await validateWith({ description: "d".repeat(513) }),
    ).toContainEqual(["maxLength"]);
  });
});
