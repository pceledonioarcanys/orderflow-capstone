const db = require("../config/database");

async function findById(id) {
  const { rows } = await db.query("SELECT * FROM payments WHERE id = $1", [id]);
  return rows[0] || null;
}

async function findByOrderId(orderId) {
  const { rows } = await db.query(
    "SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC",
    [orderId]
  );
  return rows;
}

async function create({ orderId, stripePaymentId, amount, status }) {
  const { rows } = await db.query(
    `INSERT INTO payments (order_id, stripe_payment_id, amount, status)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [orderId, stripePaymentId, amount, status || "pending"]
  );
  return rows[0];
}

async function updateStatus(id, status, errorMessage = null) {
  const { rows } = await db.query(
    `UPDATE payments SET status = $1, error_message = $2, updated_at = NOW()
     WHERE id = $3 RETURNING *`,
    [status, errorMessage, id]
  );
  return rows[0] || null;
}

module.exports = { findById, findByOrderId, create, updateStatus };
