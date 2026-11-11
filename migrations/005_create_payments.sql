-- Migration 005: Create payments table
CREATE TABLE IF NOT EXISTS payments (
  id                SERIAL PRIMARY KEY,
  order_id          INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  stripe_payment_id VARCHAR(255),
  amount            DECIMAL(10, 2) NOT NULL,
  currency          VARCHAR(3) DEFAULT 'usd',
  status            VARCHAR(50) DEFAULT 'pending',
  error_message     TEXT,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);
