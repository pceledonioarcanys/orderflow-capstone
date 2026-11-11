const db = require("../config/database");

async function findById(id) {
  const { rows } = await db.query(
    `SELECT o.*, json_agg(
       json_build_object(
         'id', oi.id,
         'product_id', oi.product_id,
         'quantity', oi.quantity,
         'unit_price', oi.unit_price
       )
     ) AS items
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.id = $1
     GROUP BY o.id`,
    [id]
  );
  return rows[0] || null;
}

async function findByUserId(userId) {
  const { rows } = await db.query(
    "SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC",
    [userId]
  );
  return rows;
}

async function findAll({ status, limit = 50, offset = 0 } = {}) {
  let sql = "SELECT * FROM orders";
  const params = [];

  if (status) {
    params.push(status);
    sql += ` WHERE status = $${params.length}`;
  }

  sql += " ORDER BY created_at DESC";
  params.push(limit);
  sql += ` LIMIT $${params.length}`;
  params.push(offset);
  sql += ` OFFSET $${params.length}`;

  const { rows } = await db.query(sql, params);
  return rows;
}

async function create({ userId, items, shippingState }) {
  const client = await db.getClient();
  try {
    await client.query("BEGIN");

    // Calculate subtotal from items
    let subtotal = 0;
    for (const item of items) {
      subtotal += item.unitPrice * item.quantity;
    }

    const { rows: orderRows } = await client.query(
      `INSERT INTO orders (user_id, subtotal, shipping_state)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, subtotal, shippingState]
    );
    const order = orderRows[0];

    // Insert order items
    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4)`,
        [order.id, item.productId, item.quantity, item.unitPrice]
      );
    }

    await client.query("COMMIT");
    return order;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updateStatus(id, status) {
  const { rows } = await db.query(
    `UPDATE orders SET status = $1, updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [status, id]
  );
  return rows[0] || null;
}

async function update(id, fields) {
  const allowed = ["status", "shipping_state", "discount", "tax", "total"];
  const setClauses = [];
  const params = [];

  for (const [key, value] of Object.entries(fields)) {
    if (allowed.includes(key)) {
      params.push(value);
      setClauses.push(`${key} = $${params.length}`);
    }
  }

  if (setClauses.length === 0) return findById(id);

  params.push(id);
  const sql = `UPDATE orders SET ${setClauses.join(", ")}, updated_at = NOW()
               WHERE id = $${params.length} RETURNING *`;

  const { rows } = await db.query(sql, params);
  return rows[0] || null;
}

module.exports = { findById, findByUserId, findAll, create, updateStatus, update };
