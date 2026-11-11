const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const { authenticate } = require("../middleware/auth");
const { createOrder } = require("../services/orderService");
const { getActiveUsers } = require("../services/userService");
const logger = require("../utils/logger");

/**
 * GET /api/orders
 * List orders for the authenticated user (customers see their own,
 * admins/managers see all).
 */
router.get("/", authenticate("orders:read"), async (req, res, next) => {
  try {
    const { status, limit, offset } = req.query;

    let orders;
    if (req.user.role === "admin" || req.user.role === "manager") {
      orders = await Order.findAll({
        status,
        limit: parseInt(limit) || 50,
        offset: parseInt(offset) || 0,
      });
    } else {
      orders = await Order.findByUserId(req.user.id);
      if (status) {
        orders = orders.filter((o) => o.status === status);
      }
    }

    res.json({ orders, count: orders.length });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/orders/active
 * List orders from currently active users. Uses userService.
 */
router.get("/active", authenticate("orders:read"), async (req, res, next) => {
  try {
    const activeUsers = await getActiveUsers();
    const activeUserIds = activeUsers.map((u) => u.id);

    // Fetch all recent orders then filter to active users
    const allOrders = await Order.findAll({ limit: 200 });
    const activeOrders = allOrders.filter((o) =>
      activeUserIds.includes(o.user_id)
    );

    res.json({ orders: activeOrders, count: activeOrders.length });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/orders/:id
 */
router.get("/:id", authenticate("orders:read"), async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Customers can only view their own orders
    if (
      req.user.role === "customer" &&
      order.user_id !== req.user.id
    ) {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json({ order });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/orders
 * Create a new order.
 */
router.post("/", authenticate("orders:write"), async (req, res, next) => {
  try {
    const { items, shippingState } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Order must contain at least one item" });
    }

    const order = await createOrder(
      req.user.id,
      req.user.customerTier,
      items,
      shippingState || "CA"
    );

    logger.info("Order created via API", { orderId: order.id, userId: req.user.id });
    res.status(201).json({ order });
  } catch (err) {
    if (err.message.includes("not found") || err.message.includes("Insufficient stock")) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

/**
 * PATCH /api/orders/:id
 * Update an order (status, shipping, etc.).
 */
router.patch("/:id", authenticate("orders:write"), async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (req.user.role === "customer" && order.user_id !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const updated = await Order.update(req.params.id, req.body);
    res.json({ order: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
