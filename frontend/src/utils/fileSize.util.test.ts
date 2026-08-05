import { describe, it, expect } from "vitest";
import {
  byteToHumanSizeString,
  byteToUnitAndSize,
  unitAndSizeToByte,
} from "./fileSize.util";

describe("byteToHumanSizeString", () => {
  it("returns 0 Byte for zero", () => {
    expect(byteToHumanSizeString(0)).toBe("0 Byte");
  });

  it("formats bytes, KB, MB, GB and TB", () => {
    expect(byteToHumanSizeString(1)).toBe("1.0 B");
    expect(byteToHumanSizeString(1500)).toBe("1.5 KB");
    expect(byteToHumanSizeString(1_000_000)).toBe("1.0 MB");
    expect(byteToHumanSizeString(1_000_000_000)).toBe("1.0 GB");
    expect(byteToHumanSizeString(1_000_000_000_000)).toBe("1.0 TB");
  });
});

describe("byteToUnitAndSize", () => {
  it("returns bytes unit with size 0 for zero", () => {
    expect(byteToUnitAndSize(0)).toEqual({ unit: "B", size: 0 });
  });

  it("splits a byte count into unit and size", () => {
    expect(byteToUnitAndSize(2500)).toEqual({ unit: "KB", size: 2.5 });
    expect(byteToUnitAndSize(123456)).toEqual({ unit: "KB", size: 123.5 });
    expect(byteToUnitAndSize(1_000_000)).toEqual({ unit: "MB", size: 1 });
  });
});

describe("unitAndSizeToByte", () => {
  it("converts back to bytes", () => {
    expect(unitAndSizeToByte("B", 5)).toBe(5);
    expect(unitAndSizeToByte("KB", 2.5)).toBe(2500);
    expect(unitAndSizeToByte("MB", 1)).toBe(1_000_000);
    expect(unitAndSizeToByte("TB", 1)).toBe(1_000_000_000_000);
  });
});
