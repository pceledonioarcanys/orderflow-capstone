const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const { optionalAuth } = require("../middleware/auth");

/**
 * GET /api/products
 * List all active products. Optional ?category= filter.
 */
router.get("/", optionalAuth(), async (req, res, next) => {
  try {
    const { category } = req.query;
    const products = await Product.findAll({ category });
    res.json({ products, count: products.length });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/products/:id
 */
router.get("/:id", async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json({ product });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
