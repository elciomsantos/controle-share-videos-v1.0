import { toBytes } from "@/shared/dto";

describe("toBytes", () => {
  it("returns 0 for null and undefined", () => {
    expect(toBytes(null)).toBe(0);
    expect(toBytes(undefined)).toBe(0);
  });

  it("converts bigint values to a JS number", () => {
    expect(toBytes(21707043n)).toBe(21707043);
  });

  it("parses numeric strings", () => {
    expect(toBytes("1048576")).toBe(1048576);
    expect(toBytes("1.5e3")).toBe(1500);
  });

  it("accepts plain numbers", () => {
    expect(toBytes(42)).toBe(42);
    expect(toBytes(0)).toBe(0);
  });

  it("returns 0 for non-numeric or empty strings", () => {
    expect(toBytes("")).toBe(0);
    expect(toBytes("abc")).toBe(0);
    expect(toBytes("12px")).toBe(0);
  });

  it("returns 0 for negative values", () => {
    expect(toBytes("-5")).toBe(0);
    expect(toBytes(-5)).toBe(0);
  });

  it("returns 0 for non-finite values", () => {
    expect(toBytes(Infinity)).toBe(0);
    expect(toBytes(Number.NaN)).toBe(0);
  });
});
