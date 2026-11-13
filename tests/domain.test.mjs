import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteCart, canTransition, availableStock } from '../domain.mjs';

test('quote uses paise, coupon, and free shipping after discount', () => {
  assert.deepEqual(quoteCart([{ price: 18000, quantity: 3 }], { type: 'percent', value: 10, max: 4000 }, 49900, 6000), {
    subtotal: 54000, discount: 4000, shipping: 0, total: 50000
  });
});

test('fixed coupon never makes merchandise negative', () => {
  assert.equal(quoteCart([{ price: 1000, quantity: 1 }], { type: 'fixed', value: 5000 }, 99999, 6000).total, 0);
});

test('active reservations reduce sellable inventory', () => {
  assert.equal(availableStock(5, [{ status: 'ACTIVE', quantity: 2 }, { status: 'EXPIRED', quantity: 2 }]), 3);
});

test('order state machine rejects backwards transitions', () => {
  assert.equal(canTransition('PACKED', 'SHIPPED', 'FULFILLMENT_STAFF'), true);
  assert.equal(canTransition('DELIVERED', 'PACKED', 'OWNER'), false);
  assert.equal(canTransition('SHIPPED', 'CANCELLED', 'FULFILLMENT_STAFF'), false);
});
