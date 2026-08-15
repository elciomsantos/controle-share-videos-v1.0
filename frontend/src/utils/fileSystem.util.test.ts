import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isFileSystemAccessSupported,
  pickDirectory,
  writeBlobToDirectory,
  writeBlobToRelativeDirectory,
  listDirectoryFiles,
} from "./fileSystem.util";
import { FileSystemDirectoryHandle } from "./fileSystem.util";

const makeWritable = () => {
  const written: Blob[] = [];
  const writable = {
    write: vi.fn(async (data: Blob) => {
      written.push(data);
    }),
    close: vi.fn(async () => {}),
    __written: written,
  };
  return writable as any;
};

const makeDirHandle = (
  overrides: Record<string, any> = {},
): FileSystemDirectoryHandle => {
  const dirs = new Map<string, any>();
  const files = new Map<string, any>();
  return {
    kind: "directory",
    name: "root",
    values: vi.fn(async function* () {
      for (const f of files.values()) yield f;
      for (const d of dirs.values()) yield d;
    }),
    getFileHandle: vi.fn(async (name: string) => {
      if (!files.has(name))
        files.set(name, {
          kind: "file",
          name,
          getFile: vi.fn(),
          createWritable: vi.fn(async () => makeWritable()),
        });
      return files.get(name);
    }),
    getDirectoryHandle: vi.fn(async (name: string) => {
      if (!dirs.has(name)) dirs.set(name, makeDirHandle());
      return dirs.get(name);
    }),
    requestPermission: vi.fn(
      async (): Promise<"granted" | "denied" | "prompt"> => "granted",
    ),
    ...overrides,
  };
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("isFileSystemAccessSupported", () => {
  it("returns false when showDirectoryPicker is missing", () => {
    vi.stubGlobal("window", {});
    expect(isFileSystemAccessSupported()).toBe(false);
  });

  it("returns true when showDirectoryPicker exists", () => {
    vi.stubGlobal("window", {
      showDirectoryPicker: vi.fn(),
    });
    expect(isFileSystemAccessSupported()).toBe(true);
  });
});

describe("pickDirectory", () => {
  it("returns null when unsupported", async () => {
    vi.stubGlobal("window", {});
    expect(await pickDirectory()).toBe(null);
  });

  it("calls showDirectoryPicker with readwrite mode", async () => {
    const picker = vi.fn(async () => makeDirHandle());
    vi.stubGlobal("window", { showDirectoryPicker: picker });
    const result = await pickDirectory();
    expect(picker).toHaveBeenCalledWith({ mode: "readwrite" });
    expect(result?.kind).toBe("directory");
  });
});

describe("writeBlobToDirectory", () => {
  it("writes the blob to the directory", async () => {
    const fileHandle = {
      createWritable: vi.fn(async () => makeWritable()),
    };
    const dir = makeDirHandle({
      getFileHandle: vi.fn(async () => fileHandle),
    });
    const blob = new Blob(["pdf"], { type: "application/pdf" });
    const ok = await writeBlobToDirectory(dir, "cert.pdf", blob);
    expect(ok).toBe(true);
    expect(dir.getFileHandle).toHaveBeenCalledWith("cert.pdf", { create: true });
    const writable = await fileHandle.createWritable.mock.results[0].value;
    expect(writable.write).toHaveBeenCalledWith(blob);
    expect(writable.close).toHaveBeenCalled();
  });

  it("returns false when permission is denied", async () => {
    const dir = makeDirHandle({
      requestPermission: vi.fn(async () => "denied"),
    });
    const ok = await writeBlobToDirectory(dir, "cert.pdf", new Blob());
    expect(ok).toBe(false);
  });
});

describe("writeBlobToRelativeDirectory", () => {
  it("writes to root when relativeDirPath is empty", async () => {
    const dir = makeDirHandle();
    const ok = await writeBlobToRelativeDirectory(dir, "", "cert.pdf", new Blob());
    expect(ok).toBe(true);
    expect(dir.getFileHandle).toHaveBeenCalled();
  });

  it("writes to a nested directory", async () => {
    const dir = makeDirHandle();
    const blob = new Blob(["data"]);
    const ok = await writeBlobToRelativeDirectory(dir, "updir", "cert.pdf", blob);
    expect(ok).toBe(true);
    expect(dir.getDirectoryHandle).toHaveBeenCalledWith("updir", { create: true });
  });
});

describe("listDirectoryFiles", () => {
  it("lists files recursively with relative paths", async () => {
    const fileA = { kind: "file", name: "a.mp4", getFile: vi.fn(async () => new File(["a"], "a.mp4")) };
    const fileB = { kind: "file", name: "b.mp4", getFile: vi.fn(async () => new File(["b"], "b.mp4")) };
    const nested = makeDirHandle({ kind: "directory", name: "sub", values: vi.fn(async function* () { yield fileB; }) });
    const dir = makeDirHandle({
      values: vi.fn(async function* () {
        yield fileA;
        yield nested;
      }),
    });

    const result = await listDirectoryFiles(dir);
    expect(result.map((r) => r.relativePath)).toEqual(["a.mp4", "sub/b.mp4"]);
  });
});