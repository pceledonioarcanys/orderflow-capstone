const {
  getTaxRate,
  calculateTax,
  calculateTotalWithTax,
} = require("../../src/utils/taxCalculator");

describe("taxCalculator", () => {
  describe("getTaxRate", () => {
    it("should return correct rate for known states", () => {
      expect(getTaxRate("CA")).toBe(0.0725);
      expect(getTaxRate("NY")).toBe(0.08);
      expect(getTaxRate("OR")).toBe(0.0);
    });

    it("should return default rate for unknown states", () => {
      expect(getTaxRate("ZZ")).toBe(0.05);
    });

    it("should be case-insensitive", () => {
      expect(getTaxRate("ca")).toBe(0.0725);
    });
  });

  describe("calculateTax", () => {
    it("should calculate tax correctly", () => {
      expect(calculateTax(100, "CA")).toBe(7.25);
      expect(calculateTax(100, "OR")).toBe(0);
    });

    it("should throw on negative subtotal", () => {
      expect(() => calculateTax(-50, "CA")).toThrow();
    });
  });

  describe("calculateTotalWithTax", () => {
    it("should add tax to subtotal", () => {
      expect(calculateTotalWithTax(100, "CA")).toBe(107.25);
    });
  });
});
