/**
 * Tests for Cart model.
 *
 * Coverage: basic add/remove functionality only.
 * TODO: test applyCoupon, calculateTotal, edge cases
 */

const Cart = require("../../src/models/Cart");

describe("Cart", () => {
  let cart;

  beforeEach(() => {
    cart = new Cart("CA");
  });

  it("should start empty", () => {
    expect(cart.items).toHaveLength(0);
    expect(cart.coupon).toBeNull();
  });

  it("should add items", () => {
    cart.addItem(1, "Wireless Mouse", 29.99, 2);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(2);
  });

  it("should increase quantity for existing items", () => {
    cart.addItem(1, "Wireless Mouse", 29.99, 1);
    cart.addItem(1, "Wireless Mouse", 29.99, 3);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(4);
  });

  it("should remove items by productId", () => {
    cart.addItem(1, "Mouse", 29.99);
    cart.addItem(2, "Keyboard", 89.99);
    cart.removeItem(1);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].productId).toBe(2);
  });

  it("should calculate subtotal", () => {
    cart.addItem(1, "Mouse", 29.99, 2);
    cart.addItem(2, "Keyboard", 89.99, 1);
    expect(cart.getSubtotal()).toBeCloseTo(149.97, 2);
  });
});
