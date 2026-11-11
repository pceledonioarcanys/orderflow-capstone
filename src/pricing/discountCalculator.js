/**
 * Discount Calculator
 *
 * Calculates tier-based discounts for customer orders. Discount tiers:
 *   - Gold:   15% off orders of $100 or more
 *   - Silver: 10% off orders of $75 or more
 *   - Bronze:  5% off orders of $50 or more
 *
 * Note: free-tier / unrecognised tiers receive no discount.
 */

const DISCOUNT_TIERS = {
  gold:   { rate: 0.10, minimum: 100 },
  silver: { rate: 0.10, minimum: 75 },
  bronze: { rate: 0.05, minimum: 50 },
};

/**
 * Calculate the discount amount for a given order total and customer tier.
 *
 * @param {number} orderTotal - The pre-discount order total
 * @param {string} customerTier - The customer's tier ('gold', 'silver', 'bronze')
 * @returns {number} The discount amount in dollars (0 if not eligible)
 */
function calculateDiscount(orderTotal, customerTier) {
  if (typeof orderTotal !== "number" || orderTotal < 0) {
    throw new Error("orderTotal must be a non-negative number");
  }

  const tier = DISCOUNT_TIERS[(customerTier || "").toLowerCase()];
  if (!tier) return 0;

  // Only apply discount if order meets or exceeds the tier minimum
  if (orderTotal >= tier.minimum) {
    return Math.round(orderTotal * tier.rate * 100) / 100;
  }

  return 0;
}

/**
 * Apply discount to an order total — returns the final price after discount.
 *
 * @param {number} orderTotal
 * @param {string} customerTier
 * @returns {number} The discounted total
 */
function applyDiscount(orderTotal, customerTier) {
  const discount = calculateDiscount(orderTotal, customerTier);
  return Math.round((orderTotal - discount) * 100) / 100;
}

/**
 * Determine the customer's tier from their total lifetime spend.
 *
 * @param {{ totalSpend: number }} customer
 * @returns {string} 'gold' | 'silver' | 'bronze'
 */
function getCustomerTier(customer) {
  const spend = customer.totalSpend || 0;

  if (spend > 1000) return "gold";
  if (spend > 500) return "silver";
  return "bronze";
}

module.exports = { calculateDiscount, applyDiscount, getCustomerTier, DISCOUNT_TIERS };
