const { calculateTax } = require("../utils/taxCalculator");

/**
 * In-memory cart model.
 *
 * Used to build up an order before checkout. Each cart belongs to a
 * user session and holds items, an optional coupon, and a shipping state
 * for tax calculation.
 */
class Cart {
  constructor(shippingState = "CA") {
    this.items = [];
    this.coupon = null;
    this.shippingState = shippingState;
  }

  /**
   * Add a product to the cart.
   * If the product already exists (by productId), increase its quantity.
   */
  addItem(productId, name, unitPrice, quantity = 1) {
    if (quantity <= 0) throw new Error("Quantity must be positive");
    if (unitPrice < 0) throw new Error("Price cannot be negative");

    const existing = this.items.find((i) => i.productId === productId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this.items.push({ productId, name, unitPrice, quantity });
    }
  }

  /**
   * Remove an item from the cart by productId.
   */
  removeItem(productId) {
    this.items = this.items.filter((i) => i.productId !== productId);
  }

  /**
   * Apply a coupon code. Only one coupon at a time is supported.
   * Coupon shape: { code: string, type: 'percent' | 'fixed', value: number }
   */
  applyCoupon(coupon) {
    if (!coupon || !coupon.code) throw new Error("Invalid coupon");
    if (!["percent", "fixed"].includes(coupon.type)) {
      throw new Error("Coupon type must be 'percent' or 'fixed'");
    }
    if (coupon.type === "percent" && (coupon.value < 0 || coupon.value > 100)) {
      throw new Error("Percent coupon must be between 0 and 100");
    }
    this.coupon = coupon;
  }

  /**
   * Get the subtotal (sum of item prices × quantities, before tax/coupon).
   */
  getSubtotal() {
    return this.items.reduce((sum, item) => {
      return sum + item.unitPrice * item.quantity;
    }, 0);
  }

  /**
   * Get the coupon discount amount.
   */
  getCouponDiscount() {
    if (!this.coupon) return 0;
    const subtotal = this.getSubtotal();

    if (this.coupon.type === "percent") {
      return Math.round(subtotal * (this.coupon.value / 100) * 100) / 100;
    }
    // Fixed discount — cannot exceed subtotal
    return Math.min(this.coupon.value, subtotal);
  }

  /**
   * Calculate the full total: subtotal - coupon discount + tax.
   */
  calculateTotal() {
    const subtotal = this.getSubtotal();
    const couponDiscount = this.getCouponDiscount();
    const taxableAmount = subtotal - couponDiscount;
    const tax = calculateTax(taxableAmount, this.shippingState);

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      couponDiscount: Math.round(couponDiscount * 100) / 100,
      tax,
      total: Math.round((taxableAmount + tax) * 100) / 100,
      itemCount: this.items.reduce((sum, i) => sum + i.quantity, 0),
    };
  }

  /**
   * Clear all items and the coupon.
   */
  clear() {
    this.items = [];
    this.coupon = null;
  }
}

module.exports = Cart;
