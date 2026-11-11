/**
 * Tax calculation utility.
 *
 * Applies region-based tax rates to order subtotals. Currently supports
 * a simplified US-only model with flat state tax rates.
 */

const TAX_RATES = {
  CA: 0.0725,
  NY: 0.08,
  TX: 0.0625,
  FL: 0.06,
  WA: 0.065,
  OR: 0.0, // Oregon has no sales tax
  DEFAULT: 0.05,
};

function getTaxRate(stateCode) {
  const code = (stateCode || "").toUpperCase().trim();
  return TAX_RATES[code] !== undefined ? TAX_RATES[code] : TAX_RATES.DEFAULT;
}

function calculateTax(subtotal, stateCode) {
  if (typeof subtotal !== "number" || subtotal < 0) {
    throw new Error("Subtotal must be a non-negative number");
  }
  const rate = getTaxRate(stateCode);
  return Math.round(subtotal * rate * 100) / 100;
}

function calculateTotalWithTax(subtotal, stateCode) {
  const tax = calculateTax(subtotal, stateCode);
  return Math.round((subtotal + tax) * 100) / 100;
}

module.exports = { getTaxRate, calculateTax, calculateTotalWithTax, TAX_RATES };
