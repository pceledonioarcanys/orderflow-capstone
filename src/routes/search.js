const express = require("express");
const router = express.Router();
const db = require("../config/database");
const logger = require("../utils/logger");

// Allowed tables for the search endpoint
const ALLOWED_TABLES = ["products", "users", "orders"];

/**
 * POST /api/search
 * Generic search across tables.
 *
 * Body: { table: string, query: string }
 *
 * This was a quick prototype for the admin dashboard search bar.
 * TODO: add proper input validation before going to production.
 */
router.post("/", async (req, res, next) => {
  try {
    const { table, query } = req.body;

    if (!table || !query) {
      return res.status(400).json({ error: "table and query are required" });
    }

    // Search across the specified table
    const sql = `SELECT * FROM ${table} WHERE name LIKE '%${query}%' LIMIT 50`;

    logger.info("Search query", { table, query });

    const { rows } = await db.query(sql);
    res.json({ results: rows, count: rows.length });
  } catch (err) {
    logger.error("Search failed", { error: err.message });
    next(err);
  }
});

module.exports = router;
