/**
 * Direct handler tests for GET /api/products (SPEC.md §7, matrix rows H0–H13).
 *
 * No listening socket: local port binding is blocked in the sandbox, so the
 * real handler is taken from the exported router and called with mocked
 * req/res/next. The real pagination parser and real Product model run; only
 * db.query is mocked. The auth module is mocked solely to check that the route
 * registers what optionalAuth() returns. That mock does not verify real
 * authentication, the Express middleware chain, `qs` parsing or the global
 * error handler (SPEC.md §7.1).
 */

jest.mock("../../src/config/database", () => ({
  query: jest.fn(),
}));

jest.mock("../../src/middleware/auth", () => {
  const sentinel = function optionalAuthSentinel() {
    throw new Error("sentinel must not be executed by these tests");
  };
  return {
    optionalAuth: jest.fn(() => sentinel),
    __sentinel: sentinel,
  };
});

const db = require("../../src/config/database");
const auth = require("../../src/middleware/auth");
const Product = require("../../src/models/Product");
const router = require("../../src/routes/products");

// Captured at load time, before beforeEach clears mock call history.
const optionalAuthCallsAtLoad = auth.optionalAuth.mock.calls.slice();

const listLayer = router.stack.find(
  (l) => l.route && l.route.path === "/" && l.route.methods.get
);
const handler = listLayer.route.stack[listLayer.route.stack.length - 1].handle;

const LIMIT_ERROR = { error: "limit must be an integer between 1 and 100" };
const OFFSET_ERROR = {
  error: "offset must be an integer between 0 and 9007199254740991",
};
const DEFAULT_SQL =
  "SELECT * FROM products WHERE is_active = true ORDER BY name, id LIMIT $1 OFFSET $2";
const CATEGORY_SQL =
  "SELECT * FROM products WHERE is_active = true AND category = $1 ORDER BY name, id LIMIT $2 OFFSET $3";

const norm = (s) => s.replace(/\s+/g, " ").trim();

function makeRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

async function invoke(query) {
  const req = { query, headers: {} };
  const res = makeRes();
  const next = jest.fn();
  await handler(req, res, next);
  return { res, next };
}

function onlyQuery() {
  expect(db.query).toHaveBeenCalledTimes(1);
  const [sql, params] = db.query.mock.calls[0];
  return { sql: norm(sql), params };
}

describe("GET /api/products handler", () => {
  let findAllSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue({ rows: [] });
    findAllSpy = jest.spyOn(Product, "findAll");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function expectRejected(res, next, body) {
    expect(res.status).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(body);
    expect(findAllSpy).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  }

  function expectOk(res, next, body) {
    expect(res.status).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(body);
  }

  it("H0: registers what optionalAuth() returned ahead of the handler", () => {
    expect(optionalAuthCallsAtLoad).toEqual([[]]);
    expect(listLayer).toBeDefined();
    expect(listLayer.route.stack).toHaveLength(2);
    expect(listLayer.route.stack[0].handle).toBe(auth.__sentinel);
    expect(listLayer.route.stack[1].handle).toBe(handler);
    expect(handler).not.toBe(auth.__sentinel);
  });

  it("H1: no params -> default page, count equals products returned", async () => {
    const rows = [
      { id: 1, name: "A" },
      { id: 2, name: "B" },
      { id: 3, name: "C" },
    ];
    db.query.mockResolvedValueOnce({ rows });

    const { res, next } = await invoke({});

    const { sql, params } = onlyQuery();
    expect(sql).toBe(DEFAULT_SQL);
    expect(params).toEqual([50, 0]);
    expectOk(res, next, { products: rows, count: 3 });
  });

  describe("H2: accepts limits below and at the maximum", () => {
    it.each([
      ["99", 99],
      ["100", 100],
    ])("limit %j", async (input, expected) => {
      const { res, next } = await invoke({ limit: input });

      const { sql, params } = onlyQuery();
      expect(sql).toBe(DEFAULT_SQL);
      expect(params).toEqual([expected, 0]);
      expectOk(res, next, { products: [], count: 0 });
    });
  });

  it("H3: limit above the maximum -> 400 with no model or database call", async () => {
    const { res, next } = await invoke({ limit: "101" });
    expectRejected(res, next, LIMIT_ERROR);
  });

  it("H4: limit 0 -> 400 with no model or database call", async () => {
    const { res, next } = await invoke({ limit: "0" });
    expectRejected(res, next, LIMIT_ERROR);
  });

  it("H5: offset beyond Number.MAX_SAFE_INTEGER -> 400", async () => {
    const { res, next } = await invoke({ offset: "9007199254740992" });
    expectRejected(res, next, OFFSET_ERROR);
  });

  describe("H6: array or object limit -> 400", () => {
    it.each([[["1", "2"]], [{ a: "1" }]])("limit %j", async (input) => {
      const { res, next } = await invoke({ limit: input });
      expectRejected(res, next, LIMIT_ERROR);
    });
  });

  it("H7: limit with trailing CRLF -> 400", async () => {
    const { res, next } = await invoke({ limit: "5\r\n" });
    expectRejected(res, next, LIMIT_ERROR);
  });

  it("H8: both parameters invalid -> limit error", async () => {
    const { res, next } = await invoke({ limit: "abc", offset: "-1" });
    expectRejected(res, next, LIMIT_ERROR);
  });

  it("H9: category with limit and offset -> bound in order", async () => {
    const { res, next } = await invoke({
      category: "books",
      limit: "10",
      offset: "20",
    });

    const { sql, params } = onlyQuery();
    expect(sql).toBe(CATEGORY_SQL);
    expect(params).toEqual(["books", 10, 20]);
    expectOk(res, next, { products: [], count: 0 });
  });

  it("H10: empty category means no category filter", async () => {
    const { res, next } = await invoke({ category: "" });

    const { sql, params } = onlyQuery();
    expect(sql).toBe(DEFAULT_SQL);
    expect(params).toEqual([50, 0]);
    expectOk(res, next, { products: [], count: 0 });
  });

  it("H11: offset past the end -> 200 with an empty page", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const { res, next } = await invoke({ offset: "1000" });

    const { sql, params } = onlyQuery();
    expect(sql).toBe(DEFAULT_SQL);
    expect(params).toEqual([50, 1000]);
    expectOk(res, next, { products: [], count: 0 });
  });

  it("H12: database rejection is passed to next(err) without a response", async () => {
    const err = new Error("connection refused");
    db.query.mockRejectedValueOnce(err);

    const { res, next } = await invoke({});

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBe(err);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  // H13 was added after implementation (SPEC.md §8). It is regression coverage
  // for §2.1 (unknown parameters are ignored) and §4 (public callers cannot
  // override activeOnly). activeOnly is "" because "false" is a truthy string
  // and would not catch a route that spreads req.query into the model call.
  it("H13: query values cannot override activeOnly or add model options", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const { res, next } = await invoke({
      category: "books",
      limit: "10",
      offset: "20",
      activeOnly: "",
      foo: "x",
    });

    expect(findAllSpy).toHaveBeenCalledTimes(1);
    expect(findAllSpy.mock.calls[0]).toStrictEqual([
      { category: "books", limit: 10, offset: 20 },
    ]);
    const { sql, params } = onlyQuery();
    expect(sql).toBe(CATEGORY_SQL);
    expect(params).toEqual(["books", 10, 20]);
    expectOk(res, next, { products: [], count: 0 });
  });

  // Additional H13 cases for the same §4 requirement. They catch a route that
  // drops the active filter only for a specific trigger value.
  describe("H13: activeOnly trigger values cannot override public filtering", () => {
    it.each(["false", "0"])("activeOnly %j", async (activeOnly) => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const { res, next } = await invoke({
        category: "books",
        limit: "10",
        offset: "20",
        activeOnly,
        foo: "x",
      });

      expect(findAllSpy).toHaveBeenCalledTimes(1);
      expect(findAllSpy.mock.calls[0]).toStrictEqual([
        { category: "books", limit: 10, offset: 20 },
      ]);
      const { sql, params } = onlyQuery();
      expect(sql).toBe(CATEGORY_SQL);
      expect(params).toEqual(["books", 10, 20]);
      expectOk(res, next, { products: [], count: 0 });
    });
  });
});
