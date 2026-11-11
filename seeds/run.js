/**
 * Seed the database with sample data for development and training exercises.
 * Usage: npm run seed
 */
const bcrypt = require("bcryptjs");
const { pool } = require("../src/config/database");

async function seed() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // ── Users ──
    const passwordHash = await bcrypt.hash("password123", 10);

    await client.query(`
      INSERT INTO users (email, password_hash, name, role, customer_tier, status)
      VALUES
        ('admin@orderflow.dev',   $1, 'Admin User',     'admin',    'gold',   'active'),
        ('alice@example.com',     $1, 'Alice Johnson',   'customer', 'gold',   'active'),
        ('bob@example.com',       $1, 'Bob Smith',       'customer', 'silver', 'active'),
        ('carol@example.com',     $1, 'Carol Williams',  'customer', 'bronze', 'active'),
        ('dave@example.com',      $1, 'Dave Brown',      'customer', 'gold',   'inactive'),
        ('eve@example.com',       $1, 'Eve Davis',       'customer', 'silver', 'active'),
        ('frank@example.com',     $1, 'Frank Miller',    'customer', 'bronze', 'active'),
        ('grace@example.com',     $1, 'Grace Wilson',    'customer', 'gold',   'active'),
        ('hank@example.com',      $1, 'Hank Moore',      'customer', NULL,     'active'),
        ('ivy@example.com',       $1, 'Ivy Taylor',      'customer', 'silver', NULL)
      ON CONFLICT (email) DO NOTHING
    `, [passwordHash]);

    // ── Products ──
    await client.query(`
      INSERT INTO products (name, description, price, sku, stock, category)
      VALUES
        ('Wireless Mouse',      'Ergonomic wireless mouse with USB-C receiver',  29.99, 'ELEC-001', 150, 'electronics'),
        ('Mechanical Keyboard', 'Cherry MX Blue switches, full-size',            89.99, 'ELEC-002',  75, 'electronics'),
        ('USB-C Hub',           '7-in-1 USB-C hub with HDMI and ethernet',       49.99, 'ELEC-003', 200, 'electronics'),
        ('Laptop Stand',        'Adjustable aluminum laptop stand',              39.99, 'ACCS-001', 120, 'accessories'),
        ('Webcam HD',           '1080p webcam with built-in microphone',          59.99, 'ELEC-004',  90, 'electronics'),
        ('Desk Pad',            'Large leather desk pad, 900x400mm',             24.99, 'ACCS-002', 300, 'accessories'),
        ('Monitor Light',       'Screen-mounted LED light bar',                  44.99, 'LIGHT-001', 60, 'lighting'),
        ('Cable Organizer',     'Silicone cable management clips, pack of 10',    9.99, 'ACCS-003', 500, 'accessories'),
        ('Noise-Cancel Headset','Over-ear headset with ANC',                    129.99, 'ELEC-005',  40, 'electronics'),
        ('Standing Mat',        'Anti-fatigue standing desk mat',                34.99, 'ACCS-004',  80, 'accessories')
      ON CONFLICT (sku) DO NOTHING
    `);

    // ── Orders ──
    await client.query(`
      INSERT INTO orders (user_id, status, subtotal, tax, discount, total, shipping_state)
      VALUES
        (2, 'completed',  119.98, 8.70, 0,    128.68, 'CA'),
        (2, 'completed',   89.99, 7.20, 13.50, 83.69, 'CA'),
        (3, 'pending',     79.98, 5.00, 0,     84.98, 'TX'),
        (3, 'completed',  129.99, 8.12, 6.50, 131.61, 'TX'),
        (4, 'shipped',     34.98, 2.10, 0,     37.08, 'FL'),
        (6, 'pending',    259.97, 16.90, 26.00,250.87, 'NY'),
        (7, 'completed',   24.99, 1.25, 0,     26.24, 'OR'),
        (8, 'completed',  179.98, 13.05, 27.00,165.03, 'CA'),
        (8, 'pending',     49.99, 3.62, 0,     53.61, 'CA'),
        (2, 'cancelled',   59.99, 4.35, 0,     64.34, 'CA')
      ON CONFLICT DO NOTHING
    `);

    // ── Order Items ──
    await client.query(`
      INSERT INTO order_items (order_id, product_id, quantity, unit_price)
      VALUES
        (1, 1, 1, 29.99),
        (1, 3, 1, 49.99),
        (1, 4, 1, 39.99),
        (2, 2, 1, 89.99),
        (3, 4, 1, 39.99),
        (3, 4, 1, 39.99),
        (4, 9, 1, 129.99),
        (5, 6, 1, 24.99),
        (5, 8, 1, 9.99),
        (6, 9, 1, 129.99),
        (6, 5, 1, 59.99),
        (6, 2, 1, 89.99),
        (7, 6, 1, 24.99),
        (8, 2, 1, 89.99),
        (8, 5, 1, 59.99),
        (8, 1, 1, 29.99),
        (9, 3, 1, 49.99),
        (10, 5, 1, 59.99)
      ON CONFLICT DO NOTHING
    `);

    // ── Payments ──
    await client.query(`
      INSERT INTO payments (order_id, stripe_payment_id, amount, status)
      VALUES
        (1, 'pi_test_001', 128.68, 'succeeded'),
        (2, 'pi_test_002',  83.69, 'succeeded'),
        (4, 'pi_test_003', 131.61, 'succeeded'),
        (5, 'pi_test_004',  37.08, 'succeeded'),
        (7, 'pi_test_005',  26.24, 'succeeded'),
        (8, 'pi_test_006', 165.03, 'succeeded'),
        (10, 'pi_test_007', 64.34, 'refunded')
      ON CONFLICT DO NOTHING
    `);

    // ── Activity Logs ──
    await client.query(`
      INSERT INTO activity_logs (user_id, action, entity_type, entity_id, metadata)
      VALUES
        (2, 'order.created',   'order', 1, '{"source": "web"}'),
        (2, 'order.completed', 'order', 1, '{}'),
        (2, 'order.created',   'order', 2, '{"source": "web"}'),
        (3, 'order.created',   'order', 3, '{"source": "mobile"}'),
        (4, 'order.created',   'order', 5, '{"source": "web"}'),
        (1, 'user.created',    'user',  6, '{"invited_by": "admin"}'),
        (8, 'order.created',   'order', 8, '{"source": "web"}'),
        (8, 'order.created',   'order', 9, '{"source": "web"}'),
        (2, 'order.cancelled', 'order', 10, '{"reason": "changed mind"}')
      ON CONFLICT DO NOTHING
    `);

    await client.query("COMMIT");
    console.log("✓ Seed data inserted successfully.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
