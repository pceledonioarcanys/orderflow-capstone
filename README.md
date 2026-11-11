# OrderFlow API

A lightweight order management API for a small e-commerce platform. Handles customers, products, orders, and payments.

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Set up the database (PostgreSQL must be running)
npm run migrate
npm run seed

# Start the server
npm run dev
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create a new account |
| POST | `/api/auth/login` | Get a JWT token |
| GET | `/api/users/active` | List active users |
| GET | `/api/products` | List all products |
| GET | `/api/orders` | List orders (auth required) |
| GET | `/api/orders/:id` | Get order details |
| GET | `/api/orders/history` | Full order history |
| PATCH | `/api/orders/:id` | Update an order |
| POST | `/api/orders` | Create an order |
| POST | `/api/payments` | Process a payment |
| POST | `/api/search` | Search across tables |

## Running Tests

```bash
npm test
```

## Project Structure

```
src/
├── index.js              # Entry point
├── config/
│   └── database.js       # DB connection pool
├── middleware/
│   ├── auth.js           # JWT authentication & permissions
│   └── errorHandler.js   # Global error handler
├── models/
│   ├── User.js
│   ├── Product.js
│   ├── Order.js
│   ├── OrderItem.js
│   └── Payment.js
├── routes/
│   ├── auth.js
│   ├── orders.js
│   ├── products.js
│   └── search.js
├── handlers/
│   ├── orderHistory.js
│   └── payment.js
├── services/
│   ├── userService.js
│   └── orderService.js
├── pricing/
│   └── discountCalculator.js
└── utils/
    ├── logger.js
    ├── jwt.js
    ├── taxCalculator.js
    └── batchUserLoader.js
```

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express 4
- **Database**: PostgreSQL 14+
- **Auth**: JWT (jsonwebtoken)
- **Payments**: Stripe API
- **Tests**: Jest + Supertest
