import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const temporary = await mkdtemp(path.join(tmpdir(), 'vs-store-test-'));
process.env.NODE_ENV = 'test';
process.env.LOCAL_STORE_FILE = path.join(temporary, 'store.json');
const { api } = await import('../server.mjs');

async function call(method, pathname, input) {
  const raw = input === undefined ? '' : JSON.stringify(input);
  const req = {
    method,
    headers: {},
    async *[Symbol.asyncIterator]() { if (raw) yield raw; },
  };
  const res = {
    writeHead(status) { this.status = status; },
    end(value) { this.body = JSON.parse(value); },
  };
  await api(req, res, new URL(pathname, 'http://localhost'));
  return { status: res.status, body: res.body };
}

test.after(async () => rm(temporary, { recursive: true, force: true }));

test('preview configuration keeps checkout closed in the storefront', async () => {
  const response = await call('GET', '/api/config');
  assert.equal(response.status, 200);
  assert.equal(response.body.storeLive, false);
  assert.equal(response.body.onlinePayments, false);
});

test('quote rejects invalid quantities and repeated lines exceeding stock', async () => {
  for (const quantity of [0, -1, 1.5, 21, '2']) {
    const response = await call('POST', '/api/checkout/quote', { items: [{ variantId: 'palm-jaggery', quantity }] });
    assert.equal(response.status, 400);
  }
  const response = await call('POST', '/api/checkout/quote', { items: [
    { variantId: 'palm-jaggery', quantity: 20 },
    { variantId: 'palm-jaggery', quantity: 5 },
  ] });
  assert.equal(response.status, 409);
});

test('local checkout rejects fake online orders and keeps inventory intact', async () => {
  const customer = { name: 'Test Buyer', email: 'buyer@example.com' };
  const address = { pin: '600001' };
  const items = [{ variantId: 'palm-jaggery', quantity: 1 }];
  const online = await call('POST', '/api/orders', { items, customer, address, paymentMethod: 'online' });
  assert.equal(online.status, 503);
  const before = await call('GET', '/api/catalog/products');
  assert.equal(before.body.items.find(item => item.id === 'palm-jaggery').stock, 24);
  const invalid = await call('POST', '/api/orders', { items: [{ variantId: 'palm-jaggery', quantity: 0 }], customer, address, paymentMethod: 'cod' });
  assert.equal(invalid.status, 400);
  const cod = await call('POST', '/api/orders', { items, customer, address, paymentMethod: 'cod' });
  assert.equal(cod.status, 201);
  assert.equal(cod.body.status, 'PLACED');
  const after = await call('GET', '/api/catalog/products');
  assert.equal(after.body.items.find(item => item.id === 'palm-jaggery').stock, 23);
  const tracked = await call('GET', `/api/orders/track?token=${cod.body.trackingToken}`);
  assert.equal(tracked.body.orderNumber, cod.body.orderNumber);
});
