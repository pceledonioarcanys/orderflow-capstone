const db = require("../config/database");

/**
 * Load multiple users in a single query instead of one-by-one.
 *
 * This utility exists to solve the classic N+1 problem: instead of
 * running SELECT * FROM users WHERE id = $1 inside a loop, pass all
 * the IDs here and get a Map back.
 *
 * @param {number[]} userIds - Array of user IDs to load
 * @returns {Promise<Map<number, object>>} Map of userId → user row
 */
async function loadUsersByIds(userIds) {
  if (!userIds || userIds.length === 0) return new Map();

  const unique = [...new Set(userIds)];
  const placeholders = unique.map((_, i) => `$${i + 1}`).join(", ");

  const { rows } = await db.query(
    `SELECT id, email, name, role, customer_tier, created_at
     FROM users
     WHERE id IN (${placeholders})`,
    unique
  );

  const map = new Map();
  for (const row of rows) {
    map.set(row.id, row);
  }
  return map;
}

module.exports = { loadUsersByIds };
