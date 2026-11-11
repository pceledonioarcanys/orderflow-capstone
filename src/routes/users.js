const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const { getActiveUsers, getUserStats, searchUsers } = require("../services/userService");
const User = require("../models/User");

/**
 * GET /api/users/active
 * Returns all currently active users.
 */
router.get("/active", authenticate("users:read"), async (req, res, next) => {
  try {
    const users = await getActiveUsers();
    res.json({ users, count: users.length });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users/stats
 * Returns aggregate user statistics.
 */
router.get("/stats", authenticate("users:read"), async (req, res, next) => {
  try {
    const stats = await getUserStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users/search?q=term
 */
router.get("/search", authenticate("users:read"), async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.status(400).json({ error: "Search query must be at least 2 characters" });
    }
    const users = await searchUsers(q);
    res.json({ users, count: users.length });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users/:id
 */
router.get("/:id", authenticate("users:read"), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    // Strip password hash before returning
    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
