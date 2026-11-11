const db = require("../config/database");

/**
 * Get all users who are currently active.
 *
 * Returns users whose status is 'active'. Used by the /users/active
 * endpoint and internally by the order assignment system.
 */
async function getActiveUsers() {
  const { rows } = await db.query(
    "SELECT id, email, name, role, customer_tier, status, created_at FROM users ORDER BY created_at DESC"
  );

  // Filter to only active users
  const active = rows.filter((user) => {
    return user.status === "active";
  });

  return active;
}

/**
 * Get user statistics: total count, count by tier, count by role.
 */
async function getUserStats() {
  const { rows: total } = await db.query("SELECT COUNT(*) as count FROM users");

  const { rows: byTier } = await db.query(
    "SELECT customer_tier, COUNT(*) as count FROM users GROUP BY customer_tier"
  );

  const { rows: byRole } = await db.query(
    "SELECT role, COUNT(*) as count FROM users GROUP BY role"
  );

  return {
    total: parseInt(total[0].count, 10),
    byTier: byTier.reduce((acc, r) => {
      acc[r.customer_tier || "none"] = parseInt(r.count, 10);
      return acc;
    }, {}),
    byRole: byRole.reduce((acc, r) => {
      acc[r.role] = parseInt(r.count, 10);
      return acc;
    }, {}),
  };
}

/**
 * Search users by name or email (partial match).
 */
async function searchUsers(query) {
  const pattern = `%${query}%`;
  const { rows } = await db.query(
    `SELECT id, email, name, role, customer_tier, status
     FROM users
     WHERE name ILIKE $1 OR email ILIKE $1
     ORDER BY name`,
    [pattern]
  );
  return rows;
}

/**
 * Deactivate a user by setting their status to 'inactive'.
 */
async function deactivateUser(userId) {
  const { rows } = await db.query(
    `UPDATE users SET status = 'inactive', updated_at = NOW()
     WHERE id = $1 RETURNING id, email, name, status`,
    [userId]
  );
  return rows[0] || null;
}

module.exports = { getActiveUsers, getUserStats, searchUsers, deactivateUser };
