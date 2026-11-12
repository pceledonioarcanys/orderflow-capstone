const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const { optionalAuth } = require("../middleware/auth");
const { parsePagination } = require("../utils/pagination");

/**
 * GET /api/products
 * List active products, one page at a time, ordered by name then id.
 * Optional ?category= filter. Pagination: ?limit= (1–100, default 50) and
 * ?offset= (default 0). Invalid values return 400. count is the page length.
 */
router.get("/", optionalAuth(), async (req, res, next) => {
  try {
    const { category } = req.query;
    const pagination = parsePagination(req.query);
    if (pagination.error) {
      return res.status(400).json({ error: pagination.error });
    }

    const { limit, offset } = pagination;
    const products = await Product.findAll({ category, limit, offset });
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
