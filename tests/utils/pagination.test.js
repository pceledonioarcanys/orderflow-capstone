/**
 * Tests for the pagination query parser (SPEC.md §2.1–§2.2, matrix rows P1–P15).
 *
 * Inputs are written as the JS values Express's `qs` parser produces
 * (strings, arrays, objects). Raw query-string parsing is not exercised here.
 */

const { parsePagination } = require("../../src/utils/pagination");

const LIMIT_ERROR = { error: "limit must be an integer between 1 and 100" };
const OFFSET_ERROR = {
  error: "offset must be an integer between 0 and 9007199254740991",
};

describe("parsePagination", () => {
  it("P1: defaults to limit 50 and offset 0 when both are absent", () => {
    expect(parsePagination({})).toEqual({ limit: 50, offset: 0 });
  });

  describe("P2: accepts limits at and below the maximum", () => {
    it.each([
      ["1", 1],
      ["99", 99],
      ["100", 100],
    ])("limit %j -> %d", (input, expected) => {
      expect(parsePagination({ limit: input })).toEqual({
        limit: expected,
        offset: 0,
      });
    });
  });

  describe("P3: rejects limits outside 1–100", () => {
    it.each(["0", "101"])("limit %j", (input) => {
      expect(parsePagination({ limit: input })).toEqual(LIMIT_ERROR);
    });
  });

  describe("P4: accepts offsets from 0 to Number.MAX_SAFE_INTEGER", () => {
    it.each([
      ["0", 0],
      ["9007199254740991", 9007199254740991],
    ])("offset %j -> %d", (input, expected) => {
      expect(parsePagination({ offset: input })).toEqual({
        limit: 50,
        offset: expected,
      });
    });
  });

  describe("P5: rejects offsets beyond Number.MAX_SAFE_INTEGER", () => {
    it.each(["9007199254740992", "99999999999999999999"])(
      "offset %j",
      (input) => {
        expect(parsePagination({ offset: input })).toEqual(OFFSET_ERROR);
      }
    );
  });

  describe("P6: rejects empty strings", () => {
    it("limit \"\"", () => {
      expect(parsePagination({ limit: "" })).toEqual(LIMIT_ERROR);
    });

    it("offset \"\"", () => {
      expect(parsePagination({ offset: "" })).toEqual(OFFSET_ERROR);
    });
  });

  // P7–P11 and P13 apply the same malformed values to both parameters.
  const malformedRows = {
    "P7: rejects decimals and exponents": ["1.5", "10.0", "1e2"],
    "P8: rejects signs": ["+5", "-1", "-0"],
    "P9: rejects spaces and tabs": [" 5", "5 ", "\t5"],
    "P10: rejects line terminators": ["5\n", "5\r\n", "5\r", "\n5"],
    "P11: rejects non-decimal and non-ASCII digits": ["0x10", "abc", "５"],
    "P13: rejects arrays and objects": [["1", "2"], ["1"], { a: "1" }],
  };

  for (const [title, values] of Object.entries(malformedRows)) {
    describe(title, () => {
      it.each(values.map((v) => [v]))("limit %j", (input) => {
        expect(parsePagination({ limit: input })).toEqual(LIMIT_ERROR);
      });

      it.each(values.map((v) => [v]))("offset %j", (input) => {
        expect(parsePagination({ offset: input })).toEqual(OFFSET_ERROR);
      });
    });
  }

  describe("P12: rejects leading zeros except \"0\" itself", () => {
    it.each(["007", "01"])("limit %j", (input) => {
      expect(parsePagination({ limit: input })).toEqual(LIMIT_ERROR);
    });

    it("offset \"00\"", () => {
      expect(parsePagination({ offset: "00" })).toEqual(OFFSET_ERROR);
    });
  });

  it("P14: reports the limit error when both parameters are invalid", () => {
    expect(parsePagination({ limit: "0", offset: "-1" })).toEqual(LIMIT_ERROR);
  });

  it("P15: returns exactly { limit, offset } as numbers with no extra keys", () => {
    const result = parsePagination({ limit: "10", offset: "5" });
    expect(result).toStrictEqual({ limit: 10, offset: 5 });
    expect(Object.keys(result).sort()).toEqual(["limit", "offset"]);
  });
});
