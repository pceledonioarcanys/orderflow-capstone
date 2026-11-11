const Order = require("../models/Order");
const Product = require("../models/Product");
const { calculateDiscount } = require("../pricing/discountCalculator");
const { calculateTax } = require("../utils/taxCalculator");
const logger = require("../utils/logger");

/**
 * Create a new order from a list of items.
 *
 * Validates stock, calculates pricing (subtotal, discount, tax, total),
 * and persists the order.
 */
async function createOrder(userId, customerTier, items, shippingState) {
  // Validate all products exist and have enough stock
  const enrichedItems = [];
  for (const item of items) {
    const product = await Product.findById(item.productId);
    if (!product) {
      throw new Error(`Product ${item.productId} not found`);
    }
    if (product.stock < item.quantity) {
      throw new Error(
        `Insufficient stock for ${product.name}: requested ${item.quantity}, available ${product.stock}`
      );
    }
    enrichedItems.push({
      productId: product.id,
      unitPrice: parseFloat(product.price),
      quantity: item.quantity,
    });
  }

  // Calculate subtotal
  const subtotal = enrichedItems.reduce(
    (sum, i) => sum + i.unitPrice * i.quantity,
    0
  );

  const discount = calculateDiscount(subtotal, customerTier);
  const taxableAmount = subtotal - discount;
  const tax = calculateTax(taxableAmount, shippingState);
  const total = taxableAmount + tax;

  // Create the order
  const order = await Order.create({
    userId,
    items: enrichedItems,
    shippingState,
  });

  // Update the order with computed pricing
  const updatedOrder = await Order.update(order.id, {
    discount: Math.round(discount * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    total: Math.round(total * 100) / 100,
  });

  // Decrease stock for each item
  for (const item of enrichedItems) {
    await Product.updateStock(item.productId, -item.quantity);
  }

  logger.info("Order created", {
    orderId: updatedOrder.id,
    userId,
    subtotal,
    discount,
    tax,
    total,
  });

  return updatedOrder;
}

module.exports = { createOrder };
