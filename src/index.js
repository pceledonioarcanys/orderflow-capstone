require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const errorHandler = require("./middleware/errorHandler");
const logger = require("./utils/logger");

// Route imports
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const productRoutes = require("./routes/products");
const orderRoutes = require("./routes/orders");
const searchRoutes = require("./routes/search");
const paymentHandler = require("./handlers/payment");
const orderHistoryHandler = require("./handlers/orderHistory");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Core middleware ──
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// ── Health check ──
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── API routes ──
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders/history", orderHistoryHandler);
app.use("/api/orders", orderRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/payments", paymentHandler);

// ── 404 handler ──
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ── Global error handler ──
app.use(errorHandler);

// ── Start server ──
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`OrderFlow API running on port ${PORT}`);
    console.log(`\n  🚀 OrderFlow API → http://localhost:${PORT}\n`);
  });
}

module.exports = app;
