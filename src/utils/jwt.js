const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "fallback-secret-do-not-use";
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h";

/**
 * Sign a new JWT for the given user payload.
 */
function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

/**
 * Verify and decode a JWT. Throws on invalid/expired tokens.
 */
function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { signToken, verifyToken };
