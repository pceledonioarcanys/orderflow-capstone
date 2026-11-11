/**
 * Tests for auth middleware.
 *
 * Covers token extraction and basic verification.
 * Does NOT test: rate limiting, permission checks, optionalAuth, DB failures.
 */

jest.mock("../../src/config/database", () => ({
  query: jest.fn(),
}));

const jwt = require("jsonwebtoken");
const db = require("../../src/config/database");
const { authenticate, hasPermission, getPermissionsForRole } = require("../../src/middleware/auth");

const SECRET = process.env.JWT_SECRET || "fallback-secret-do-not-use";

function mockReqRes(token) {
  return {
    req: {
      headers: { authorization: token ? `Bearer ${token}` : undefined },
      ip: "127.0.0.1",
      path: "/test",
      method: "GET",
    },
    res: {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    },
    next: jest.fn(),
  };
}

describe("auth middleware", () => {
  afterEach(() => jest.clearAllMocks());

  describe("authenticate()", () => {
    it("should reject requests with no auth header", async () => {
      const { req, res, next } = mockReqRes(null);
      const middleware = authenticate();
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it("should reject invalid tokens", async () => {
      const { req, res, next } = mockReqRes("garbage-token");
      const middleware = authenticate();
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it("should accept valid token and attach user", async () => {
      const token = jwt.sign({ id: 1, email: "test@test.com", role: "admin" }, SECRET);
      db.query.mockResolvedValue({
        rows: [{ id: 1, email: "test@test.com", name: "Test", role: "admin", customer_tier: "gold", status: "active" }],
      });

      const { req, res, next } = mockReqRes(token);
      const middleware = authenticate();
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user.id).toBe(1);
      expect(req.user.role).toBe("admin");
    });

    it("should reject inactive users", async () => {
      const token = jwt.sign({ id: 5, email: "inactive@test.com", role: "customer" }, SECRET);
      db.query.mockResolvedValue({
        rows: [{ id: 5, email: "inactive@test.com", name: "Inactive", role: "customer", customer_tier: "bronze", status: "inactive" }],
      });

      const { req, res, next } = mockReqRes(token);
      const middleware = authenticate();
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("hasPermission()", () => {
    it("should return true for admin with users:read", () => {
      expect(hasPermission("admin", "users:read")).toBe(true);
    });

    it("should return false for customer with users:read", () => {
      expect(hasPermission("customer", "users:read")).toBe(false);
    });

    it("should return false for unknown roles", () => {
      expect(hasPermission("superadmin", "users:read")).toBe(false);
    });
  });

  describe("getPermissionsForRole()", () => {
    it("should return all admin permissions", () => {
      const perms = getPermissionsForRole("admin");
      expect(perms.length).toBeGreaterThan(10);
      expect(perms).toContain("settings:write");
    });

    it("should return empty for unknown role", () => {
      expect(getPermissionsForRole("hacker")).toEqual([]);
    });
  });
});
