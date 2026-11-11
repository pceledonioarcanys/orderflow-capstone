/**
 * Tests for userService.
 *
 * Current coverage: minimal — only tests the basic getActiveUsers path.
 * TODO: add tests for getUserStats, searchUsers, deactivateUser
 */

// Mock the database module
jest.mock("../../src/config/database", () => ({
  query: jest.fn(),
}));

const db = require("../../src/config/database");
const { getActiveUsers } = require("../../src/services/userService");

describe("userService", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getActiveUsers", () => {
    it("should return only active users", async () => {
      db.query.mockResolvedValue({
        rows: [
          { id: 1, name: "Alice", status: "active", customer_tier: "gold" },
          { id: 2, name: "Bob", status: "inactive", customer_tier: "silver" },
          { id: 3, name: "Carol", status: "active", customer_tier: "bronze" },
        ],
      });

      const result = await getActiveUsers();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Alice");
      expect(result[1].name).toBe("Carol");
    });

    it("should return empty array when no users are active", async () => {
      db.query.mockResolvedValue({
        rows: [
          { id: 1, name: "Dave", status: "inactive", customer_tier: "gold" },
        ],
      });

      const result = await getActiveUsers();
      expect(result).toHaveLength(0);
    });
  });
});
