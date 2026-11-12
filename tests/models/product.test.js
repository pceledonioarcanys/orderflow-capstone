/**
 * Tests for Product.findAll SQL (SPEC.md §2.3, matrix rows M1–M6).
 *
 * The real model runs; only db.query is mocked. These tests prove the SQL text
 * and bound parameters SENT to pg. They do not prove how PostgreSQL applies
 * LIMIT/OFFSET, filtering or ordering (SPEC.md §7.1).
 */

jest.mock("../../src/config/database", () => ({
  query: jest.fn(),
}));

const db = require("../../src/config/database");
const Product = require("../../src/models/Product");

const norm = (s) => s.replace(/\s+/g, " ").trim();

function onlyQuery() {
  expect(db.query).toHaveBeenCalledTimes(1);
  const [sql, params] = db.query.mock.calls[0];
  return { sql: norm(sql), params };
}

describe("Product.findAll", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue({ rows: [] });
  });

  it("M1: defaults to active products, ORDER BY name, id, LIMIT 50 OFFSET 0", async () => {
    await Product.findAll({});

    const { sql, params } = onlyQuery();
    expect(sql).toBe(
      "SELECT * FROM products WHERE is_active = true ORDER BY name, id LIMIT $1 OFFSET $2"
    );
    expect(params).toEqual([50, 0]);
  });

  it("M2: binds category, limit and offset in order", async () => {
    await Product.findAll({ category: "books", limit: 10, offset: 20 });

    const { sql, params } = onlyQuery();
    expect(sql).toBe(
      "SELECT * FROM products WHERE is_active = true AND category = $1 ORDER BY name, id LIMIT $2 OFFSET $3"
    );
    expect(params).toEqual(["books", 10, 20]);
  });

  it("M3: activeOnly false omits the is_active predicate but keeps the default limit", async () => {
    await Product.findAll({ activeOnly: false });

    const { sql, params } = onlyQuery();
    expect(sql).toBe(
      "SELECT * FROM products ORDER BY name, id LIMIT $1 OFFSET $2"
    );
    expect(params).toEqual([50, 0]);
  });

  it("M4: activeOnly false with a category filters by category only", async () => {
    await Product.findAll({ activeOnly: false, category: "books" });

    const { sql, params } = onlyQuery();
    expect(sql).toBe(
      "SELECT * FROM products WHERE category = $1 ORDER BY name, id LIMIT $2 OFFSET $3"
    );
    expect(params).toEqual(["books", 50, 0]);
  });

  it("M5: never writes limit or offset values into the SQL text", async () => {
    await Product.findAll({ limit: 7, offset: 13 });

    const { sql, params } = onlyQuery();
    expect(sql).not.toContain("7");
    expect(sql).not.toContain("13");
    expect(sql).toBe(
      "SELECT * FROM products WHERE is_active = true ORDER BY name, id LIMIT $1 OFFSET $2"
    );
    expect(params).toEqual([7, 13]);
  });

  it("M6: returns the rows from the database unchanged", async () => {
    const rows = [
      { id: 1, name: "Alpha" },
      { id: 2, name: "Beta" },
    ];
    db.query.mockResolvedValueOnce({ rows });

    await expect(Product.findAll({})).resolves.toBe(rows);
  });
});
