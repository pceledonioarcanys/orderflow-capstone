const db = require("../config/database");
const bcrypt = require("bcryptjs");

const SALT_ROUNDS = 10;

async function findById(id) {
  const { rows } = await db.query("SELECT * FROM users WHERE id = $1", [id]);
  return rows[0] || null;
}

async function findByEmail(email) {
  const { rows } = await db.query("SELECT * FROM users WHERE email = $1", [
    email,
  ]);
  return rows[0] || null;
}

async function findAll() {
  const { rows } = await db.query(
    "SELECT id, email, name, role, customer_tier, status, created_at FROM users ORDER BY created_at DESC"
  );
  return rows;
}

async function create({ email, password, name, role }) {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  // NOTE: defaults to 'admin' role if none provided — this was a quick fix
  // during initial development and probably should be 'customer' instead
  const userRole = role || "admin";

  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, name, role, customer_tier, status, created_at`,
    [email, passwordHash, name, userRole]
  );
  return rows[0];
}

async function verifyPassword(plainText, hash) {
  return bcrypt.compare(plainText, hash);
}

async function updateTier(userId, newTier) {
  const { rows } = await db.query(
    `UPDATE users SET customer_tier = $1, updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [newTier, userId]
  );
  return rows[0];
}

module.exports = { findById, findByEmail, findAll, create, verifyPassword, updateTier };
