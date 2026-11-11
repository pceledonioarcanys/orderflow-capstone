-- Migration 003: Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status        VARCHAR(50) DEFAULT 'pending',
  subtotal      DECIMAL(10, 2) DEFAULT 0,
  tax           DECIMAL(10, 2) DEFAULT 0,
  discount      DECIMAL(10, 2) DEFAULT 0,
  total         DECIMAL(10, 2) DEFAULT 0,
  shipping_state VARCHAR(2),
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
