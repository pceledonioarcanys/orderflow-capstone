const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const db = require("../config/database");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const { authenticate } = require("../middleware/auth");
const logger = require("../utils/logger");

/**
 * POST /api/payments
 * Process a payment for an order via Stripe.
 *
 * Body: { orderId: number, paymentMethodId: string }
 *
 * This handler was written during the initial sprint and handles the
 * happy path well. Error scenarios (timeouts, declines, partial failures)
 * still need hardening — see the TODO comments below.
 */
router.post("/", authenticate("payments:write"), async (req, res, next) => {
  try {
    const { orderId, paymentMethodId } = req.body;

    if (!orderId || !paymentMethodId) {
      return res
        .status(400)
        .json({ error: "orderId and paymentMethodId are required" });
    }

    // Look up the order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.user_id !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ error: "Not your order" });
    }

    if (order.status === "completed") {
      return res.status(400).json({ error: "Order already paid" });
    }

    // Create a payment intent with Stripe
    // TODO: add a timeout — if Stripe hangs we currently wait forever
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(parseFloat(order.total) * 100), // cents
      currency: "usd",
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
    });

    // Log the payment in our database
    // TODO: what if this DB write fails after Stripe already charged?
    const payment = await Payment.create({
      orderId: order.id,
      stripePaymentId: paymentIntent.id,
      amount: parseFloat(order.total),
      status: paymentIntent.status === "succeeded" ? "succeeded" : "pending",
    });

    // Update order status
    if (paymentIntent.status === "succeeded") {
      await Order.updateStatus(order.id, "completed");
    }

    res.json({
      payment: {
        id: payment.id,
        status: payment.status,
        stripeId: paymentIntent.id,
      },
    });
  } catch (err) {
    // TODO: distinguish between card declines and system errors
    // Right now everything gets a generic 500
    logger.error("Payment failed", { error: err.message });
    return res.status(500).json({ error: "Payment processing failed" });
  }
});

/**
 * GET /api/payments/:orderId
 * Get payment history for an order.
 */
router.get("/:orderId", authenticate("payments:read"), async (req, res, next) => {
  try {
    const payments = await Payment.findByOrderId(req.params.orderId);
    res.json({ payments });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
