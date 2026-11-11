/**
 * Simple migration runner — executes SQL files in order.
 * Usage: npm run migrate
 */
const fs = require("fs");
const path = require("path");
const { pool } = require("../src/config/database");

async function runMigrations() {
  const migrationsDir = __dirname;

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`Found ${files.length} migration(s).\n`);

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, "utf-8");

    console.log(`Running: ${file}...`);
    try {
      await pool.query(sql);
      console.log(`  ✓ ${file}`);
    } catch (err) {
      console.error(`  ✗ ${file}: ${err.message}`);
      process.exit(1);
    }
  }

  console.log("\nAll migrations complete.");
  await pool.end();
}

runMigrations();
