const db = require("../config/database");
const { DEFAULT_LIMIT } = require("../utils/pagination");

async function findAll({
  category,
  activeOnly = true,
  limit = DEFAULT_LIMIT,
  offset = 0,
} = {}) {
  let sql = "SELECT * FROM products";
  const params = [];
  const conditions = [];

  if (activeOnly) {
    conditions.push("is_active = true");
  }
  if (category) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }
  sql += " ORDER BY name, id";

  params.push(limit);
  sql += ` LIMIT $${params.length}`;
  params.push(offset);
  sql += ` OFFSET $${params.length}`;

  const { rows } = await db.query(sql, params);
  return rows;
}

async function findById(id) {
  const { rows } = await db.query("SELECT * FROM products WHERE id = $1", [id]);
  return rows[0] || null;
}

async function findBySku(sku) {
  const { rows } = await db.query("SELECT * FROM products WHERE sku = $1", [
    sku,
  ]);
  return rows[0] || null;
}

async function updateStock(productId, quantityDelta) {
  const { rows } = await db.query(
    `UPDATE products
     SET stock = stock + $1, updated_at = NOW()
     WHERE id = $2 AND stock + $1 >= 0
     RETURNING *`,
    [quantityDelta, productId]
  );
  return rows[0] || null;
}

module.exports = { findAll, findById, findBySku, updateStock };
