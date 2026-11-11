'use strict';

const { createOrder } = require('../../src/services/orderService');
const Order = require('../../src/models/Order');
const Product = require('../../src/models/Product');
const { calculateDiscount } = require('../../src/pricing/discountCalculator');
const { calculateTax } = require('../../src/utils/taxCalculator');

jest.mock('../../src/models/Order');
jest.mock('../../src/models/Product');
jest.mock('../../src/pricing/discountCalculator');
jest.mock('../../src/utils/taxCalculator');
jest.mock('../../src/utils/logger', () => ({ info: jest.fn() }));

const makeProduct = (overrides = {}) => ({
  id: 'prod-1',
  name: 'Widget',
  price: '10.00',
  stock: 5,
  ...overrides,
});

describe('createOrder', () => {
  const userId = 'user-1';
  const shippingState = 'CA';

  beforeEach(() => {
    jest.clearAllMocks();
    Product.findById.mockResolvedValue(makeProduct());
    Product.updateStock.mockResolvedValue(undefined);
    Order.create.mockResolvedValue({ id: 'order-1' });
    Order.update.mockImplementation((_id, fields) =>
      Promise.resolve({ id: 'order-1', userId, shippingState, ...fields })
    );
    calculateDiscount.mockReturnValue(0);
    calculateTax.mockReturnValue(1.0);
  });

  // ── Validation ────────────────────────────────────────────────────────────

  describe('validation', () => {
    it('throws when a productId does not resolve to a product', async () => {
      Product.findById.mockResolvedValue(null);

      await expect(
        createOrder(userId, 'standard', [{ productId: 'ghost-id', quantity: 1 }], shippingState)
      ).rejects.toThrow('Product ghost-id not found');
    });

    it('throws when requested quantity exceeds available stock', async () => {
      Product.findById.mockResolvedValue(makeProduct({ name: 'Widget', stock: 2 }));

      await expect(
        createOrder(userId, 'standard', [{ productId: 'prod-1', quantity: 5 }], shippingState)
      ).rejects.toThrow('Insufficient stock for Widget: requested 5, available 2');
    });
  });

  // ── Pricing calculations ──────────────────────────────────────────────────

  describe('pricing calculations', () => {
    it('computes subtotal as sum of (unitPrice × quantity) across all items', async () => {
      Product.findById.mockImplementation((id) => {
        if (id === 'prod-1')
          return Promise.resolve(makeProduct({ id: 'prod-1', price: '10.00', stock: 10 }));
        if (id === 'prod-2')
          return Promise.resolve(makeProduct({ id: 'prod-2', name: 'Gadget', price: '5.00', stock: 10 }));
        return Promise.resolve(null);
      });

      const items = [
        { productId: 'prod-1', quantity: 2 }, // 20.00
        { productId: 'prod-2', quantity: 3 }, // 15.00
      ];
      await createOrder(userId, 'standard', items, shippingState);

      // subtotal = 35, passed to calculateDiscount
      expect(calculateDiscount).toHaveBeenCalledWith(35, 'standard');
    });

    it('passes (subtotal − discount) as the taxable amount to calculateTax', async () => {
      Product.findById.mockResolvedValue(makeProduct({ price: '100.00', stock: 5 }));
      calculateDiscount.mockReturnValue(20); // subtotal 100, discount 20 → taxable 80

      await createOrder(userId, 'gold', [{ productId: 'prod-1', quantity: 1 }], shippingState);

      expect(calculateTax).toHaveBeenCalledWith(80, shippingState);
    });

    it('returns correct totals when the tier carries no discount', async () => {
      // subtotal = 50, discount = 0, tax = 5, total = 55
      Product.findById.mockResolvedValue(makeProduct({ price: '50.00', stock: 5 }));
      calculateDiscount.mockReturnValue(0);
      calculateTax.mockReturnValue(5.0);

      const result = await createOrder(
        userId,
        'standard',
        [{ productId: 'prod-1', quantity: 1 }],
        shippingState
      );

      expect(result.discount).toBe(0);
      expect(result.tax).toBe(5.0);
      expect(result.total).toBe(55.0);
    });

    it('applies tier discount and returns correct totals', async () => {
      // subtotal = 200 (100 × 2), discount = 20, taxable = 180, tax = 16, total = 196
      Product.findById.mockResolvedValue(makeProduct({ price: '100.00', stock: 5 }));
      calculateDiscount.mockReturnValue(20);
      calculateTax.mockReturnValue(16.0);

      const result = await createOrder(
        userId,
        'vip',
        [{ productId: 'prod-1', quantity: 2 }],
        shippingState
      );

      expect(result.discount).toBe(20);
      expect(result.tax).toBe(16.0);
      expect(result.total).toBe(196.0); // (200 - 20) + 16
    });

    it('rounds discount, tax, and total to 2 decimal places', async () => {
      // discount = 100/3 ≈ 33.3333 → 33.33
      // tax     = 50/9  ≈  5.5555 →  5.56
      // total   = 650/9 ≈ 72.2222 → 72.22
      Product.findById.mockResolvedValue(makeProduct({ price: '100.00', stock: 5 }));
      calculateDiscount.mockReturnValue(100 / 3);
      calculateTax.mockReturnValue(50 / 9);

      const result = await createOrder(
        userId,
        'gold',
        [{ productId: 'prod-1', quantity: 1 }],
        shippingState
      );

      expect(result.discount).toBe(33.33);
      expect(result.tax).toBe(5.56);
      expect(result.total).toBe(72.22);
    });
  });

  // ── Side effects ──────────────────────────────────────────────────────────

  describe('side effects', () => {
    it('decrements stock by the ordered quantity for every item', async () => {
      Product.findById.mockImplementation((id) => {
        if (id === 'prod-1')
          return Promise.resolve(makeProduct({ id: 'prod-1', stock: 10 }));
        if (id === 'prod-2')
          return Promise.resolve(makeProduct({ id: 'prod-2', stock: 10 }));
        return Promise.resolve(null);
      });

      await createOrder(
        userId,
        'standard',
        [
          { productId: 'prod-1', quantity: 3 },
          { productId: 'prod-2', quantity: 1 },
        ],
        shippingState
      );

      expect(Product.updateStock).toHaveBeenCalledTimes(2);
      expect(Product.updateStock).toHaveBeenCalledWith('prod-1', -3);
      expect(Product.updateStock).toHaveBeenCalledWith('prod-2', -1);
    });

    it('returns the persisted order object produced by Order.update', async () => {
      const persistedOrder = { id: 'order-99', userId, shippingState, discount: 0, tax: 1, total: 11 };
      Order.update.mockResolvedValue(persistedOrder);

      const result = await createOrder(
        userId,
        'standard',
        [{ productId: 'prod-1', quantity: 1 }],
        shippingState
      );

      expect(result).toBe(persistedOrder);
    });
  });
});
