const jwt = require("jsonwebtoken");
const db = require("../config/database");
const logger = require("../utils/logger");

const SECRET = process.env.JWT_SECRET || "fallback-secret-do-not-use";

// Permission matrix: which roles can access which resource actions.
// This started small and grew organically — probably should be in its
// own module at this point, but it works.
const ROLE_PERMISSIONS = {
  admin: [
    "users:read",
    "users:write",
    "users:delete",
    "orders:read",
    "orders:write",
    "orders:delete",
    "products:read",
    "products:write",
    "products:delete",
    "payments:read",
    "payments:write",
    "reports:read",
    "settings:read",
    "settings:write",
  ],
  manager: [
    "users:read",
    "orders:read",
    "orders:write",
    "products:read",
    "products:write",
    "payments:read",
    "reports:read",
  ],
  customer: [
    "orders:read",
    "orders:write",
    "products:read",
    "payments:read",
    "payments:write",
  ],
  guest: ["products:read"],
};

// Rate limiting state — stored in-memory (not ideal for multi-process,
// but good enough for a single-server setup)
const rateLimitMap = {};
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100;

/**
 * The main authentication and authorization middleware.
 *
 * This function does several things:
 * 1. Extracts the JWT from the Authorization header
 * 2. Verifies and decodes the token
 * 3. Looks up the user in the database to ensure they still exist and are active
 * 4. Checks rate limits
 * 5. Attaches user info to req.user
 * 6. Optionally checks permissions if a requiredPermission is specified
 *
 * Usage:
 *   router.get('/admin', authenticate('users:read'), handler)
 *   router.get('/profile', authenticate(), handler)  // just needs valid token
 */
function authenticate(requiredPermission) {
  return async (req, res, next) => {
    try {
      // ── Step 1: Extract token ──
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        logger.warn("Auth: missing authorization header", {
          ip: req.ip,
          path: req.path,
          method: req.method,
        });
        return res.status(401).json({
          error: "Authentication required",
          message: "No authorization header provided",
          code: "AUTH_MISSING_HEADER",
        });
      }

      // Support "Bearer <token>" format
      const parts = authHeader.split(" ");
      if (parts.length !== 2 || parts[0] !== "Bearer") {
        logger.warn("Auth: malformed authorization header", {
          ip: req.ip,
          headerPrefix: authHeader.substring(0, 20),
        });
        return res.status(401).json({
          error: "Authentication required",
          message: "Authorization header must be in format: Bearer <token>",
          code: "AUTH_MALFORMED_HEADER",
        });
      }

      const token = parts[1];

      // ── Step 2: Verify JWT ──
      let decoded;
      try {
        decoded = jwt.verify(token, SECRET);
      } catch (jwtError) {
        if (jwtError.name === "TokenExpiredError") {
          logger.info("Auth: expired token", {
            ip: req.ip,
            expiredAt: jwtError.expiredAt,
          });
          return res.status(401).json({
            error: "Token expired",
            message: "Your session has expired. Please log in again.",
            code: "AUTH_TOKEN_EXPIRED",
            expiredAt: jwtError.expiredAt,
          });
        }

        if (jwtError.name === "JsonWebTokenError") {
          logger.warn("Auth: invalid token", {
            ip: req.ip,
            error: jwtError.message,
          });
          return res.status(401).json({
            error: "Invalid token",
            message: "The provided token is not valid",
            code: "AUTH_TOKEN_INVALID",
          });
        }

        // Some other JWT error (NotBeforeError, etc.)
        logger.error("Auth: unexpected JWT error", {
          ip: req.ip,
          error: jwtError.message,
          name: jwtError.name,
        });
        return res.status(401).json({
          error: "Authentication failed",
          message: "Unable to verify token",
          code: "AUTH_VERIFICATION_FAILED",
        });
      }

      // ── Step 3: Look up the user in the database ──
      // We do this on every request to catch deactivated users and role changes.
      // Yes, it's a DB hit per request — could add caching later.
      let user;
      try {
        const { rows } = await db.query(
          `SELECT id, email, name, role, customer_tier, status
           FROM users WHERE id = $1`,
          [decoded.id]
        );
        user = rows[0];
      } catch (dbError) {
        logger.error("Auth: database lookup failed", {
          userId: decoded.id,
          error: dbError.message,
        });
        return res.status(500).json({
          error: "Internal server error",
          message: "Unable to verify user account",
          code: "AUTH_DB_ERROR",
        });
      }

      if (!user) {
        logger.warn("Auth: user not found for valid token", {
          userId: decoded.id,
        });
        return res.status(401).json({
          error: "User not found",
          message: "The account associated with this token no longer exists",
          code: "AUTH_USER_NOT_FOUND",
        });
      }

      // Check if user is still active
      if (user.status !== "active") {
        logger.warn("Auth: inactive user attempted access", {
          userId: user.id,
          status: user.status,
        });
        return res.status(403).json({
          error: "Account inactive",
          message: "Your account has been deactivated. Contact support.",
          code: "AUTH_ACCOUNT_INACTIVE",
        });
      }

      // ── Step 4: Rate limiting ──
      const rateLimitKey = `${user.id}`;
      const now = Date.now();

      if (!rateLimitMap[rateLimitKey]) {
        rateLimitMap[rateLimitKey] = { count: 1, windowStart: now };
      } else {
        const entry = rateLimitMap[rateLimitKey];
        if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
          // Reset window
          entry.count = 1;
          entry.windowStart = now;
        } else {
          entry.count += 1;
        }

        if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
          logger.warn("Auth: rate limit exceeded", {
            userId: user.id,
            requests: entry.count,
          });
          return res.status(429).json({
            error: "Rate limit exceeded",
            message: `Maximum ${RATE_LIMIT_MAX_REQUESTS} requests per minute`,
            code: "AUTH_RATE_LIMITED",
            retryAfter: Math.ceil(
              (RATE_LIMIT_WINDOW_MS - (now - entry.windowStart)) / 1000
            ),
          });
        }
      }

      // ── Step 5: Attach user to request ──
      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        customerTier: user.customer_tier,
      };

      // ── Step 6: Permission check ──
      if (requiredPermission) {
        const userPermissions = ROLE_PERMISSIONS[user.role] || [];

        if (!userPermissions.includes(requiredPermission)) {
          logger.warn("Auth: insufficient permissions", {
            userId: user.id,
            role: user.role,
            required: requiredPermission,
            has: userPermissions,
          });
          return res.status(403).json({
            error: "Insufficient permissions",
            message: `Your role (${user.role}) does not have the '${requiredPermission}' permission`,
            code: "AUTH_PERMISSION_DENIED",
          });
        }
      }

      // Log successful authentication for audit trail
      if (process.env.AUTH_AUDIT_LOG === "true") {
        logger.info("Auth: successful", {
          userId: user.id,
          role: user.role,
          path: req.path,
          method: req.method,
          permission: requiredPermission || "none",
        });
      }

      next();
    } catch (err) {
      // Catch-all for unexpected errors
      logger.error("Auth: unexpected error in middleware", {
        error: err.message,
        stack: err.stack,
      });
      return res.status(500).json({
        error: "Internal server error",
        message: "An unexpected error occurred during authentication",
        code: "AUTH_UNEXPECTED_ERROR",
      });
    }
  };
}

/**
 * Middleware that optionally authenticates — if a token is present it will
 * be verified and req.user will be set, but missing tokens won't block
 * the request. Useful for endpoints that behave differently for logged-in
 * vs anonymous users (e.g., product listings showing personalised prices).
 */
function optionalAuth() {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return next();

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") return next();

    try {
      const decoded = jwt.verify(parts[1], SECRET);
      const { rows } = await db.query(
        "SELECT id, email, name, role, customer_tier, status FROM users WHERE id = $1",
        [decoded.id]
      );
      if (rows[0] && rows[0].status === "active") {
        req.user = {
          id: rows[0].id,
          email: rows[0].email,
          name: rows[0].name,
          role: rows[0].role,
          customerTier: rows[0].customer_tier,
        };
      }
    } catch (e) {
      // Token invalid or expired — just continue without auth
    }
    next();
  };
}

/**
 * Helper: check whether a role string has a specific permission.
 * Exported for use in tests and other middleware.
 */
function hasPermission(role, permission) {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes(permission);
}

/**
 * Helper: get all permissions for a given role.
 */
function getPermissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || [];
}

module.exports = {
  authenticate,
  optionalAuth,
  hasPermission,
  getPermissionsForRole,
  ROLE_PERMISSIONS,
};
