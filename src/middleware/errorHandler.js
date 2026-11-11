const logger = require("../utils/logger");

/**
 * Global error-handling middleware.
 *
 * Must be the last middleware registered with app.use(). Express
 * recognises it as an error handler because it has 4 parameters.
 */
function errorHandler(err, req, res, _next) {
  logger.error("Unhandled error", {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Don't leak stack traces in production
  const isDev = process.env.NODE_ENV !== "production";

  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
    ...(isDev && { stack: err.stack }),
  });
}

module.exports = errorHandler;
