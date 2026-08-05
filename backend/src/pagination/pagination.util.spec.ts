import {
  MAX_PER_PAGE,
  normalizePagination,
} from "./pagination.util";

describe("normalizePagination", () => {
  it("defaults to page=1, perPage=20", () => {
    expect(normalizePagination({})).toEqual({ page: 1, perPage: 20, skip: 0 });
  });

  it("clamps perPage to the ceiling", () => {
    const r = normalizePagination({ page: 1, perPage: 9999 });
    expect(r.perPage).toBe(MAX_PER_PAGE);
  });

  it("rejects page <= 0 and falls back to default", () => {
    expect(normalizePagination({ page: 0 }).page).toBe(1);
    expect(normalizePagination({ page: -3 }).page).toBe(1);
  });

  it("rejects perPage out of range and falls back", () => {
    expect(normalizePagination({ perPage: 0 }).perPage).toBe(20);
    expect(normalizePagination({ perPage: -1 }).perPage).toBe(20);
  });

  it("computes skip = (page-1)*perPage", () => {
    expect(normalizePagination({ page: 3, perPage: 10 })).toEqual({
      page: 3,
      perPage: 10,
      skip: 20,
    });
  });

  it("handles string-encoded numbers from query string", () => {
    expect(normalizePagination({ page: "2", perPage: "50" })).toEqual({
      page: 2,
      perPage: 50,
      skip: 50,
    });
  });

  it("falls back on NaN / non-numeric", () => {
    expect(normalizePagination({ page: "abc", perPage: "xx" })).toEqual({
      page: 1,
      perPage: 20,
      skip: 0,
    });
  });

  it("falls back on null/undefined/empty", () => {
    expect(
      normalizePagination({ page: null, perPage: undefined }),
    ).toEqual({ page: 1, perPage: 20, skip: 0 });
  });

  it("truncates non-integer numeric inputs", () => {
    expect(normalizePagination({ page: 2.9, perPage: 10.99 })).toEqual({
      page: 2,
      perPage: 10,
      skip: 10,
    });
  });
});
