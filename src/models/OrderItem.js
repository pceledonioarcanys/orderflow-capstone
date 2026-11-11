const db = require("../config/database");

async function findByOrderId(orderId) {
  const { rows } = await db.query(
    `SELECT oi.*, p.name AS product_name, p.sku
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1`,
    [orderId]
  );
  return rows;
}

async function create({ orderId, productId, quantity, unitPrice }) {
  const { rows } = await db.query(
    `INSERT INTO order_items (order_id, product_id, quantity, unit_price)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [orderId, productId, quantity, unitPrice]
  );
  return rows[0];
}

module.exports = { findByOrderId, create };
