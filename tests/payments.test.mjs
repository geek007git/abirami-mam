import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {verifyCheckoutSignature,verifyWebhookSignature} from '../backend/payments.mjs';

test('checkout signature binds both provider IDs',()=>{
  const secret='test-secret',order='order_123',payment='pay_456';
  const signature=crypto.createHmac('sha256',secret).update(`${order}|${payment}`).digest('hex');
  assert.equal(verifyCheckoutSignature(order,payment,signature,secret),true);
  assert.equal(verifyCheckoutSignature(order,'pay_other',signature,secret),false);
});

test('webhook signature verifies exact raw payload',()=>{
  const secret='test-webhook',raw='{"event":"payment.captured"}';
  const signature=crypto.createHmac('sha256',secret).update(raw).digest('hex');
  assert.equal(verifyWebhookSignature(raw,signature,secret),true);
  assert.equal(verifyWebhookSignature(raw+' ',signature,secret),false);
});
