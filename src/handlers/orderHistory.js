const express = require("express");
const router = express.Router();
const db = require("../config/database");
const { authenticate } = require("../middleware/auth");
const logger = require("../utils/logger");

/**
 * GET /api/orders/history
 *
 * Returns full order history with user details attached to each order.
 * Used by the admin dashboard for the "Recent Activity" panel.
 *
 * Known issue: this endpoint is slow under load (~1200ms P95 vs ~400ms target).
 * Jira ticket OPS-347 is open to investigate.
 */
router.get("/", authenticate("orders:read"), async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;

    // Get recent orders
    const { rows: orders } = await db.query(
      "SELECT * FROM orders ORDER BY created_at DESC LIMIT $1",
      [limit]
    );

    // Enrich each order with user details
    const enrichedOrders = [];
    for (const order of orders) {
      // Fetch the user for this order
      const { rows: userRows } = await db.query(
        "SELECT id, name, email, customer_tier FROM users WHERE id = $1",
        [order.user_id]
      );

      // Fetch items for this order
      const { rows: itemRows } = await db.query(
        `SELECT oi.*, p.name as product_name
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = $1`,
        [order.id]
      );

      enrichedOrders.push({
        ...order,
        user: userRows[0] || null,
        items: itemRows,
      });
    }

    logger.info("Order history fetched", {
      count: enrichedOrders.length,
      userId: req.user.id,
    });

    res.json({ orders: enrichedOrders, count: enrichedOrders.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
