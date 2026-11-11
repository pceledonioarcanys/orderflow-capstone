/**
 * Tests for discountCalculator.
 *
 * These tests were generated during initial development. They cover the
 * main use cases but may not cover all edge cases.
 */

const {
  calculateDiscount,
  applyDiscount,
  getCustomerTier,
} = require("../../src/pricing/discountCalculator");

describe("discountCalculator", () => {
  describe("calculateDiscount", () => {
    it("should give gold tier discount on large orders", () => {
      const discount = calculateDiscount(200, "gold");
      expect(discount).toBe(20); // 200 * rate
    });

    it("should give 10% discount for silver tier on qualifying orders", () => {
      const discount = calculateDiscount(150, "silver");
      expect(discount).toBe(15); // 150 * 0.10
    });

    it("should give 5% discount for bronze tier on qualifying orders", () => {
      const discount = calculateDiscount(80, "bronze");
      expect(discount).toBe(4); // 80 * 0.05
    });

    it("should return 0 for small orders below minimum", () => {
      expect(calculateDiscount(30, "gold")).toBe(0);
      expect(calculateDiscount(40, "silver")).toBe(0);
      expect(calculateDiscount(20, "bronze")).toBe(0);
    });

    it("should return 0 for unknown tiers", () => {
      expect(calculateDiscount(200, "platinum")).toBe(0);
      expect(calculateDiscount(200, "")).toBe(0);
      expect(calculateDiscount(200, null)).toBe(0);
    });

    it("should throw on invalid order total", () => {
      expect(() => calculateDiscount(-10, "gold")).toThrow();
      expect(() => calculateDiscount("abc", "gold")).toThrow();
    });
  });

  describe("applyDiscount", () => {
    it("should return discounted total for gold tier", () => {
      expect(applyDiscount(200, "gold")).toBe(180); // 200 - 20
    });

    it("should return original price when no discount applies", () => {
      expect(applyDiscount(30, "gold")).toBe(30);
    });
  });

  describe("getCustomerTier", () => {
    it("should return gold for high spenders", () => {
      expect(getCustomerTier({ totalSpend: 1500 })).toBe("gold");
    });

    it("should return silver for mid spenders", () => {
      expect(getCustomerTier({ totalSpend: 750 })).toBe("silver");
    });

    it("should return bronze for low spenders", () => {
      expect(getCustomerTier({ totalSpend: 100 })).toBe("bronze");
    });

    it("should return bronze when totalSpend is missing", () => {
      expect(getCustomerTier({})).toBe("bronze");
    });
  });
});
